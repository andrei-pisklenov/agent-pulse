# Agent Pulse

A macOS menu-bar app (Electron, React, TypeScript, Yarn 4). People run it from `/Applications/Agent Pulse.app`, built
from this checkout; there is no prebuilt download. These instructions are for any coding agent working in this repo.

## Installing the app

If someone has just cloned the repo, or asks you to set it up, and `/Applications/Agent Pulse.app` doesn't exist yet,
offer to build and install it. First check the requirements in the README's Install section: an Apple Silicon Mac,
Node.js 22.12 or later with Yarn through Corepack, and Claude Code signed in. Ask before installing anything
system-wide. Then run `yarn install` and `yarn install-app` from the repo root.

## Updating the app

"Update Agent Pulse", "update the app", or just "update it" with nothing else in view, means: bring the installed app
up to date with GitHub. Run `yarn update` from the repo root. It pulls `main`, and when something new came in it
reinstalls the app and lists the new commits; otherwise it says the app is already up to date. It stops without
changing anything when the checkout has uncommitted changes or isn't on `main`: then tell the person, and ask what
to do. Don't stash, reset or switch branches on your own. Yarn runs scripts only after a first `yarn install`, so in a
checkout that was never installed, follow the install steps above instead. A checkout from before `yarn update`
existed doesn't have it yet: run `git pull --ff-only` once, then `yarn update`.

Settings and usage history live in `~/Library/Application Support/agent-pulse`, so they survive installs and updates.

## Running it while developing

`yarn dev` runs the app with hot reload. Only one copy runs at a time, so quit the installed app first
(`osascript -e 'quit app "Agent Pulse"'`), and start it again with `open -a "Agent Pulse"` when you're done.
`yarn install-app` also quits a running `yarn dev` build.

## Before you commit

Run `yarn lint`, `yarn typecheck` and `yarn test` from the repo root. ESLint is also the formatter, so `yarn lint:fix`
fixes style.
