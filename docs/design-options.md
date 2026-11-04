# Design options

Alternatives we built and tried, kept so we can switch or come back to them. Everything below is still in the code and selectable in the menu-bar menu unless marked otherwise.

## Crab dances (Menu bar → Crab → Dance)

What the crab does while sessions run. Chosen default: **Walkabout** (calm, reads as "working"). Code: `src/renderer/src/crab.ts` (`DANCES`).

| Dance | Movement | Notes |
| --- | --- | --- |
| Walkabout (`walk`) | Strolls back and forth across the icon, pupils looking where it goes, legs stepping every frame | Default |
| Scuttle (`scuttle`) | One-pixel side-to-side shuffle, legs stepping in pairs | Most subtle; the first version |
| Disco (`disco`) | Bounces to the beat, one claw up and the other down, eyes following | Most "dancey", very readable at 18 px |
| Clap (`clap`) | Claps above its head, dipping and squinting on each clap | Very visible, a bit busy |
| Jump (`jump`) | Squash, hop with legs dangling, squash on landing | A low hop: a higher jump pushed the claws out of the icon |
| Shimmy (`shimmy`) | The body wobbles row by row like a wave, claws and legs alternating | Playful, slightly noisy at small size |
| Pinch (`pinch`) | Pincers snap open and shut in turn, eyes look at the open one | Has real two-pronged pincers |

In every dance, a session that waits for you while others run makes the crab raise both claws and widen its eyes. With nothing running: asleep ("z") with nothing waiting, or puzzled ("?") when a session waits.

## Menu-bar icons (Menu bar → Icon)

Crab (default), octopus (same moods, with tentacles), heartbeat line, twin limit rings, spark, signal bars, or text only. All are template images so macOS tints them like its own icons. A coloured (orange) waiting accent was dropped: it can't be tinted, so it came out white on a light menu bar.

## Panel looks

- **Themes:** Glass (native vibrancy) or Terminal HUD.
- **Horizontal layouts:** chips with a detail drawer (default), status segments, or a thin ticker.
- **Rows:** comfortable (two lines) or compact (one line).
- **Corners:** macOS rounded (default) or square.
- **Placement:** gap to the screen edge 0/4/8 px, and snap over a side Dock.

## Features (Features menu)

Pace forecast, pending question with snooze, time sessions waited on you, quick switcher on ⌃⌥C. All on by default; switch any off to compare.
