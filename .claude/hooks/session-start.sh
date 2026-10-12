#!/bin/bash
# SessionStart hook for Claude Code cloud sessions (decided 2026-10-12, plan review Q9).
# Cloud containers ship Node 22 and a Chromium that Playwright's pinned version may not expect.
# This installs the pinned Node and npm, installs dependencies, and points Playwright at the
# Chromium the container already has when its own pinned build is missing. Idempotent; local
# sessions (no CLAUDE_CODE_REMOTE) are left alone.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$ROOT"

NODE_VERSION="$(tr -d 'v[:space:]' < .nvmrc)"
NPM_VERSION="$(node -p "require('./package.json').packageManager.split('@')[1]")"
CACHE="${HOME}/.cache/story-generator"
NODE_DIR="${CACHE}/node-v${NODE_VERSION}-linux-x64"

if [ ! -x "${NODE_DIR}/bin/node" ]; then
  mkdir -p "$CACHE"
  echo "Installing Node ${NODE_VERSION}…"
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    | tar -xJ -C "$CACHE"
fi
export PATH="${NODE_DIR}/bin:${PATH}"

if [ "$(npm -v)" != "$NPM_VERSION" ]; then
  echo "Installing npm ${NPM_VERSION}…"
  npm install --global "npm@${NPM_VERSION}" --silent
fi

# Persist for every command the session runs.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"${NODE_DIR}/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

echo "Installing dependencies…"
npm install --no-audit --no-fund --silent

# Playwright: use the container's Chromium when the pinned build isn't installed.
BROWSERS="${PLAYWRIGHT_BROWSERS_PATH:-}"
if [ -n "$BROWSERS" ] && [ -d "$BROWSERS" ]; then
  WANT="$(node -p "JSON.parse(require('fs').readFileSync('node_modules/playwright-core/browsers.json','utf8')).browsers.find(b => b.name === 'chromium').revision" 2>/dev/null || true)"
  if [ -n "$WANT" ] && [ ! -d "${BROWSERS}/chromium-${WANT}" ]; then
    HAVE="$(ls -d "${BROWSERS}"/chromium-[0-9]*/chrome-linux/chrome 2>/dev/null | sort -V | tail -n 1 || true)"
    if [ -n "$HAVE" ]; then
      echo "Playwright wants chromium-${WANT}; using ${HAVE}"
      if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
        echo "export PLAYWRIGHT_CHROMIUM_PATH=\"${HAVE}\"" >> "$CLAUDE_ENV_FILE"
      fi
    fi
  fi
fi

echo "Session ready: node $(node -v), npm $(npm -v)"
