#!/bin/sh
# Installs the freshly packaged app into /Applications and starts it.
# Run via `yarn install-app` from the repo root (it packages first). It quits running copies of the
# app and replaces /Applications/Agent Pulse.app; nothing else is touched.
set -eu

APP="Agent Pulse.app"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# electron-builder names its output folder after the architecture.
case "$(uname -m)" in
  arm64) SRC="$ROOT/release/mac-arm64/$APP" ;;
  *) SRC="$ROOT/release/mac/$APP" ;;
esac
DEST="/Applications/$APP"

[ -d "$SRC" ] || { echo "No packaged app at $SRC; run yarn package first." >&2; exit 1; }

# Quit any running copy (installed, packaged in place, or this checkout's dev build) so the new one takes over.
pkill -f "$APP/Contents/MacOS/Agent Pulse" 2>/dev/null || true
pkill -f "$ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" 2>/dev/null || true
sleep 1

rm -rf "$DEST"
ditto "$SRC" "$DEST"
open "$DEST"
echo "Installed and started $DEST"
