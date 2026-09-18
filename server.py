import base64
import binascii
import asyncio
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import sys
import time
from collections import deque
from pathlib import Path
from typing import Any, Optional

MEME_WEB_DIR = Path(__file__).parent.resolve()

# Determine config path (same logic as meme_generator.dirs)
if sys.platform.startswith("win"):
    _config_dir = Path(os.environ.get("APPDATA", "")) / "meme_generator"
elif sys.platform == "darwin":
    _config_dir = Path.home() / "Library" / "Application Support" / "meme_generator"
else:
    _config_dir = (
        Path(os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config")))
        / "meme_generator"
    )

_config_dir.mkdir(parents=True, exist_ok=True)
_config_file = _config_dir / "config.toml"

AUTH_USERNAME = os.environ.get("MEME_WEB_USERNAME", "nini")
AUTH_PASSWORD = os.environ.get("MEME_WEB_PASSWORD", "nini")
MEME_WEB_ENV = os.environ.get("MEME_WEB_ENV", "development").lower()
SESSION_COOKIE_NAME = "meme_web_session"
SESSION_MAX_AGE = 3 * 24 * 60 * 60
SESSION_COOKIE_SECURE = MEME_WEB_ENV == "production" or os.environ.get(
    "MEME_WEB_COOKIE_SECURE", ""
).lower() in {"1", "true", "yes"}
MAX_REQUEST_BYTES = int(os.environ.get("MEME_WEB_MAX_REQUEST_BYTES", 20 * 1024 * 1024))
MAX_GENERATION_CONCURRENCY = max(
    1, int(os.environ.get("MEME_WEB_MAX_GENERATION_CONCURRENCY", "2"))
)
GENERATION_QUEUE_TIMEOUT = max(
    1.0, float(os.environ.get("MEME_WEB_GENERATION_QUEUE_TIMEOUT", "30"))
)
logger = logging.getLogger("meme_web")


def _load_session_secret() -> str:
    configured_secret = os.environ.get("MEME_WEB_SESSION_SECRET")
    if configured_secret:
        return configured_secret

    secret_file = _config_dir / "web_session_secret"
    try:
        secret = secret_file.read_text(encoding="utf-8").strip()
        if secret:
            return secret
    except OSError:
        pass

    secret = secrets.token_urlsafe(32)
    try:
        secret_file.write_text(secret, encoding="utf-8")
        if not sys.platform.startswith("win"):
            secret_file.chmod(0o600)
    except OSError:
        # A process-local secret still protects the running instance when the
        # configuration directory is read-only.
        pass
    return secret


SESSION_SECRET = _load_session_secret()
PUBLIC_MEME_INFO_PATH = re.compile(r"^/memes/[^/]+/info$")
PUBLIC_PREVIEW_PATH = re.compile(r"^/memes/[^/]+/preview$")

# Write config.toml BEFORE importing meme_generator (it loads at import time)
meme_dirs = []
for d in ["builtin", "contrib", "crazy_emoji", "meme_emoji", "tudou_meme"]:
    p = MEME_WEB_DIR / "memes" / d
    if p.exists():
        meme_dirs.append(str(p))

import toml

try:
    config_data = toml.load(_config_file)
except (OSError, toml.TomlDecodeError):
    config_data = {}

meme_config_data = config_data.setdefault("meme", {})
meme_config_data["load_builtin_memes"] = False
meme_config_data["meme_dirs"] = meme_dirs
meme_config_data.setdefault("meme_disabled_list", [])
serialized_config = toml.dumps(config_data)
try:
    existing_config = _config_file.read_text(encoding="utf-8")
except OSError:
    existing_config = ""
if existing_config != serialized_config:
    _config_file.write_text(serialized_config, encoding="utf-8")

# Now import meme_generator — triggers meme loading from config
from meme_generator import config as meme_config, get_memes
from meme_generator.app import app as core_app, register_routers
from meme_generator.log import LOGGING_CONFIG, setup_logger

from fastapi import Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

WEBAPP_DIR = MEME_WEB_DIR / "webapp"
MAX_SEARCH_LENGTH = 100
LIST_CACHE_TTL = max(1.0, float(os.environ.get("MEME_WEB_LIST_CACHE_TTL", "15")))
LIST_CACHE_MAX_ITEMS = 128
_list_cache: dict[tuple[str, int, int], tuple[float, dict[str, Any]]] = {}
_login_failures: dict[str, deque[float]] = {}
_generation_semaphore = asyncio.Semaphore(MAX_GENERATION_CONCURRENCY)


def _build_meme_index() -> tuple[dict[str, Any], ...]:
    """Build a small immutable index so list/search requests do no registry work."""
    index = []
    for meme in get_memes():
        keywords = tuple(meme.keywords)
        index.append(
            {
                "key": meme.key,
                "keywords": keywords,
                "search_text": " ".join((meme.key, *keywords)).casefold(),
                "min_images": meme.params_type.min_images,
                "max_images": meme.params_type.max_images,
                "min_texts": meme.params_type.min_texts,
                "max_texts": meme.params_type.max_texts,
            }
        )
    return tuple(index)


MEME_INDEX = _build_meme_index()
MEME_INDEX_ETAG = '"meme-index-' + hashlib.sha256(
    "\n".join(item["key"] for item in MEME_INDEX).encode("utf-8")
).hexdigest()[:16] + '"'
STARTED_AT = time.time()
_request_metrics: dict[str, dict[str, float]] = {}


def _request_etag(request: Request) -> str:
    """Return an ETag scoped to the immutable index and requested resource."""
    scope = request.url.path
    if request.url.path == "/memes/list":
        scope += "?" + request.url.query
    elif PUBLIC_MEME_INFO_PATH.fullmatch(request.url.path):
        scope += "?" + request.url.query
    elif PUBLIC_PREVIEW_PATH.fullmatch(request.url.path):
        scope += "?" + request.url.query
    digest = hashlib.sha256(f"{MEME_INDEX_ETAG}:{scope}".encode("utf-8")).hexdigest()[:16]
    return f'"meme-{digest}"'

# Use the core FastAPI app and add our customizations to it
app = core_app

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.environ.get("MEME_WEB_CORS_ORIGINS", "").split(",")
        if origin.strip()
    ],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


def _urlsafe_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _urlsafe_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _create_session_token() -> str:
    payload = json.dumps(
        {
            "sub": AUTH_USERNAME,
            "exp": int(time.time()) + SESSION_MAX_AGE,
        },
        separators=(",", ":"),
    ).encode("utf-8")
    encoded_payload = _urlsafe_encode(payload)
    signature = hmac.new(
        SESSION_SECRET.encode("utf-8"),
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{encoded_payload}.{_urlsafe_encode(signature)}"


def _get_session_user(request: Request) -> Optional[str]:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return None
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
        expected_signature = hmac.new(
            SESSION_SECRET.encode("utf-8"),
            encoded_payload.encode("ascii"),
            hashlib.sha256,
        ).digest()
        actual_signature = _urlsafe_decode(encoded_signature)
        if not hmac.compare_digest(actual_signature, expected_signature):
            return None
        payload = json.loads(_urlsafe_decode(encoded_payload))
        if payload.get("sub") != AUTH_USERNAME:
            return None
        if int(payload.get("exp", 0)) <= int(time.time()):
            return None
        return payload["sub"]
    except (
        ValueError,
        TypeError,
        KeyError,
        json.JSONDecodeError,
        UnicodeError,
        binascii.Error,
    ):
        return None


@app.middleware("http")
async def require_login(request: Request, call_next):
    started = time.perf_counter()
    path = request.url.path
    public_path = path in {
        "/",
        "/login",
        "/favicon.ico",
        "/auth/login",
        "/auth/logout",
        "/auth/me",
        "/health",
    }
    public_asset = path.startswith("/static/")
    public_preview = (
        request.method == "GET" and PUBLIC_PREVIEW_PATH.fullmatch(path) is not None
    )
    public_meme_list = request.method == "GET" and path == "/memes/list"
    public_meme_info = (
        request.method == "GET" and PUBLIC_MEME_INFO_PATH.fullmatch(path) is not None
    )
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            request_size = int(content_length)
        except ValueError:
            request_size = 0
        if request_size > MAX_REQUEST_BYTES:
            return JSONResponse(
                status_code=413,
                content={"detail": "上传内容超过大小限制"},
                headers={"Cache-Control": "no-store"},
            )

    if not (
        public_path
        or public_asset
        or public_preview
        or public_meme_list
        or public_meme_info
        or _get_session_user(request)
    ):
        return JSONResponse(
            status_code=401,
            content={"detail": "请先登录"},
            headers={"Cache-Control": "no-store"},
        )

    is_generation = (
        request.method == "POST"
        and path.startswith("/memes/")
        and path.endswith("/")
    )
    if is_generation:
        try:
            await asyncio.wait_for(
                _generation_semaphore.acquire(), timeout=GENERATION_QUEUE_TIMEOUT
            )
        except asyncio.TimeoutError:
            return JSONResponse(
                status_code=429,
                content={"detail": "生成任务较多，请稍后重试"},
                headers={"Retry-After": "5", "Cache-Control": "no-store"},
            )
    cacheable_get = request.method == "GET" and (
        path == "/memes/list"
        or PUBLIC_MEME_INFO_PATH.fullmatch(path)
        or PUBLIC_PREVIEW_PATH.fullmatch(path)
    )
    request_etag = _request_etag(request) if cacheable_get else None
    if request_etag and request.headers.get("if-none-match") == request_etag:
        return Response(status_code=304, headers={"ETag": request_etag})

    try:
        response = await call_next(request)
    finally:
        if is_generation:
            _generation_semaphore.release()

    elapsed_ms = (time.perf_counter() - started) * 1000
    metric = _request_metrics.setdefault(
        path, {"count": 0, "errors": 0, "total_ms": 0, "max_ms": 0}
    )
    metric["count"] += 1
    metric["total_ms"] += elapsed_ms
    metric["max_ms"] = max(metric["max_ms"], elapsed_ms)
    if response.status_code >= 500:
        metric["errors"] += 1
    response.headers["X-Response-Time-Ms"] = f"{elapsed_ms:.1f}"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "same-origin"
    if request_etag:
        response.headers["ETag"] = request_etag
        response.headers["Cache-Control"] = "public, max-age=15, stale-while-revalidate=60"
    if public_preview and response.status_code == 200:
        response.headers["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=3600"
    elif public_asset:
        response.headers["Cache-Control"] = "public, max-age=3600"
    elif public_meme_list or public_meme_info:
        response.headers["Cache-Control"] = "public, max-age=15, stale-while-revalidate=60"
    elif not public_asset:
        response.headers["Cache-Control"] = "no-store"
    if elapsed_ms > 1000:
        logger.warning("slow request path=%s status=%s duration_ms=%.1f", path, response.status_code, elapsed_ms)
    return response


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)


@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    if not _get_session_user(request):
        return RedirectResponse(url="/login", status_code=302)
    return FileResponse(str(WEBAPP_DIR / "index.html"))


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    if _get_session_user(request):
        return RedirectResponse(url="/", status_code=302)
    return FileResponse(str(WEBAPP_DIR / "login.html"))


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)


@app.post("/auth/login")
async def login(request: Request, credentials: LoginRequest):
    client_key = request.client.host if request.client else "unknown"
    now = time.time()
    failures = _login_failures.setdefault(client_key, deque())
    while failures and now - failures[0] > 60:
        failures.popleft()
    if len(failures) >= 10:
        return JSONResponse(
            status_code=429,
            content={"detail": "登录尝试过于频繁，请稍后重试"},
            headers={"Retry-After": "60", "Cache-Control": "no-store"},
        )
    username_matches = secrets.compare_digest(credentials.username, AUTH_USERNAME)
    password_matches = secrets.compare_digest(credentials.password, AUTH_PASSWORD)
    if not (username_matches and password_matches):
        failures.append(now)
        return JSONResponse(status_code=401, content={"detail": "账号或密码错误"})
    _login_failures.pop(client_key, None)

    response = JSONResponse({"authenticated": True})
    response.set_cookie(
        SESSION_COOKIE_NAME,
        _create_session_token(),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=SESSION_COOKIE_SECURE,
        path="/",
    )
    return response


@app.get("/auth/me")
async def auth_me(request: Request):
    user = _get_session_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"authenticated": False})
    return {"authenticated": True}


@app.post("/auth/logout")
async def logout():
    response = JSONResponse({"authenticated": False})
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return response


@app.get("/health", include_in_schema=False)
async def health():
    return {
        "status": "ok",
        "memes_loaded": len(MEME_INDEX),
        "uptime_seconds": round(time.time() - STARTED_AT, 1),
        "requests": sum(int(item["count"]) for item in _request_metrics.values()),
    }


@app.get("/memes/list")
async def list_memes(
    search: str = Query("", max_length=MAX_SEARCH_LENGTH, description="搜索关键词"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
):
    cache_key = (search.casefold().strip(), page, page_size)
    cached = _list_cache.get(cache_key)
    now = time.monotonic()
    if cached and cached[0] > now:
        return cached[1]

    q = cache_key[0]
    memes = tuple(item for item in MEME_INDEX if not q or q in item["search_text"])
    total = len(memes)
    start = (page - 1) * page_size
    items = memes[start : start + page_size]

    result = {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "key": item["key"],
                "keywords": item["keywords"],
                "min_images": item["min_images"],
                "max_images": item["max_images"],
                "min_texts": item["min_texts"],
                "max_texts": item["max_texts"],
            }
            for item in items
        ],
    }
    if len(_list_cache) >= LIST_CACHE_MAX_ITEMS:
        _list_cache.pop(next(iter(_list_cache)))
    _list_cache[cache_key] = (now + LIST_CACHE_TTL, result)
    return result


def init():
    setup_logger()
    if AUTH_USERNAME == "nini" or AUTH_PASSWORD == "nini":
        message = "默认登录凭据仍在使用，请设置 MEME_WEB_USERNAME 和 MEME_WEB_PASSWORD"
        if MEME_WEB_ENV == "production":
            raise RuntimeError(message)
        logger.warning(message)
    register_routers()
    app.mount("/static", StaticFiles(directory=str(WEBAPP_DIR)), name="static")

    meme_count = len(MEME_INDEX)
    logger.info("loaded_memes=%s", meme_count)
    logger.info("web_ui=http://%s:%s/", meme_config.server.host, meme_config.server.port)


init()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=meme_config.server.host,
        port=meme_config.server.port,
        log_config=LOGGING_CONFIG,
        reload=False,
    )
