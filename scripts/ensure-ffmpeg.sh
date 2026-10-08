#!/usr/bin/env bash
set -euo pipefail

if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
  printf 'FFmpeg and ffprobe are already available; skipping apt downloads.\n'
else
  printf 'Missing FFmpeg tools; installing required packages only.\n'
  sudo timeout --signal=TERM --kill-after=10s 120s apt-get \
    -o Acquire::Retries=0 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20 update -q
  sudo timeout --signal=TERM --kill-after=10s 180s apt-get \
    -o Acquire::Retries=0 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20 \
    install -y --no-install-recommends ffmpeg
fi

command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
ffmpeg -version | sed -n '1p'
ffprobe -version | sed -n '1p'
