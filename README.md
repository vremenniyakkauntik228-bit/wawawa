# N-Sandbox Engine v0.2

A browser-first 3D physics playground built for a free GitHub + Render deployment. It is intentionally a compact sandbox rather than a full game engine: the point is to experiment, build ridiculous contraptions, break them, and keep finding new interactions.

## Highlights

- WebGPU renderer with automatic WebGL2 fallback.
- Rapier 3D physics via WASM.
- 8 spawnable object types: cube, sphere, cylinder, plank, wheel, domino, crate, pulse orb.
- Build/snap, cut, push, boom, magnet, gust and freeze tools.
- Delayed pulse-orb explosions.
- Object rain and auto-tower toys.
- 4× time controls: 1/4x, 1/2x, 1x, 2x.
- Gravity control + gravity flip.
- Per-object elasticity control.
- Save/load to browser localStorage.
- Undo/redo scene snapshots.
- Camera orbit with middle mouse + zoom with wheel.
- 10 rotating mini-challenges.
- Automatic debris cleanup and a 220-object safety cap for browser performance.

## Run locally

```bash
python -m http.server 8080
```

Open `http://localhost:8080`.

Because the project uses ES modules and a WASM physics runtime, serving it over HTTP is recommended instead of `file://`.

## Render + GitHub

For a static Render site, upload the folder to GitHub and point a Render Static Site at the repository. No database is required by v0.2; saves stay in the player's own browser.

For a Render Web Service, serve the directory with any static HTTP server. The app itself does not require a backend API. This makes it suitable for a Render Static Site; a Web Service also works, but is unnecessary for the v0.2 client-only build.

## Important fixes vs v0.1

- The WebGPU renderer is now constructed with the actual page canvas.
- WebGL2 fallback is kept for unsupported/failed WebGPU cases.
- Cut positions are rotated with the object's orientation instead of always splitting in world X.
- Debris is temporary and automatically removed.
- A hard 220-object cap prevents runaway browser physics load.
- Save/load restores transforms, gravity, time scale, frozen state and restitution.
- Added graceful startup error reporting.
