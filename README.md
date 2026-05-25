# Cube Shoot!

Cube Shoot! is a browser-based 2D platform shooting game. It includes a single-player survival mode, a local prototype multiplayer room system, custom map loading, configurable controls, seasonal backgrounds, and an in-game pause menu.

The project is built with HTML5 Canvas and JavaScript ES Modules.

## Features

### Main Menu

The current main menu includes:

- Start Game
- Join Room
- Settings

The Start Game menu contains:

- Single Player
- Create Multiplayer Game

Single Player and Create Multiplayer Game both support:

- Default map
- Uploaded JSON map file

### Single Player

Single Player is a platform shooting survival mode.

The player fights waves of monsters. Between waves, a countdown is shown near the top center of the screen. Monsters spawn from map spawn points and become stronger over time.

Single Player includes:

- Player movement and double jump
- Bullet weapon
- Cannon shell weapon
- Ammo limits and ammo regeneration
- Pickups for weapons and ammo
- Wave system
- Boss waves
- Score system
- Command input
- Terrain collision
- Enemy collision
- Projectile collision
- Seasonal background rendering

### Multiplayer Prototype

The current multiplayer mode is a local browser prototype.

It uses browser-side communication through same-origin local mechanisms. It is suitable for testing room logic in multiple tabs on the same device or same browser origin, but it is not yet a real cross-device online multiplayer system.

To support real cross-device multiplayer, the project needs a WebSocket server or a WebRTC signaling server.

Current multiplayer behavior:

- Create a room and receive a room number
- Join a room with a room number
- Enter a player name
- Play with other players in the same map
- Monster spawning is disabled
- Commands are disabled
- Player snapshots are synchronized
- Remote players are drawn on the map
- Players can damage each other
- Dead players enter spectator mode
- Spectators can switch camera targets when more than one player remains
- When only one player remains, all players enter a leaderboard screen
- Leaderboard ranks players by death order
- The last surviving player is ranked first
- The second column shows player kill count

### Settings

Settings are saved locally in the browser through cookies.

Configurable settings include:

- Season / background
- Key bindings
- Hitbox visibility

Supported seasons:

- Spring
- Summer
- Autumn
- Winter

### ESC Menu

Press `Esc` during gameplay to open the pause menu.

The ESC menu includes:

- Game
- Spectate
- Players
- Settings button
- Exit Game button

The Game page allows resuming or exiting the current game.

The Spectate page allows entering spectator mode.

The Players page displays the online player list in multiplayer mode.

### Map Support

Maps are JavaScript or JSON data structures containing:

- World size
- Void height
- Player start position
- Terrain blocks
- Enemy spawn points
- Pickups
- Background objects
- Season data

Single Player and Multiplayer creation both support uploading a custom map JSON file.

### Map Editor

The project includes a map editor module in `src/mapEditor.js`.

The editor supports:

- Two-click terrain rectangle creation
- Terrain selection
- Delete selected terrain
- Right-click deletion
- Material selection
- Player start placement
- Enemy spawn placement
- Pickup placement
- Background object placement
- JSON export
- JavaScript module export
- JSON import
- Local browser save and load

Depending on the current menu version, the editor may need to be reconnected to the main menu if it is not exposed in `index.html`.

## Controls

### Default Game Controls

| Action | Key |
|---|---|
| Move Left | `A` / `Arrow Left` |
| Move Right | `D` / `Arrow Right` |
| Jump / Double Jump | `Space` |
| Fire | `E` |
| Select Bullet | `1` |
| Select Cannon Shell | `2` |
| Toggle Free Camera | `Q` |
| Open Command Input | `T` |
| Open Pause Menu | `Esc` |
| Switch Spectator Target | `Tab` |

Controls can be changed in Settings.

### Command Input

Press `T` to open the command input.

Commands must start with `/`.

Available Single Player commands:

```text
/help
/health <value>
/weapon shell
/autoammo
/speedshot
/infiniteammo
````

Commands cost score points.

Commands are disabled in Multiplayer.

## Weapons

### Bullet

The bullet weapon is available by default.

Properties:

* Fast projectile
* Limited ammo
* Ammo regenerates over time
* Uses the `E` key to fire
* Selected with `1`

### Cannon Shell

The cannon shell weapon is locked by default.

It can be unlocked through:

* Shell weapon pickup
* Single Player command

Properties:

* Arcing projectile
* Explodes on collision
* Area damage
* Knockback
* Limited ammo
* Slower ammo regeneration
* Selected with `2`

## Pickups

Maps can contain pickups.

Pickup types:

* Shell weapon pickup
* Shell ammo pickup
* Bullet ammo pickup

Picked-up weapons and ammo can respawn after a delay depending on the current game code.

## Project Structure

```text
CubeShoot/
├── index.html
├── style.css
├── README.md
└── src/
    ├── camera.js
    ├── collision.js
    ├── config.js
    ├── effects.js
    ├── enemy.js
    ├── game.js
    ├── input.js
    ├── main.js
    ├── mapEditor.js
    ├── multiplayer.js
    ├── player.js
    ├── projectile.js
    ├── seasonBackground.js
    ├── settings.js
    ├── terrain.js
    ├── waveManager.js
    ├── weaponManager.js
    └── maps/
        └── defaultMap.js
```

## Important Files

### `index.html`

Defines the page structure and menu UI.

Includes:

* Canvas
* Main menu
* Start game menu
* Single player menu
* Create room menu
* Join room menu
* Settings panel
* ESC menu

### `style.css`

Defines the full-page canvas layout, menu styles, settings styles, room info panel, and ESC menu UI.

### `src/main.js`

Controls high-level application flow.

Responsibilities:

* Menu navigation
* Settings loading and saving
* Starting Single Player
* Creating Multiplayer rooms
* Joining Multiplayer rooms
* ESC menu behavior
* Room code display
* Custom map file loading

### `src/game.js`

Main gameplay controller.

Responsibilities:

* Game loop
* Player update
* Camera update
* Weapon handling
* Projectile update
* Enemy update
* Wave logic in Single Player
* Multiplayer snapshot handling
* Multiplayer death and spectator logic
* Leaderboard rendering
* UI rendering

### `src/multiplayer.js`

Current browser-side multiplayer prototype.

Responsibilities:

* Room creation
* Room joining
* Player state synchronization
* Hit events
* Death order
* Kill counts
* Leaderboard data

For real cross-device multiplayer, this file should be replaced or extended to connect to a WebSocket server.

### `src/terrain.js`

Handles map terrain and collision.

Responsibilities:

* Terrain block storage
* Entity collision rectangles
* Horizontal collision
* Vertical collision
* Ground detection
* Line of sight
* Pickups
* Background objects
* Terrain rendering

### `src/player.js`

Defines player movement, hitbox, health, double jump, damage cooldown, and rendering.

### `src/enemy.js`

Defines monster behavior for Single Player.

Responsibilities:

* Patrol movement
* Chase movement
* Vision detection
* Jumping behavior
* Damage handling
* Boss enemy support

### `src/weaponManager.js`

Controls weapon state.

Responsibilities:

* Selected weapon
* Ammo
* Ammo regeneration
* Unlocking weapons
* Cooldown
* Infinite ammo
* Speedshot mode

### `src/settings.js`

Controls local settings persistence.

Settings are saved in cookies.

### `src/maps/defaultMap.js`

Default playable map.

## Running the Project

Because this project uses JavaScript ES Modules, it should be opened through a local web server.

### VS Code Live Server

1. Install the Live Server extension.
2. Open the project folder in VS Code.
3. Right-click `index.html`.
4. Select `Open with Live Server`.

### Python Local Server

```bash
cd CubeShoot
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Custom Map Format

A basic map object looks like this:

```js
export const customMap = {
    worldWidth: 3400,
    worldHeight: 1300,
    voidY: 1180,
    season: "spring",

    playerStart: {
        x: 160,
        y: 520
    },

    terrainBlocks: [
        {
            id: "terrain_1",
            x: 0,
            y: 560,
            width: 600,
            height: 80,
            type: "grass"
        }
    ],

    spawnPoints: [
        {
            id: "spawn_1",
            x: 900,
            y: 520,
            type: "normal",
            enabled: true
        }
    ],

    pickups: [
        {
            id: "pickup_1",
            x: 480,
            y: 500,
            width: 28,
            height: 28,
            type: "weapon",
            weapon: "shell",
            enabled: true
        }
    ],

    backgroundObjects: [
        {
            id: "bg_cloud_1",
            type: "cloud",
            x: 500,
            y: 160,
            scale: 0.9,
            alpha: 0.75
        }
    ]
};
```

Supported terrain block types include:

* `grass`
* `dirt`
* `stone_brick`
* `solid_dark`
* `solid_blue`
* `solid_green`
* `end_stone`
* `end_stone_dark`
* `chorus`

Supported background object types include:

* `cloud`
* `fence`
* `lantern`
* `dripstone`

## Current Multiplayer Limitation

The current multiplayer implementation is not a production online multiplayer system.

It does not yet include:

* Dedicated WebSocket server
* Cross-device room discovery
* Authoritative server-side physics
* Anti-cheat validation
* Real network latency compensation
* Persistent accounts
* Matchmaking

To make multiplayer work across devices, add a WebSocket server such as:

```text
Browser Client 1 ─┐
Browser Client 2 ─┼── WebSocket Server ── Room State
Browser Client 3 ─┘
```

The server should manage:

* Room creation
* Room joining
* Player snapshots
* Projectile events
* Damage events
* Death order
* Kill counts
* Leaderboard
* Disconnection handling

## Development Notes

Recommended next steps:

1. Reconnect the Map Editor to the main menu if needed.
2. Replace the local multiplayer prototype with a real WebSocket server.
3. Move multiplayer damage validation to the server.
4. Add interpolation for remote players.
5. Add server-authoritative leaderboard logic.
6. Add map preview before starting a game.
7. Add better UI for custom map selection.
8. Add sound effects and music.
9. Add mobile control support if needed.

## License

MIT License

Copyright (c) 2026 Caerulues

Permission is granted under the MIT License. See the `LICENSE` file for details.
