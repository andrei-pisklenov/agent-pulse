#!/bin/sh
# Brings the installed Agent Pulse up to date with GitHub: pulls main, then rebuilds and reinstalls.
# Run via `yarn update` from the repo root. It stops without changing anything when the checkout
# has local changes or isn't on main, and when there is nothing new to install.
set -eu

# Everything runs from a function, so the shell has read the whole script before `git pull` can
# replace this file with a newer version.
main() {
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  APP="/Applications/Agent Pulse.app"
  cd "$ROOT"

  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$branch" != "main" ]; then
    echo "This checkout is on '$branch', not main. Switch to main to update." >&2
    exit 2
  fi
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "This checkout has uncommitted changes. Commit or discard them, then update:" >&2
    git status --short --untracked-files=no >&2
    exit 2
  fi

  old="$(git rev-parse HEAD)"
  git pull --ff-only --quiet
  new="$(git rev-parse HEAD)"

  if [ "$old" = "$new" ] && [ -d "$APP" ]; then
    echo "Agent Pulse is already up to date ($(git log -1 --format='%h %s'))."
    exit 0
  fi

  yarn install
  yarn install-app

  sleep 2
  if ! pgrep -f "$APP/Contents/MacOS/Agent Pulse" > /dev/null; then
    echo "Installed, but Agent Pulse isn't running. Start it with: open -a \"Agent Pulse\"" >&2
    exit 1
  fi
  if [ "$old" = "$new" ]; then
    echo "Installed Agent Pulse $(git log -1 --format='%h')."
  else
    echo "Updated Agent Pulse. New since the last install:"
    git log --oneline "$old..$new"
  fi
}

main "$@"
