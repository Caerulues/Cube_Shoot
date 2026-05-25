# Cube Shoot! Ground Battle

A browser-based 2D ground battle shooting game with a start menu and a built-in map editor.

## Controls

### Game

- `A` / `D` or Arrow Keys: Move left and right
- `Space`: Jump / double jump
- `E`: Fire selected weapon
- `1`: Select bullet
- `2`: Select cannon shell after unlocked
- `Q`: Toggle free camera
- `T`: Open command input

### Map Editor

- `WASD` / Arrow Keys: Move editor camera
- Mouse wheel: Zoom
- Left click: Place selected object
- Right click: Erase block / spawn / pickup
- Middle mouse drag: Pan camera

## New Structure

```text
CubeShoot_MapEditor/
├── index.html
├── style.css
├── README.md
└── src/
    ├── main.js
    ├── mapEditor.js
    ├── config.js
    ├── game.js
    ├── input.js
    ├── player.js
    ├── enemy.js
    ├── projectile.js
    ├── effects.js
    ├── collision.js
    ├── terrain.js
    ├── waveManager.js
    ├── weaponManager.js
    └── maps/
        └── defaultMap.js
```

## Map Editor Features

- Terrain block placement with selectable type, width, and height.
- Player start placement.
- Normal enemy spawn placement.
- Boss spawn placement.
- Shell weapon pickup placement.
- Shell ammo and bullet ammo pickup placement.
- Right-click erase.
- Local browser save through `localStorage`.
- JSON export/import.
- JavaScript module export.
- Direct play test using the edited map.

## How to Run

Because this project uses JavaScript modules, open it through a local server.

### VS Code Live Server

1. Install the Live Server extension.
2. Open this project folder in VS Code.
3. Right-click `index.html`.
4. Select `Open with Live Server`.

### Python local server

```bash
cd CubeShoot_MapEditor
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000
```


## Map Editor Update

The map editor now creates terrain rectangles with a two-click workflow:

1. Select `Terrain Block`.
2. Left click the rectangle start point.
3. Left click the rectangle end point.
4. Click an existing rectangle to select it.
5. Press `Delete` to remove the selected rectangle.

Available terrain materials include grass blocks, dirt blocks, stone bricks, dark framed solid blocks, blue framed solid blocks, green framed solid blocks, End Stone, Dark End Stone, and Chorus blocks.

Grass blocks are drawn without internal borders so adjacent grass rectangles visually connect. Terrain and pickups use slightly rounded corners. The editor also supports background-only objects: clouds, fences, lanterns, and dripstone. These do not affect collision.

The menu and game background support four seasonal styles: spring, summer, autumn, and winter.
