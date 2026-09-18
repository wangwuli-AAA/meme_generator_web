#!/bin/bash
mkdir -p ~/.config/meme_generator
if [ ! -f ~/.config/meme_generator/config.toml ]; then
  cp /app/docker/config.toml.template ~/.config/meme_generator/config.toml
fi
exec python server.py
