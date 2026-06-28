# Demon Slayer — Hellscape

A self-contained browser action game. Play a lone slayer holding the line in a
volcanic hellscape against endless waves of demons — skeletons clawing from the
ash, imps swarming the sky, and molten brutes lumbering from the volcano's heart.

No build step, no install, no external assets. Just open it.

## Play

Open `index.html` in any modern browser (double-click it, or serve the folder).

That's it — everything (art, sound, physics) is generated in code.

## Controls

**Desktop**

| Action | Keys |
| --- | --- |
| Move | `W` `A` `S` `D` or arrow keys |
| Aim | Mouse |
| Slash | Left click or `Space` |
| Dash (brief i-frames) | `Shift` or right click |

**Touch / mobile** (controls appear automatically on first touch)

| Action | Gesture |
| --- | --- |
| Move | Drag anywhere on the **left** half — a virtual joystick follows your thumb |
| Aim + slash | Hold/drag on the **right** half — the slayer faces your thumb and auto-slashes |
| Dash | Tap the **DASH** button (bottom-right) |
| Start / retry | Tap the screen |

## Goal

Survive escalating waves. Each wave throws more — and tougher — demons at you.
Chain kills for a combo, dash through danger, and grab the green health motes
demons occasionally drop. Score is tallied per kill; the run ends when your
health hits zero. Your best score is saved locally and shown on the title and
HUD.

### Enemies

- **Skeleton** — steady melee walker. The bread and butter.
- **Imp** — fast, weaving flyer. Low health, hard to pin down.
- **Brute** — slow, heavily armored, hits hard, resists knockback. From wave 3.
- **Wraith** — hooded caster that keeps its distance and lobs homing-less
  fireballs. Deals no contact damage but punishes standing still. From wave 4.
- **Archfiend (boss)** — every 5th wave a winged boss rises with its own health
  bar, alternating a five-shot fire volley with a telegraphed charge. Slaying it
  drops a burst of health motes.

## Art & assets

All visuals are drawn procedurally on an HTML5 canvas and all sound is
synthesized with the Web Audio API at runtime. There are **no image, font, or
audio files** in this project, so nothing here is third-party or needs
licensing — it is entirely original and freely distributable.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell, title screen, game-over screen |
| `styles.css` | Layout and overlay styling |
| `game.js` | The entire game: loop, background, player, enemies, particles, audio, HUD |

## Tweaking

`game.js` is organized into clearly commented sections. A few quick knobs:

- Enemy stats: the `ENEMY_TYPES` table near the top of section 7.
- Boss stats / attacks: `makeBoss()` and `Enemy._bossUpdate()` in section 7.
- Wave scaling & boss cadence: `startNextWave()` / `spawnEnemy()` in section 8.
- Player feel: the `Player` constructor in section 6 (`speed`, `atkDmg`,
  `atkRange`, dash values).

Loading the page with the URL fragment `#debug` exposes `window.__ds` for
automated testing. It is inert during normal play.
