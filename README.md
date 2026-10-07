# N-Sandbox v0.3

A dependency-free browser sandbox. It intentionally has **no npm build step and no CDN imports**, so it is much more reliable on school PCs, restricted networks and Render static hosting.

## Render
Use **Static Site**.
- Root Directory: empty (or the folder containing `index.html`)
- Build Command: empty
- Publish Directory: `.`
- Start Command: not needed

## GitHub
Put `index.html`, `styles.css`, `app.js` and the `assets/` folder in the same directory.

## What changed from v0.2
- Removed top-level external ES-module imports that could leave the splash screen stuck at "Loading modules" when jsDelivr/CDNs were blocked or slow.
- Fully local canvas renderer + lightweight 3D-ish physics layer. The page can start without waiting for Three.js/Rapier.
- Added N-Sandbox logo from the supplied image.
- Added Dummy ragdolls, paint tool, grab tool, magnet, gust, portals, object rain, Chaos Party, tower builder, balloons, barrels, springs, pulse orbs, missions, screenshots, save/load and undo/redo.
- Kept the interface static-site friendly.
