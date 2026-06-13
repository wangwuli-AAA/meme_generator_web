import json
import os
import sys
from pathlib import Path

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

# Write config.toml BEFORE importing meme_generator (it loads at import time)
meme_dirs = []
for d in ["builtin", "contrib", "crazy_emoji", "meme_emoji", "tudou_meme"]:
    p = MEME_WEB_DIR / "memes" / d
    if p.exists():
        meme_dirs.append(str(p))

import toml

config_data = {
    "meme": {
        "load_builtin_memes": False,
        "meme_dirs": meme_dirs,
        "meme_disabled_list": [],
    }
}
_config_file.write_text(toml.dumps(config_data), encoding="utf-8")

# Now import meme_generator — triggers meme loading from config
from meme_generator import config as meme_config, get_meme_keys, get_memes
from meme_generator.app import app as core_app, register_routers
from meme_generator.log import LOGGING_CONFIG, setup_logger

from fastapi import Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

WEBAPP_DIR = MEME_WEB_DIR / "webapp"

# Use the core FastAPI app and add our customizations to it
app = core_app

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_class=HTMLResponse)
async def root():
    return FileResponse(str(WEBAPP_DIR / "index.html"))


@app.get("/memes/list")
async def list_memes(
    search: str = Query("", description="搜索关键词"),
    tag: str = Query("", description="按标签筛选"),
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
    if tag:
        memes = [m for m in memes if tag in m.tags]

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
                "tags": sorted(m.tags),
                "min_images": m.params_type.min_images,
                "max_images": m.params_type.max_images,
                "min_texts": m.params_type.min_texts,
                "max_texts": m.params_type.max_texts,
            }
            for m in items
        ],
    }


@app.get("/memes/tags")
async def list_tags():
    tag_counts: dict[str, int] = {}
    for meme in get_memes():
        for tag in meme.tags:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    return sorted(
        [{"tag": t, "count": c} for t, c in tag_counts.items()],
        key=lambda x: -x["count"],
    )


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
