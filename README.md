# ⚔️ Orcs In The Forest

A fast-paced **3D first-person shooter** survival game built entirely in the browser with Three.js. Fight waves of orcs, dire wolves, shamans, stone golems, and mega bosses in a dark procedural forest.

## 🎮 Play

Open `index.html` in a modern browser — no build step required.

## ✨ Features

- **Wave-based survival** — Escalating enemy waves with boss fights every 5 waves
- **5 enemy types** — Orc archers, dire wolves, fire shamans, stone golems, mega bosses
- **3 weapons** — Assault rifle, pump shotgun, bolt-action sniper
- **Roguelite upgrades** — Choose from 10 upgrades between waves (Vampiric Rounds, Hollow Points, Adrenaline, etc.)
- **Day/night cycle** — Dynamic lighting with sun/moon orbit, fog transitions
- **Weather events** — Fog banks, blood moons, thunderstorms with lightning
- **Kill streaks** — Score multipliers for rapid kills
- **Procedural audio** — 8-bit background music, ambient soundscape (wind, crickets, birds, war drums)
- **Advanced movement** — Quake/Source-style physics: bunny-hopping, wall bouncing, slide jumping
- **Grenades** — Arc preview, shrapnel upgrade, destructible trees
- **Melee attack** — Close-range punch for emergencies
- **Achievements** — 8 unlockable achievements tracked in localStorage
- **High scores** — Persistent best score, best wave, total kills
- **Screen shake, damage numbers, kill feed** — Full game juice
- **Settings** — Master/music volume, mouse sensitivity, screen shake toggle, FPS toggle

## 🎯 Controls

| Key | Action | Key | Action |
|-----|--------|-----|--------|
| WASD | Move | Mouse | Look |
| Click | Fire | R | Reload |
| G (hold) | Grenade | C | Crouch |
| Shift | Sprint | Space | Jump |
| 1/2/3 | Switch weapon | V | Melee |
| F | Flashlight | ESC | Pause |
| Tab | Settings (when paused) | | |

## 🛠️ Tech

- **Three.js** (r160) — 3D rendering
- **Web Audio API** — All audio is procedurally generated (zero external assets)
- **Zero dependencies** — No build step, no bundler, no assets to download
- **~10K lines** of vanilla JavaScript

## 📄 License

MIT