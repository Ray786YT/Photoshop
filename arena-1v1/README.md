# Arena 1v1

An offline, Apex-style 1v1 duel trainer that runs in your web browser. No install, no account, no internet.

## Play it

1. Download `Arena1v1.html` (it's one file with everything inside it).
2. Double-click it. It opens in Chrome, Edge or Firefox.
3. Pick **1v1 Duel** or **Firing Range**, then click the game window to capture the mouse.

## Will it run on my computer?

Very likely yes. It needs:

- **Windows, Mac, Linux or a Chromebook** with a keyboard and mouse
- A **recent Chrome, Edge or Firefox** with hardware acceleration turned on (it is on by default)
- Any GPU from roughly the last 10 years, including laptop integrated graphics

The FPS counter is in the top-left corner. If it's below about 50, go to the menu and set **Graphics → Low (older PCs)**.
If you see "3D graphics are turned off", turn on hardware acceleration in your browser settings.

## Modes

- **1v1 Duel**: you against a bot, first to 3 rounds. Each round both of you start with 100 shield, 100 health,
  a Carbine (rifle), a Scattergun (shotgun), 4 shield cells, 4 syringes and 2 batteries. Spawns swap every round.
  The bot strafes, pushes when your shield is broken, heals behind cover and swaps to the shotgun up close.
  Easy, Normal and Hard change its reaction time, aim tracking, headshot rate and movement.
- **Firing Range**: 7 dummies from 10 m to 60 m out, some strafing, with unlimited ammo and heals.
  Tracks damage, accuracy, headshots and knocks (press T to reset).

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Mouse / Left click / Right click | Aim / Shoot / Aim down sights |
| Shift (hold) | Sprint |
| Space | Jump |
| C | Crouch. Press it while sprinting to slide |
| Q | Dash (8 s cooldown) |
| R | Reload |
| 1 / 2 or mouse wheel | Carbine / Scattergun |
| 3 / 4 / 5 | Shield cell (+25 shield, 3 s) / Syringe (+25 HP, 5 s) / Battery (full shield, 5 s) |
| Esc | Pause (sensitivity, FOV, volume and graphics are in the pause menu too) |

Settings are remembered between sessions.

## For editing

`index.html` and `game.js` are the source files, and `lib/three.min.js` is three.js r149 (MIT licence, included in `lib/`).
Opening `index.html` directly works too. After changing anything, rebuild the single-file version:

```
node build.js
```

This is a fan-made practice game with original placeholder art. It is not affiliated with EA or Respawn and uses no Apex Legends assets.
