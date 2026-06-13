#!/bin/bash
mkdir -p ~/.config/meme_generator
cp /app/docker/config.toml.template ~/.config/meme_generator/config.toml
exec python server.py
