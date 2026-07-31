FROM python:3.10-slim

WORKDIR /app

# 使用清华镜像源
RUN echo "deb https://mirrors.tuna.tsinghua.edu.cn/debian/ trixie main contrib non-free non-free-firmware\ndeb https://mirrors.tuna.tsinghua.edu.cn/debian/ trixie-updates main contrib non-free non-free-firmware\ndeb https://security.debian.org/debian-security trixie-security main contrib non-free non-free-firmware" > /etc/apt/sources.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        fonts-noto-color-emoji \
        libgl1 \
        libglx-mesa0 \
        libegl1 \
        libglib2.0-0 \
        fontconfig \
        libcairo2-dev \
        pkg-config \
        gcc \
    && rm -rf /var/lib/apt/lists/*

COPY resources/fonts/ /usr/share/fonts/meme-fonts/
RUN fc-cache -fv

COPY pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip -i https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple \
    && pip install --no-cache-dir -i https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple \
        meme-generator==0.1.14 toml pycairo \
    && apt-get purge -y --auto-remove gcc pkg-config

COPY memes/ memes/
COPY webapp/ webapp/
COPY docker/ docker/
COPY server.py .

ENV LANG=en_US.UTF-8 \
    MALLOC_ARENA_MAX=2
EXPOSE 2233

CMD ["/app/docker/start.sh"]
