# Agent Pulse

**A tiny always-on-top panel for your Mac that shows what every Claude Code session is doing, and which one is waiting for you.**

<p align="center">
  <img src="docs/media/panel.png" alt="A Mac desktop with a terminal on the left and the Agent Pulse panel on the right edge. The panel shows session and weekly limit bars, then sessions grouped into Needs input, Running and Finished. A pixel crab in the menu bar shows the same counts." width="100%">
</p>

If you run several Claude Code sessions at once, in a terminal, in the Claude desktop app and in VS Code, you end up clicking through them to find the one that stopped to ask you something. Agent Pulse keeps them all in one small panel at the edge of your screen, together with your plan limits and token usage, so no session sits waiting for long.

> Agent Pulse is an independent, unofficial project. It is not affiliated with, endorsed by or supported by Anthropic. Claude and Claude Code are trademarks of Anthropic, PBC, used here only to say what the app works with.

## Quick start

Paste this into Claude Code, and it builds and installs Agent Pulse for you:

```text
Install Agent Pulse for me. Clone https://github.com/andrei-pisklenov/agent-pulse into ~/agent-pulse and follow the Install section of its README. Check the requirements first, and ask me before you install anything system-wide. When you're done, check that Agent Pulse is running from /Applications.
```

Or start it from a terminal:

```bash
claude "Install Agent Pulse for me. Clone https://github.com/andrei-pisklenov/agent-pulse into ~/agent-pulse and follow the Install section of its README. Check the requirements first, and ask me before you install anything system-wide. When you're done, check that Agent Pulse is running from /Applications."
```

It takes a few minutes, most of them spent downloading Electron. To do it by hand, see [Install](#install).

## What it shows

- **Every session in one place.** Terminal `claude`, the Claude desktop app (Code tab) and the VS Code extension, grouped by what they need from you: *needs input*, *running*, *finished* (until you open it) and *idle*. Desktop sessions that ended in the last 24 hours are listed too.
- **Running Codex tasks.** Active turns from Codex Desktop appear under **Running**. Click a Codex row to open its chat.
- **What a waiting session is asking.** The question or the permission it needs, read from the end of its transcript. If it can wait, snooze it for 15 minutes.
- **Your plan limits.** The 5-hour session and weekly bars with their reset times, plus a pace forecast such as "runs out Thu 11:40" or "~84% at reset".
- **Codex in the vertical panel.** When a Codex CLI is available, the collapsed pill shows one limit for Claude and one for Codex. It prefers the 5-hour window and labels the fallback with its actual duration. Hover to see both providers’ available limits and reset times, plus Codex account token totals when available.
- **Usage providers.** Switch **Claude**, **Codex**, both or neither on under **Settings › Usage**. A provider that is off has its limits and token counts hidden and never fetched. Both are on by default, and the session list always shows every session.
- **Tokens and waiting time.** Tokens per session, today and this week, and how long sessions waited on you today. **Settings › Usage** adds 30-day totals and a chart of tokens per day for each provider.

Click a row to jump to that session. Desktop sessions open in the Claude app, VS Code sessions in VS Code, and terminal sessions bring their Terminal or iTerm tab to the front.

## Out of your way

At rest the panel shrinks to a small pill showing your limits and the three counts. Hover over it to see everything. Drag it anywhere: it snaps to screen edges and corners, and it stands upright on the sides.

While the Dock is showing, the pill matches its size by default, so it lines up with the Dock's icons and follows when you resize the Dock. To pick a size yourself, switch off **Match the Dock's size** in **Settings › Panel** and drag the slider; the pill on your screen and the preview next to the slider follow as you go.

<p align="center">
  <img src="docs/media/pill.png" alt="The panel at rest: a slim pill on the right edge with two limit rings (42 and 63 percent) and counts of 1 waiting, 2 running and 1 finished." width="260">
</p>

Snap it to the top or bottom of the screen and it becomes a strip:

<p align="center">
  <img src="docs/media/strip.png" alt="The panel as a horizontal strip under the menu bar, with limit bars on the left and one chip per session." width="100%">
</p>

## The menu-bar crab

<p align="center">
  <img src="docs/media/menubar.gif" alt="The menu bar: a pixel crab walking back and forth with its claws raised, next to the counts !1 ▶2 ✓1." width="300">
</p>

A pixel crab in the menu bar tells you the same thing at a glance. The counts next to it are sessions that need input `!`, are running `▶` and have finished `✓`. It sleeps when there is nothing to do, looks puzzled when a session needs you, gets to work while sessions run, and waves when one of them needs you. Click it for a short menu: your 5-hour and weekly limits and when they reset, the sessions that need you, a few quick switches and **Settings…**.

<p align="center">
  <img src="docs/media/crab-moods.gif" alt="Four crab moods: asleep with a Z, puzzled with a question mark, working, and waving with both claws up." width="100%">
</p>

While sessions work, it dances. Pick your favourite in **Settings › Menu bar**, where a preview plays each dance:

<p align="center">
  <img src="docs/media/crab-dances.gif" alt="Seven crab dances side by side: Scuttle, Disco, Clap, Jump, Shimmy, Walkabout and Pinch." width="100%">
</p>

Prefer something calmer? There is also an octopus, a heartbeat line, twin limit rings, a spark, signal bars, or plain text. The icons are template images, so macOS tints them like its own.

## Quick switcher

Press ⌃⌥C for a Spotlight-style list of your sessions. Type to filter, press ↵ to open one, ⇥ to switch between all, waiting, running and unread, and ⌘S to snooze. ⌃⌥P always shows or hides the panel.

<p align="center">
  <img src="docs/media/switcher.png" alt="The quick switcher over a terminal window: a search field, filter tabs (All 6, Needs input 1, Running 2, Unread 1) and a list of sessions with their project, app and age." width="100%">
</p>

## Make it yours

The glass theme follows macOS light and dark mode. If you prefer something denser, there is a terminal HUD theme too.

<p align="center">
  <img src="docs/media/panel-light.png" alt="The panel in light mode over a pastel wallpaper." width="49%">
  <img src="docs/media/terminal-theme.png" alt="The panel in the terminal theme: monospaced text on a dark background, with sections titled // NEEDS INPUT, // RUNNING and // FINISHED." width="49%">
</p>

You can also make rows compact, switch the strip to status segments or a thin ticker, keep a gap to the screen edge, sit over a side Dock, or use square corners. Everything is in **Settings**. [docs/design-options.md](docs/design-options.md) explains why the defaults are what they are.

## Settings and setup

Choose **Settings…** in the menu-bar menu, or in the panel's ☰ menu, for a settings window with five pages:

- **Setup** shows where your sessions come from (Claude Code in Terminal and iTerm, the Claude app, VS Code, Codex) and tests the permissions Agent Pulse needs: Automation for Terminal and iTerm, so a click brings the right tab to the front, and Notifications. macOS can't be asked quietly, so each permission has a test button; the first test makes macOS ask once, and a result that worked stays green.
- **General** has launch at login, alerts, quiet hours, the shortcuts (click one and press new keys) and what session rows show.
- **Panel** has the theme, row density, strip style, pill size and where the panel snaps.
- **Menu bar** has the icon, the crab's dance and the text next to the icon, with a live preview.
- **Usage** shows your limits with their pace forecast, token totals for today, 7 and 30 days, a chart per provider, limit warnings and how often limits are checked.

On first launch a short welcome guide walks through the same: what was found on your Mac, the two permission tests, a look for the panel and the menu bar, and the shortcuts. The settings window exists only while it is open, so it costs nothing the rest of the time.

## Alerts

Agent Pulse can notify you and ping when a session needs input, and play a sound when one finishes. In **Settings › General** you can hold an alert back until a session has waited 1, 5 or 15 minutes, so questions you answer right away don't interrupt you, and set quiet hours with no alerts or sounds. In **Settings › Usage** it can warn you once per limit window when a limit passes 80, 90 or 95%, or when the pace forecast says it will run out before it resets.

## How it works

Agent Pulse reads the files Claude Code and the Claude app already keep up to date. It asks each CLI for that provider’s plan limits.

```mermaid
flowchart LR
  live["~/.claude/sessions<br/>live status of each claude process"] --> collector
  transcripts["~/.claude/projects<br/>transcripts: tokens, pending questions"] --> collector
  desktop["Claude desktop app<br/>session titles, last opened"] --> collector
  usage["claude /usage<br/>in a hidden terminal, every 5 min while sessions run"] --> collector
  codex["codex app-server<br/>account limits and token totals"] --> collector
  collector["Collector<br/>background process"] --> panel["Panel"]
  collector --> tray["Menu-bar icon"]
```

| What | Where it comes from |
| --- | --- |
| Live status | `~/.claude/sessions/<pid>.json`, which every running Claude Code process writes (`busy` / `waiting` / `idle`) |
| Running Codex tasks | Reads thread titles and turn status from the local Codex Desktop databases. A turn with no recorded activity for 30 minutes drops off the list to clear entries left behind by an interrupted app. |
| Desktop titles, "opened since finished" | `~/Library/Application Support/Claude/claude-code-sessions/**/local_*.json` |
| Tokens | `message.usage` in `~/.claude/projects/**/*.jsonl`, read incrementally; subagents count toward their parent |
| Daily totals (30 days) | The same transcripts, summed per day once an hour into `~/Library/Application Support/agent-pulse/history.json`; only bytes added since the last run are read |
| Plan limits | Starts `claude` in a hidden pseudo-terminal, types `/usage` and reads the screen. It uses Claude Code's own sign-in, spends no model tokens and writes no transcript. |
| Codex plan limits and usage | Uses the installed Codex CLI (including the one bundled in the ChatGPT app when available) and its existing sign-in. It asks for the main Codex quota and account token totals on the limit refresh schedule. |

Token counts leave out cache reads by default, because they dwarf everything else. Switch this under **Count tokens** in **Settings › Usage**. Codex reports one total per day with cached input included, so the Usage page charts each provider on its own and never adds the two together.

**Privacy:** Claude transcripts and local token counts stay on your Mac. The Codex CLI contacts OpenAI to read account limits and aggregate token usage, which can include usage from other devices. Agent Pulse does not read Codex credentials or send conversation content.

## Install

You need:

- macOS 13 Ventura or later, on Apple Silicon. Intel Macs should work but are untested: the build lands in `release/mac/` instead of `release/mac-arm64/`, and `yarn install-app` picks the right one.
- Git. If it's missing, macOS offers to install the Xcode Command Line Tools the first time you run `git`.
- Node.js 22.12 or later, with Corepack enabled (`corepack enable`), which provides the pinned Yarn version. Node 25 and later no longer include Corepack, so run `npm install -g corepack` first.
- Claude Code, installed and signed in.

Then build and install it:

```bash
git clone https://github.com/andrei-pisklenov/agent-pulse.git
cd agent-pulse
yarn install
yarn install-app
```

`yarn install-app` builds `Agent Pulse.app`, copies it to `/Applications` and starts it. If Agent Pulse is already running, it quits it first: the installed app, a packaged copy, or this checkout's `yarn dev` build. It touches nothing else.

When it's done, the crab appears in the menu bar. To check from a terminal that the installed copy is the one running:

```bash
pgrep -fl "/Applications/Agent Pulse.app"
```

To update, ask Claude Code (or Codex) in the `agent-pulse` folder to "update Agent Pulse", or run it yourself:

```bash
yarn update
```

It pulls the latest changes from GitHub, and if there are any, rebuilds and reinstalls the app and lists what's new. It doesn't touch a checkout with uncommitted changes or one that isn't on `main`. Your settings and usage history are kept. In a checkout from before `yarn update` existed, run `git pull` once first.

To uninstall, switch off **Launch at login** in **Settings › General** if it's on, quit Agent Pulse, and delete `/Applications/Agent Pulse.app`. Its settings and state are in `~/Library/Application Support/agent-pulse`; delete that folder too to remove them.

A few things to know:

- **It's unsigned.** There is no prebuilt download, and the app you build isn't signed or notarized. A copy you build yourself opens normally. If you copy it to another Mac, Gatekeeper will block it until you allow it in System Settings → Privacy & Security.
- **Permissions.** macOS asks for **Automation** access the first time the app brings a Terminal or iTerm tab to the front, and for **Notifications** the first time it alerts you. **Settings › Setup** has a test for each, and a link to System Settings when one was refused. The app also registers the global shortcuts ⌃⌥C and ⌃⌥P; Setup shows whether another app already has them.
- **Launch at login** only works for the installed app. Switch it on in **Settings › General**; macOS lists it under System Settings → General → Login Items.
- **Settings** live in `~/Library/Application Support/agent-pulse/settings.json`.

## Good to know

- **Undocumented internals.** Agent Pulse depends on details that Anthropic doesn't document: the session files, the desktop app's session store, the `claude://code/continue` link (found by trying it out) and the layout of the `/usage` screen. A Claude update can break any of them without notice.
- **The `/usage` probe** is a real `claude` process, started in its own empty folder (`~/Library/Application Support/agent-pulse/probe`). On the first run it accepts Claude Code's "trust this folder" prompt for that folder only.
  - It starts with no MCP servers and with hooks switched off (`--strict-mcp-config`, `disableAllHooks`), since `/usage` needs neither. Your settings and plugins still load.
  - It sets `AGENT_PULSE_PROBE=1`, so a hook can skip it with `[ -n "$AGENT_PULSE_PROBE" ] && exit 0`.
  - It runs every 5 minutes while a Claude session is working, and every 20 minutes when nothing ran in between (use on claude.ai or other devices then shows up within 20 minutes). It also runs right after a limit resets. Codex limits follow the same rule with Codex tasks. Pick a different interval under **Check limits** in **Settings › Usage**.
- **Finding `claude`.** The app looks for `claude` in `~/.local/bin`, `~/.claude/local`, `/opt/homebrew/bin` and `/usr/local/bin`, then on your login shell's `PATH`.

## Development

```bash
yarn dev                 # run with hot reload
yarn test                # unit tests for the collectors
yarn lint                # ESLint is also the formatter (yarn lint:fix)
yarn typecheck
yarn snapshot --limits   # print what the collector sees right now
yarn package             # unsigned Agent Pulse.app in release/
yarn media               # re-render the screenshots and GIFs in docs/media
```

`yarn media` runs the real panel on a mock desktop with made-up sessions (`scripts/media/`), so the pictures never show your own work. It needs `ffmpeg` for the GIFs.

```
src/core       collectors, /usage probe, status tracking (plain Node, no Electron; tests in test/)
src/main       Electron main process (panel, snapping, tray, hotkeys, settings window, alerts) and the collector's utility process
src/preload    bridge between main and renderer
src/renderer   React panel, quick switcher, settings window and menu-bar icon drawing
src/shared     settings and IPC types used by main and renderer
```

## License

[MIT](LICENSE)
