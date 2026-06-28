# Demon Slayer — Hellscape

A self-contained 2D action browser game. You're a lone slayer holding a stone
bridge over a river of lava, cutting down waves of demons that crawl out of the
dark. Survive as long as you can and rack up a high score.

Everything — the hellscape backdrop, the lava, the characters, and the
effects — is drawn procedurally on an HTML5 `<canvas>`. There are **no external
asset files to download** and **no build step**: it's plain HTML, CSS, and
vanilla JavaScript.

## Play

Just open `index.html` in any modern browser:

```bash
# option 1: open the file directly
open index.html        # macOS
xdg-open index.html    # Linux

# option 2: serve it (recommended)
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Controls

| Action | Keys |
| --- | --- |
| Move | `A` / `D` or `←` / `→` |
| Jump | `Space` / `W` / `↑` |
| Slash | `J` or left-click |
| Dash (brief invulnerability) | `K` |
| Pause | `P` or `Esc` |

## Gameplay

- **Waves** grow in size and speed. Clear every demon in a wave to advance.
- **Enemy types:**
  - **Imp** — fast-spawning, weak, 1 hit.
  - **Hound** — very fast, low health; closes distance quickly.
  - **Brute** — slow but tanky (3 hits) and hits hard.
- **Dash** through attacks for a window of invulnerability — your main
  defensive tool.
- Your best score is saved locally in the browser.

## Project layout

```
index.html   — markup, overlays (menu / HUD / game-over)
style.css    — hellscape-themed UI styling
game.js      — game engine: input, physics, combat, waves, rendering
```

## Roadmap ideas

- Sprite/art assets for the slayer and demons (the attached concept art makes a
  great style reference).
- Sound effects and a brooding ambient track.
- Boss demon at milestone waves.
- Combo meter and special abilities.

---

Built as a foundation to iterate on — pull it open and start hacking.
