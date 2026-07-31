import base64
import binascii
import hashlib
import hmac
import json
import os
import secrets
import sys
import time
from pathlib import Path
from typing import Optional

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
SESSION_COOKIE_NAME = "meme_web_session"
SESSION_MAX_AGE = 3 * 24 * 60 * 60
SESSION_COOKIE_SECURE = os.environ.get("MEME_WEB_COOKIE_SECURE", "").lower() in {
    "1",
    "true",
    "yes",
}


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

config_data["meme"] = {
    "load_builtin_memes": False,
    "meme_dirs": meme_dirs,
    "meme_disabled_list": [],
}
_config_file.write_text(toml.dumps(config_data), encoding="utf-8")

# Now import meme_generator — triggers meme loading from config
from meme_generator import config as meme_config, get_meme_keys, get_memes
from meme_generator.app import app as core_app, register_routers
from meme_generator.log import LOGGING_CONFIG, setup_logger

from fastapi import Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

WEBAPP_DIR = MEME_WEB_DIR / "webapp"

# Use the core FastAPI app and add our customizations to it
app = core_app

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
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
    path = request.url.path
    public_path = path in {"/", "/auth/login", "/auth/logout", "/auth/me"}
    public_asset = path.startswith("/static/")
    if public_path or public_asset or _get_session_user(request):
        return await call_next(request)
    return JSONResponse(status_code=401, content={"detail": "请先登录"})


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)


@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    page = "index.html" if _get_session_user(request) else "login.html"
    return FileResponse(str(WEBAPP_DIR / page))


@app.post("/auth/login")
async def login(credentials: LoginRequest):
    username_matches = secrets.compare_digest(credentials.username, AUTH_USERNAME)
    password_matches = secrets.compare_digest(credentials.password, AUTH_PASSWORD)
    if not (username_matches and password_matches):
        return JSONResponse(status_code=401, content={"detail": "账号或密码错误"})

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


@app.get("/memes/list")
async def list_memes(
    search: str = Query("", description="搜索关键词"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
):
    memes = get_memes()
    if search:
        q = search.lower()
        memes = [
            m
            for m in memes
            if q in m.key.lower() or any(q in kw.lower() for kw in m.keywords)
        ]
    total = len(memes)
    start = (page - 1) * page_size
    items = memes[start : start + page_size]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "key": m.key,
                "keywords": m.keywords,
                "min_images": m.params_type.min_images,
                "max_images": m.params_type.max_images,
                "min_texts": m.params_type.min_texts,
                "max_texts": m.params_type.max_texts,
            }
            for m in items
        ],
    }


def init():
    setup_logger()
    register_routers()
    app.mount("/static", StaticFiles(directory=str(WEBAPP_DIR)), name="static")

    meme_count = len(get_meme_keys())
    print(f"Loaded {meme_count} memes")
    print(f"Web UI: http://{meme_config.server.host}:{meme_config.server.port}/")


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
