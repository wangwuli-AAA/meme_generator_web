# Meme Web

统一的表情包生成器 Web 应用，整合了 5 个仓库的 800+ 个表情包模板。

## 包含表情来源

| 来源 | 数量 | 说明 |
|------|------|------|
| [meme-generator](https://github.com/MemeCrafters/meme-generator) | 282 | 核心表情库 |
| [meme-generator-contrib](https://github.com/MemeCrafters/meme-generator-contrib) | 13 | 社区扩展 |
| [crazy_emoji](https://github.com/anyliew/crazy_emoji) | 36 | NSFW 扩展 |
| [meme_emoji](https://github.com/anyliew/meme_emoji) | 385 | 通用扩展 |
| [tudou-meme](https://github.com/LRZ9712/tudou-meme) | 115 | 手工扩展 |

## 快速开始

### Docker（推荐）

```bash
docker build -t meme-web:latest .
docker run -d --name meme-web -p 2233:2233 meme-web:latest
```

访问 http://localhost:2233/

使用 docker-compose：

```bash
docker compose -f docker/docker-compose.yml up -d
```

### 本地运行

```bash
# 创建 conda 环境
conda create -n meme-web python=3.10 -y
conda activate meme-web

# 安装依赖
pip install meme-generator==0.1.14 toml pycairo -i https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple

# 下载核心表情资源
meme download

# 启动（Linux/WSL 下限制 glibc 内存分配 arena，降低常驻内存）
MALLOC_ARENA_MAX=2 python server.py
```

在 Conda 环境中可通过 `conda env config vars set MALLOC_ARENA_MAX=2` 持久化该配置，重新激活环境后生效。

## 功能

- 浏览 800+ 个表情包模板
- 按关键词搜索
- 上传图片 + 填写文字生成表情
- 支持拖拽上传、粘贴上传
- 自动生成参数表单
- 预览 & 下载
- 响应式布局，支持手机端

## 项目结构

```
meme-web/
├── server.py              # 统一入口
├── Dockerfile
├── memes/
│   ├── builtin/           # 核心表情（282个）
│   ├── contrib/           # 社区扩展（13个）
│   ├── crazy_emoji/       # NSFW扩展（36个）
│   ├── meme_emoji/        # 通用扩展（385个）
│   └── tudou_meme/        # 手工扩展（115个）
├── resources/fonts/       # 字体文件
├── webapp/                # 前端（纯 HTML/JS/CSS）
└── docker/                # Docker 配置
```

## 添加新表情

在 `memes/` 下任意子目录中创建 Python 包，`__init__.py` 中调用 `add_meme()` 注册即可。参考 [meme-generator 文档](https://github.com/MemeCrafters/meme-generator/wiki)。

## API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/memes/list?search=&page=&page_size=` | GET | 分页搜索 |
| `/memes/keys` | GET | 所有表情 key |
| `/memes/{key}/info` | GET | 表情详情 |
| `/memes/{key}/preview` | GET | 预览图 |
| `/memes/{key}/` | POST | 生成表情（multipart: images, texts, args） |

## 感谢

本项目的表情素材和代码来自以下开源项目，感谢所有开发者的贡献：

- [meme-generator](https://github.com/MemeCrafters/meme-generator) — 核心引擎，作者 [MeetWq](https://github.com/MeetWq)
- [meme-generator-contrib](https://github.com/MemeCrafters/meme-generator-contrib) — 社区扩展
- [meme_emoji](https://github.com/anyliew/meme_emoji) — 通用表情扩展，作者 [anyliew](https://github.com/anyliew)
- [crazy_emoji](https://github.com/anyliew/crazy_emoji) — NSFW 表情扩展
- [tudou-meme](https://github.com/LRZ9712/tudou-meme) — 手工表情扩展，作者 [LRZ9712](https://github.com/LRZ9712)
- [nonebot-plugin-petpet](https://github.com/noneplugin/nonebot-plugin-petpet) — 原始表情库
- [nonebot-plugin-memes](https://github.com/noneplugin/nonebot-plugin-memes) — 表情插件

表情素材均来自网络，如有侵权请联系删除。

## 许可

MIT
