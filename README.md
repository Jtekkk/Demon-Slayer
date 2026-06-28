# Demon Slayer — Hellscape

A self-contained browser action game. Play a lone slayer holding the line in a
volcanic hellscape across a **15-wave campaign** — skeletons clawing from the
ash, imps swarming the sky, chargers, exploders and cultists, three escalating
bosses, and a multi-phase finale. Survive to the end and the Hellgate Tyrant
falls.

No build step, no install. Just open it.

## Play

Open `index.html` in any modern browser (double-click it, or serve the folder).

All art and sound effects are generated in code; the music is a bundled
soundtrack (see below).

## Controls

**Desktop**

| Action | Keys |
| --- | --- |
| Move | `W` `A` `S` `D` or arrow keys |
| Aim | Mouse |
| Slash | Left click or `Space` |
| Dash (brief i-frames) | `Shift` or right click |
| Pause / resume | `Esc` or `P` |
| Mute / unmute music | `M` or the speaker (bottom-left) |
| Settings | **⚙ Settings** on the title or pause screen |

### Settings

A settings panel (reachable from the title screen and from the pause menu) lets
you adjust **music volume**, **SFX volume**, and toggle **screen shake** on or
off. Your choices persist across sessions.

**Touch / mobile** (controls appear automatically on first touch)

| Action | Gesture |
| --- | --- |
| Move | Drag anywhere on the **left** half — a virtual joystick follows your thumb |
| Aim + slash | Hold/drag on the **right** half — the slayer faces your thumb and auto-slashes |
| Dash | Tap the **DASH** button (bottom-right) |
| Start / retry | Tap the screen |

## Goal

Survive the **15-wave campaign**. Each wave throws more — and tougher — demons
at you, with bosses at waves 5, 10, and 15. Chain kills for a **combo**: each
hit without taking damage raises a score multiplier up to **×3**, so aggressive,
clean play scores far higher. Dash through danger and grab the green health
motes demons occasionally drop. The run ends when your health hits zero. Clear
wave 15 and you win. Your best score is saved locally and shown on the title
and HUD.

### Endless mode

Beat the campaign and the victory screen offers **DESCEND DEEPER** — continue
the *same run*, keeping your build and score, into endless scaling waves. Enemy
health and damage ramp with depth, and the three bosses recur every five waves
(cycling, ever tougher). See how deep you can go before you fall. Or take
**SLAY AGAIN** for a fresh run.

### Difficulty

Pick before you start — it scales enemy health, enemy damage, spawn rate, and
your starting health:

- **Cinder** — forgiving (130 HP, weaker demons).
- **Ember** — the standard run (100 HP).
- **Inferno** — brutal (80 HP, +35% enemy HP, +30% enemy damage).

### Boons (roguelite upgrades)

After every cleared wave the action pauses and you choose **one of three**
random boons. They stack, so a run compounds into a build:

| Boon | Effect |
| --- | --- |
| ⚔️ Sharpened Blade | +12 slash damage |
| ⚡ Swift Strikes | Attack 15% faster |
| 🥾 Fleet Footed | +move speed |
| ❤️ Vital Surge | +25 max HP and heal |
| 💨 Phantom Step | Dash recharges faster |
| 🌙 Wide Arc | Longer reach, wider swing |
| 🩸 Soul Siphon | Heal per kill (lifesteal) |
| 🔥 Ember Slash | Every slash also fires a bolt (stacks into a fan) |

### Enemies

- **Skeleton** — steady melee walker. The bread and butter.
- **Imp** — fast, weaving flyer. Low health, hard to pin down.
- **Hound** — charger that closes in, then lunges across the gap. From wave 3.
- **Brute** — slow, heavily armored, hits hard, resists knockback. From wave 4.
- **Bloater** — slow exploder that detonates an AoE blast on death — punishes
  point-blank kills. From wave 6.
- **Wraith** — hooded caster that keeps its distance and lobs fireballs. No
  contact damage but punishes standing still. From wave 7.
- **Summoner** — backline cultist that raises adds; chase it down. From wave 8.

### Bosses

- **The Archfiend** (wave 5) — winged fiend: five-shot fire volley + telegraphed
  charge.
- **The Bone Colossus** (wave 10) — pale giant: telegraphed ground-slam
  shockwave and raises skeletons.
- **The Hellgate Tyrant** (wave 15) — multi-phase finale that layers aimed
  volleys, rotating radial bullet rings, charges, and summons as its health
  drops through three phases. Slay it to win.

## Art, sound & soundtrack

All visuals are drawn procedurally on an HTML5 canvas (no image or font files),
and all gameplay sound effects are synthesized with the Web Audio API at
runtime — so the engine itself is entirely original and self-contained.

The background **soundtrack** in `music/` is original music by *tekk* (tracks:
*Chiptune Hell*, *Cumbia de la Muerte*, *Cumbia Glitch*, *Retro Racer*,
*Satan's Bride*), shuffled into a looping playlist. **Boss waves** switch to the
more intense themes and return to the playlist once the wave is cleared. It is
optional: if the `music/` files are absent the game runs fine in silence. Toggle
it with `M` or the speaker button.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell, title/pause/upgrade/victory/game-over screens |
| `styles.css` | Layout and overlay styling |
| `game.js` | The entire game: loop, background, player, enemies, bosses, particles, audio, music, HUD |
| `music/*.mp3` | Bundled soundtrack (original music by tekk) |

## Tweaking

`game.js` is organized into clearly commented sections. A few quick knobs:

- Enemy stats: the `ENEMY_TYPES` table near the top of section 7.
- Boss stats: the `BOSS_DEFS` table; attack patterns in `Enemy._bossUpdate` /
  `_colossusUpdate` / `_tyrantUpdate` (section 7).
- The 15-wave campaign: the `WAVES` table in section 8 (enemy id → count per
  wave, plus boss per wave).
- Player feel: the `Player` constructor in section 6 (`speed`, `atkDmg`,
  `atkRange`, dash values).
- Soundtrack: the `MUSIC_TRACKS` list in section 3b.

Loading the page with the URL fragment `#debug` exposes `window.__ds` for
automated testing. It is inert during normal play.
