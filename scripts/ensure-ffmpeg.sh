#!/usr/bin/env bash
set -euo pipefail

if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
  printf 'FFmpeg and ffprobe are already available; skipping apt downloads.\n'
else
  printf 'Missing FFmpeg tools; installing required packages only.\n'
  # Fresh runners may need many FFmpeg libraries. Allow slower mirrors and
  # retry transient downloads, while keeping both operations time-bounded.
  sudo timeout --signal=TERM --kill-after=10s 180s apt-get \
    -o Acquire::Retries=2 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 update -q
  sudo timeout --signal=TERM --kill-after=10s 600s apt-get \
    -o Acquire::Retries=2 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 \
    install -y --no-install-recommends ffmpeg
fi

command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
ffmpeg -version | sed -n '1p'
ffprobe -version | sed -n '1p'
