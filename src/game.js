import { CONFIG } from "./config.js";
import { Player, drawWeaponModel } from "./player.js";
import { Bullet, Shell, Lazer } from "./projectile.js";
import { Explosion } from "./effects.js";
import { InputManager } from "./input.js";
import { WaveManager } from "./waveManager.js";
import { WeaponManager } from "./weaponManager.js";
import {
    checkRectRectCollision,
    checkBulletEnemyCollision,
    getDistance
} from "./collision.js";
import { Terrain } from "./terrain.js";
import { Camera } from "./camera.js";
import { drawSeasonBackground } from "./seasonBackground.js";
import { drawTexture, normalizeMapAssets } from "./textureManager.js";

export class Game {
    constructor(canvas, mapData = null, settings = null, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");

        this.resizeCanvas();
        window.addEventListener("resize", () => this.resizeCanvas());

        this.mode = options.mode || "single";
        this.multiplayerClient = options.multiplayerClient || null;
        this.isMultiplayer = this.mode === "multiplayer";
        this.multiplayerType = options.multiplayerType || this.multiplayerClient?.gameType || "brawl";
        this.isBrawlMultiplayer = this.isMultiplayer && this.multiplayerType === "brawl";
        this.isCoopMultiplayer = this.isMultiplayer && this.multiplayerType === "coop";

        this.settings = settings || {
            season: mapData?.season || "spring",
            showHitboxes: false
        };

        this.input = new InputManager(this.settings);

        this.mapData = mapData || undefined;
        if (this.mapData) {
            normalizeMapAssets(this.mapData);
        }

        this.season = this.settings.season || mapData?.season || "spring";
        this.terrain = new Terrain(canvas, this.mapData);

        this.camera = new Camera(
            canvas,
            this.terrain.worldWidth,
            this.terrain.worldHeight
        );

        this.waveManager = new WaveManager(canvas, this.terrain);
        this.weaponManager = new WeaponManager();

        const start = this.getInitialPlayerStart();
        this.player = new Player(start.x, start.y - CONFIG.player.size);

        this.bullets = [];
        this.shells = [];
        this.lazers = [];
        this.enemies = [];
        this.effects = [];

        this.score = 0;

        this.gameOver = false;
        this.gameOverReason = "";

        this.freeCamera = false;
        this.paused = false;
        this.running = false;

        this.fixedTimeStep = 1000 / 60;
        this.maxFrameTime = 100;
        this.accumulator = 0;
        this.lastFrameTime = null;
        this.simulationTime = 0;

        this.spectating = false;
        this.spectatorIndex = 0;
        this.multiplayerDead = false;
        this.multiplayerRankingShown = false;
        this.lastMultiplayerSyncTime = 0;
        this.lastAttackerId = null;
        this.restartButtonRect = null;

        this.noPlayerInput = {
            isDown: () => false,
            wasPressed: () => false,
            isActionDown: () => false,
            wasActionPressed: () => false
        };

        this.message = "";
        this.messageEndTime = 0;

        this.applyMultiplayerRules();
    }

    applyMultiplayerRules() {
        if (!this.isBrawlMultiplayer) {
            return;
        }

        const brawlMaxHp = CONFIG.player.hp * 3;
        this.player.maxHp = Math.max(this.player.maxHp || 0, brawlMaxHp);
        this.player.hp = this.player.maxHp;

        this.weaponManager.unlockAllWeapons({ fullAmmo: true, select: "bullet" });
        this.weaponManager.setInfiniteAmmo(true);
    }

    start() {
        if (this.running) {
            return;
        }

        this.running = true;
        this.accumulator = 0;
        this.lastFrameTime = null;
        this.simulationTime = performance.now();

        requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
    }

    stop() {
        this.running = false;
        this.accumulator = 0;
        this.lastFrameTime = null;
    }

    setPaused(paused) {
        this.paused = paused;
        this.input.endFrame();
    }

    enterSpectatorMode() {
        this.spectating = true;
        this.freeCamera = false;
        this.updateSpectatorTarget();
    }

    gameLoop(timestamp) {
        if (!this.running) {
            return;
        }

        if (this.lastFrameTime === null) {
            this.lastFrameTime = timestamp;
        }

        const frameTime = Math.min(
            timestamp - this.lastFrameTime,
            this.maxFrameTime
        );

        this.lastFrameTime = timestamp;

        if (!this.paused) {
            this.accumulator += frameTime;

            while (this.accumulator >= this.fixedTimeStep) {
                this.simulationTime += this.fixedTimeStep;

                if (!this.gameOver) {
                    this.update(this.simulationTime);
                } else if (!this.isMultiplayer && this.input.wasLeftMousePressed()) {
                    this.restart();
                    break;
                }

                this.input.endFrame();
                this.accumulator -= this.fixedTimeStep;
            }
        } else {
            this.input.endFrame();
        }

        this.draw(timestamp);

        requestAnimationFrame((nextTimestamp) => this.gameLoop(nextTimestamp));
    }

    update(timestamp) {
        if (this.isMultiplayer) {
            this.updateMultiplayer(timestamp);
            return;
        }

        this.updateSinglePlayer(timestamp);
    }

    updateSinglePlayer(timestamp) {
        this.handleSubmittedCommand(timestamp);
        this.handleCameraMode();

        const playerInput = this.freeCamera
            ? this.noPlayerInput
            : this.input;

        this.player.update(playerInput, this.canvas, this.terrain);

        this.camera.update(this.player, this.input, this.freeCamera);

        this.updatePlayerAim();

        this.handleWeaponSelection();
        this.weaponManager.update(timestamp);
        this.handleWeapons(timestamp);

        this.updateProjectiles();

        this.waveManager.update(timestamp, this.enemies);

        this.updateEnemies();
        this.updateEffects();
        this.updatePickups(timestamp);

        this.checkBulletHits();
        this.checkLazerHits();
        this.checkShellExplosions();
        this.checkEnemyPlayerCollisions();
        this.checkPickups(timestamp);
        this.checkVoidDeaths();

        if (this.player.hp <= 0) {
            this.player.hp = 0;
            this.endGame("Player defeated");
        }
    }

    updateMultiplayer(timestamp) {
        this.consumeMultiplayerEvents();

        if (this.input.wasPressed("tab")) {
            this.switchSpectatorTarget(1);
        }

        if (!this.multiplayerDead && !this.multiplayerRankingShown) {
            const playerInput = this.spectating
                ? this.noPlayerInput
                : this.input;

            this.player.update(playerInput, this.canvas, this.terrain);

            this.updatePlayerAim();

            this.handleWeaponSelection();
            this.weaponManager.update(timestamp);
            this.handleWeapons(timestamp);
            this.checkPickups(timestamp);
            this.checkMultiplayerVoidDeath();
        }

        this.updateProjectiles();

        if (this.isCoopMultiplayer) {
            this.waveManager.update(timestamp, this.enemies);
            this.updateEnemies();
            this.checkBulletHits();
            this.checkLazerHits();
            this.checkShellExplosions();
            this.checkEnemyPlayerCollisions();
        } else {
            this.checkMultiplayerProjectileHits();
            this.checkShellExplosions();
        }

        this.updateEffects();
        this.updatePickups(timestamp);

        if (this.multiplayerDead || this.spectating) {
            this.updateSpectatorTarget();
        } else {
            this.camera.update(this.player, this.input, false);
        }

        if (this.isCoopMultiplayer && !this.multiplayerDead && this.player.hp <= 0) {
            this.player.hp = 0;
            this.dieInMultiplayer(this.lastAttackerId);
        }

        this.syncMultiplayerSnapshot(timestamp);

        if (this.isBrawlMultiplayer && this.multiplayerClient?.isMatchFinished()) {
            this.multiplayerRankingShown = true;
        }

        if (this.multiplayerRankingShown) {
            this.handleMultiplayerRestartInput();
        }
    }

    consumeMultiplayerEvents() {
        if (!this.multiplayerClient) {
            return;
        }

        for (const event of this.multiplayerClient.consumeEvents()) {
            if (event.type === "hit" && !this.multiplayerDead) {
                const damaged = this.player.takeDamage(event.damage);

                if (!damaged) {
                    continue;
                }

                this.lastAttackerId = event.attackerId;
                this.syncMultiplayerSnapshot(performance.now() + 1000);

                if (this.player.hp <= 0) {
                    this.player.hp = 0;
                    this.dieInMultiplayer(event.attackerId);
                }
            }

            if (event.type === "projectileFired") {
                this.spawnRemoteProjectile(event.projectile, event.ownerId);
            }

            if (event.type === "restartMatch") {
                this.restartMultiplayerMatch(false);
            }
        }
    }

    syncMultiplayerSnapshot(timestamp) {
        if (!this.multiplayerClient || timestamp - this.lastMultiplayerSyncTime < 50) {
            return;
        }

        this.lastMultiplayerSyncTime = timestamp;

        this.multiplayerClient.updateLocalSnapshot({
            x: this.player.x,
            y: this.player.y,
            vx: this.player.vx,
            vy: this.player.vy,
            facing: this.player.facing,
            hp: this.player.hp,
            maxHp: this.player.maxHp,
            damageCooldown: this.player.damageCooldown,
            alive: !this.multiplayerDead,
            kills: this.multiplayerClient.getLocalPlayer()?.kills || 0,
            selectedWeapon: this.weaponManager.getSelectedWeapon()?.id || "bullet",
            aimAngle: this.player.aimAngle,
            aimFlipY: this.player.aimFlipY
        });
    }

    dieInMultiplayer(killerId = null) {
        if (this.multiplayerDead) {
            return;
        }

        this.multiplayerDead = true;
        this.spectating = true;
        this.freeCamera = false;

        if (killerId && killerId !== this.multiplayerClient?.playerId) {
            this.multiplayerClient?.sendDeath(killerId);
        } else {
            this.multiplayerClient?.sendDeath(killerId);
        }

        this.showMessage("You died. Spectating remaining players.", performance.now());
        this.updateSpectatorTarget();
    }

    checkMultiplayerVoidDeath() {
        if (this.terrain.isEntityInVoid(this.player)) {
            this.dieInMultiplayer(null);
        }
    }

    updateSpectatorTarget() {
        if (!this.multiplayerClient) {
            return;
        }

        const targets = this.multiplayerClient.getSpectatorTargets();

        if (targets.length === 0) {
            return;
        }

        if (this.spectatorIndex >= targets.length) {
            this.spectatorIndex = 0;
        }

        const target = targets[this.spectatorIndex];

        this.camera.updateFollowCamera({
            centerX: target.x + CONFIG.player.size / 2,
            centerY: target.y + CONFIG.player.size / 2
        });

        this.camera.clamp();
    }

    switchSpectatorTarget(direction) {
        if (!this.multiplayerClient) {
            return;
        }

        const targets = this.multiplayerClient.getSpectatorTargets();

        if (targets.length <= 1) {
            return;
        }

        this.spectatorIndex =
            (this.spectatorIndex + direction + targets.length) % targets.length;

        this.showMessage(
            `Spectating ${targets[this.spectatorIndex].name}`,
            performance.now()
        );
    }

    isProjectileTouchingRemotePlayer(projectile, player) {
        const rect = {
            x: player.x + 3,
            y: player.y + 2,
            width: CONFIG.player.size - 6,
            height: CONFIG.player.size - 2
        };

        return (
            projectile.x < rect.x + rect.width &&
            projectile.x + projectile.width > rect.x &&
            projectile.y < rect.y + rect.height &&
            projectile.y + projectile.height > rect.y
        );
    }

    isProjectileTouchingPlayer(projectile, player) {
        const rect = player.collisionRect || {
            x: player.x + 3,
            y: player.y + 2,
            width: CONFIG.player.size - 6,
            height: CONFIG.player.size - 2
        };

        return (
            projectile.x < rect.x + rect.width &&
            projectile.x + projectile.width > rect.x &&
            projectile.y < rect.y + rect.height &&
            projectile.y + projectile.height > rect.y
        );
    }

    checkMultiplayerProjectileHits() {
        if (!this.multiplayerClient || !this.isBrawlMultiplayer) {
            return;
        }

        const remotePlayers = this.multiplayerClient
            .getRemotePlayers()
            .filter((player) => player.alive !== false);

        for (let bulletIndex = this.bullets.length - 1; bulletIndex >= 0; bulletIndex--) {
            const bullet = this.bullets[bulletIndex];

            if (bullet.isRemote) {
                if (!this.multiplayerDead && this.isProjectileTouchingPlayer(bullet, this.player)) {
                    this.bullets.splice(bulletIndex, 1);
                }
                continue;
            }

            for (const player of remotePlayers) {
                const hit = this.isProjectileTouchingRemotePlayer(bullet, player);

                if (!hit) {
                    continue;
                }

                this.multiplayerClient.sendHit(player.id, CONFIG.bullet.playerDamage);
                this.bullets.splice(bulletIndex, 1);
                break;
            }
        }

        for (let lazerIndex = this.lazers.length - 1; lazerIndex >= 0; lazerIndex--) {
            const lazer = this.lazers[lazerIndex];

            if (lazer.isRemote) {
                continue;
            }

            for (const player of remotePlayers) {
                if (player.alive === false) {
                    continue;
                }

                const rect = {
                    x: player.x,
                    y: player.y,
                    width: CONFIG.player.size,
                    height: CONFIG.player.size
                };

                if (
                    !lazer.hitIds.has(player.id) &&
                    this.isLazerHittingRect(lazer, rect, CONFIG.lazer.width)
                ) {
                    lazer.hitIds.add(player.id);
                    this.multiplayerClient.sendHit(player.id, CONFIG.lazer.playerDamage);
                }
            }
        }

        for (let shellIndex = this.shells.length - 1; shellIndex >= 0; shellIndex--) {
            const shell = this.shells[shellIndex];

            if (!shell.hitPlayerIds) {
                shell.hitPlayerIds = new Set();
            }

            if (shell.isRemote) {
                continue;
            }

            if (!shell.shouldExplode && shell.active) {
                continue;
            }

            for (const player of remotePlayers) {
                if (shell.hitPlayerIds.has(player.id)) {
                    continue;
                }

                const distance = getDistance(
                    shell.centerX,
                    shell.centerY,
                    player.x + CONFIG.player.size / 2,
                    player.y + CONFIG.player.size / 2
                );

                if (distance > shell.radius) {
                    continue;
                }

                shell.hitPlayerIds.add(player.id);
                this.multiplayerClient.sendHit(player.id, CONFIG.shell.playerDamage);
            }
        }
    }

    handleSubmittedCommand(timestamp) {
        const command = this.input.consumeCommand();

        if (!command) {
            return;
        }

        if (this.isMultiplayer) {
            this.showMessage("Commands are disabled in multiplayer.", timestamp);
            return;
        }

        this.executeCommand(command, timestamp);
    }

    executeCommand(rawCommand, timestamp) {
        if (!rawCommand.startsWith("/")) {
            this.showMessage("Commands must start with /", timestamp);
            return;
        }

        const parts = rawCommand.slice(1).trim().split(/\s+/);
        const command = parts[0]?.toLowerCase();

        if (!command) {
            return;
        }

        if (command === "help") {
            this.showMessage(
                "/help | /health <value> | /weapon <shell|lazer> | /speedshot | /infiniteammo",
                timestamp
            );
            return;
        }

        if (command === "health") {
            const amount = Math.ceil(Number(parts[1]));

            if (!Number.isFinite(amount) || amount <= 0) {
                this.showMessage("Usage: /health <value>", timestamp);
                return;
            }

            const cost = Math.ceil(amount * 25);

            if (!this.spendScore(cost, timestamp)) {
                return;
            }

            this.player.maxHp = Math.max(CONFIG.player.hp, Math.ceil(this.player.maxHp || CONFIG.player.hp)) + amount;
            this.player.hp = Math.min(this.player.maxHp, Math.ceil(this.player.hp || 0) + amount);
            this.showMessage(`Max health +${amount} | Cost ${cost}`, timestamp);
            return;
        }

        if (command === "weapon") {
            const type = parts[1]?.toLowerCase();

            if (type !== "shell" && type !== "lazer") {
                this.showMessage("Usage: /weapon shell|lazer", timestamp);
                return;
            }

            const cost = type === "shell" ? 300 : 450;

            if (!this.spendScore(cost, timestamp)) {
                return;
            }

            this.weaponManager.unlockWeapon(type);
            this.showMessage(`${type === "shell" ? "Unlocked Cannon" : "Unlocked Lazer"} | Cost ${cost}`, timestamp);
            return;
        }

        if (command === "autoammo") {
            this.showMessage("Auto ammo is disabled. Pick up ammo from the map.", timestamp);
            return;
        }

        if (command === "speedshot") {
            const cost = 700;

            if (!this.spendScore(cost, timestamp)) {
                return;
            }

            const enabled = this.weaponManager.toggleSpeedshot();
            this.showMessage(`Speedshot: ${enabled ? "ON" : "OFF"} | Cost 700`, timestamp);
            return;
        }

        if (command === "infiniteammo") {
            const cost = 500;

            if (!this.spendScore(cost, timestamp)) {
                return;
            }

            const enabled = this.weaponManager.toggleInfiniteAmmo();
            this.showMessage(`Infinite ammo: ${enabled ? "ON" : "OFF"} | Cost 500`, timestamp);
            return;
        }

        this.showMessage(`Unknown command: /${command}`, timestamp);
    }

    spendScore(cost, timestamp) {
        if (this.score < cost) {
            this.showMessage(`Not enough score. Need ${cost}`, timestamp);
            return false;
        }

        this.score -= cost;
        return true;
    }

    showMessage(text, timestamp) {
        this.message = text;
        this.messageEndTime = timestamp + 3500;
    }

    handleCameraMode() {
        if (this.input.wasActionPressed("freeCamera")) {
            this.freeCamera = !this.freeCamera;

            if (!this.freeCamera) {
                this.camera.snapToTarget(this.player);
            }
        }
    }

    handleWeaponSelection() {
        if (this.input.wasActionPressed("weapon1")) {
            this.weaponManager.selectWeaponByNumber("1");
        }

        if (this.input.wasActionPressed("weapon2")) {
            this.weaponManager.selectWeaponByNumber("2");
        }

        if (this.input.wasActionPressed("weapon3")) {
            this.weaponManager.selectWeaponByNumber("3");
        }
    }

    handleWeapons(timestamp) {
        if (this.freeCamera || this.spectating || this.multiplayerDead) {
            return;
        }

        if (!this.input.isActionDown("fire")) {
            return;
        }

        if (!this.weaponManager.canFire(timestamp)) {
            return;
        }

        const weapon = this.weaponManager.getSelectedWeapon();

        if (weapon.id === "bullet") {
            this.fireBullet();
        } else if (weapon.id === "shell") {
            this.fireShell();
        } else if (weapon.id === "lazer") {
            this.fireLazer();
        }

        this.weaponManager.consumeFire(timestamp);
    }

    getMouseWorldPosition() {
        return {
            x: this.input.mouse.x + this.camera.x,
            y: this.input.mouse.y + this.camera.y
        };
    }

    getAimVector() {
        const mouse = this.getMouseWorldPosition();
        const dx = mouse.x - this.player.centerX;
        const dy = mouse.y - this.player.centerY;
        const length = Math.hypot(dx, dy) || 1;

        return {
            x: dx / length,
            y: dy / length
        };
    }

    updatePlayerAim() {
        const aim = this.getAimVector();
        const rawAngle = Math.atan2(aim.y, aim.x);

        // Keep the weapon barrel aligned with the real player -> mouse vector.
        // The old 0..PI mirroring made lower-half aiming draw upward because
        // ctx.scale(1, -1) does not change the rotated local x-axis direction.
        // Use the real signed angle for rotation, and only flip the model's
        // local Y axis when aiming left so the sprite does not render upside down.
        this.player.aimAngle = rawAngle;
        this.player.aimFlipY = rawAngle > Math.PI / 2 || rawAngle < -Math.PI / 2;
        this.player.facing = aim.x >= 0 ? 1 : -1;
    }

    getMuzzlePosition(width, height) {
        const aim = this.getAimVector();
        const offset = this.player.size / 2 + 10;

        return {
            x: this.player.centerX + aim.x * offset - width / 2,
            y: this.player.centerY + aim.y * offset - height / 2,
            aim
        };
    }

    fireBullet() {
        const muzzle = this.getMuzzlePosition(CONFIG.bullet.width, CONFIG.bullet.height);
        const bullet = new Bullet(muzzle.x, muzzle.y, muzzle.aim);
        bullet.ownerId = this.multiplayerClient?.playerId || "local";
        bullet.isRemote = false;
        this.bullets.push(bullet);

        if (this.isMultiplayer) {
            this.multiplayerClient?.sendProjectile({
                kind: "bullet",
                x: muzzle.x,
                y: muzzle.y,
                aim: muzzle.aim
            });
        }
    }

    fireShell() {
        const muzzle = this.getMuzzlePosition(CONFIG.shell.size, CONFIG.shell.size);
        const shell = new Shell(muzzle.x, muzzle.y, muzzle.aim);
        shell.ownerId = this.multiplayerClient?.playerId || "local";
        shell.isRemote = false;
        this.shells.push(shell);

        if (this.isMultiplayer) {
            this.multiplayerClient?.sendProjectile({
                kind: "shell",
                x: muzzle.x,
                y: muzzle.y,
                aim: muzzle.aim
            });
        }
    }

    fireLazer() {
        const muzzle = this.getMuzzlePosition(1, 1);
        const lazer = new Lazer(muzzle.x, muzzle.y, muzzle.aim);
        lazer.ownerId = this.multiplayerClient?.playerId || "local";
        lazer.isRemote = false;
        this.lazers.push(lazer);

        if (this.isMultiplayer) {
            this.multiplayerClient?.sendProjectile({
                kind: "lazer",
                x: muzzle.x,
                y: muzzle.y,
                aim: muzzle.aim
            });
        }
    }

    spawnRemoteProjectile(projectile, ownerId) {
        if (!projectile || !ownerId || ownerId === this.multiplayerClient?.playerId) {
            return;
        }

        if (projectile.kind === "bullet") {
            const bullet = new Bullet(projectile.x, projectile.y, projectile.aim || projectile.direction);
            bullet.ownerId = ownerId;
            bullet.isRemote = true;
            this.bullets.push(bullet);
            return;
        }

        if (projectile.kind === "shell") {
            const shell = new Shell(projectile.x, projectile.y, projectile.aim || projectile.direction);
            shell.ownerId = ownerId;
            shell.isRemote = true;
            this.shells.push(shell);
            return;
        }

        if (projectile.kind === "lazer") {
            const lazer = new Lazer(projectile.x, projectile.y, projectile.aim || projectile.direction);
            lazer.ownerId = ownerId;
            lazer.isRemote = true;
            this.lazers.push(lazer);
        }
    }

    updateProjectiles() {
        for (const bullet of this.bullets) {
            bullet.update(this.terrain);
        }

        for (const shell of this.shells) {
            shell.update(this.terrain);
        }

        for (const lazer of this.lazers) {
            lazer.update(this.terrain);
        }

        this.bullets = this.bullets.filter((bullet) => {
            return (
                bullet.active &&
                bullet.x + bullet.width > 0 &&
                bullet.x < this.terrain.worldWidth
            );
        });

        this.shells = this.shells.filter((shell) => {
            return (
                shell.x + shell.size > -100 &&
                shell.x < this.terrain.worldWidth + 100 &&
                shell.y < this.terrain.voidY + 100
            );
        });

        this.lazers = this.lazers.filter((lazer) => lazer.active);
    }

    updateEnemies() {
        for (const enemy of this.enemies) {
            enemy.update(this.player, this.terrain);
        }
    }

    updateEffects() {
        for (const effect of this.effects) {
            effect.update();
        }

        this.effects = this.effects.filter((effect) => !effect.done);
    }

    checkBulletHits() {
        for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
            const enemy = this.enemies[enemyIndex];

            for (let bulletIndex = this.bullets.length - 1; bulletIndex >= 0; bulletIndex--) {
                const bullet = this.bullets[bulletIndex];

                if (checkBulletEnemyCollision(bullet, enemy)) {
                    enemy.takeDamage(bullet.damage, 3, bullet.x);
                    this.bullets.splice(bulletIndex, 1);

                    if (enemy.hp <= 0) {
                        this.killEnemy(enemyIndex, enemy);
                    }

                    break;
                }
            }
        }
    }

    isLineHittingRect(x1, y1, x2, y2, rect, padding = 0) {
        const left = rect.x - padding;
        const right = rect.x + rect.width + padding;
        const top = rect.y - padding;
        const bottom = rect.y + rect.height + padding;
        const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 10));

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = x1 + (x2 - x1) * t;
            const y = y1 + (y2 - y1) * t;

            if (x >= left && x <= right && y >= top && y <= bottom) {
                return true;
            }
        }

        return false;
    }

    isLazerHittingRect(lazer, rect, padding = 0) {
        const segments = lazer.segments?.length
            ? lazer.segments
            : [{ x1: lazer.x, y1: lazer.y, x2: lazer.endX, y2: lazer.endY }];

        return segments.some((segment) => {
            return this.isLineHittingRect(
                segment.x1,
                segment.y1,
                segment.x2,
                segment.y2,
                rect,
                padding
            );
        });
    }

    checkLazerHits() {
        for (const lazer of this.lazers) {
            if (lazer.isRemote) {
                continue;
            }

            for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
                const enemy = this.enemies[enemyIndex];
                const rect = enemy.collisionRect;

                if (!this.isLazerHittingRect(lazer, rect, CONFIG.lazer.width)) {
                    continue;
                }

                if (lazer.hitIds.has(enemy.id || enemyIndex)) {
                    continue;
                }

                lazer.hitIds.add(enemy.id || enemyIndex);
                enemy.takeDamage(lazer.damage, 4, lazer.x);

                if (enemy.hp <= 0) {
                    this.killEnemy(enemyIndex, enemy);
                }
            }
        }
    }

    checkShellExplosions() {
        for (let shellIndex = this.shells.length - 1; shellIndex >= 0; shellIndex--) {
            const shell = this.shells[shellIndex];

            let shouldExplode = shell.shouldExplode;

            for (const enemy of this.enemies) {
                const hitEnemy =
                    shell.x < enemy.x + enemy.size &&
                    shell.x + shell.size > enemy.x &&
                    shell.y < enemy.y + enemy.size &&
                    shell.y + shell.size > enemy.y;

                if (hitEnemy) {
                    shouldExplode = true;
                    break;
                }
            }

            if (shouldExplode) {
                this.explodeShell(shell);
                this.shells.splice(shellIndex, 1);
            } else if (!shell.active) {
                this.shells.splice(shellIndex, 1);
            }
        }
    }

    explodeShell(shell) {
        this.effects.push(new Explosion(shell.centerX, shell.centerY, shell.radius));

        for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
            const enemy = this.enemies[enemyIndex];

            const distance = getDistance(
                shell.centerX,
                shell.centerY,
                enemy.centerX,
                enemy.centerY
            );

            if (distance > shell.radius) {
                continue;
            }

            const visible = this.terrain.hasLineOfSight(
                shell.centerX,
                shell.centerY,
                enemy.centerX,
                enemy.centerY
            );

            if (!visible) {
                continue;
            }

            const falloff = 1 - distance / shell.radius;
            const damageMultiplier = enemy.isBoss ? CONFIG.boss.shellDamageMultiplier : 1;
            const damage = Math.max(1, shell.damage * (0.5 + falloff) * damageMultiplier);
            const knockback = CONFIG.shell.knockback * (0.4 + falloff);

            enemy.takeDamage(damage, knockback, shell.centerX);

            if (enemy.hp <= 0) {
                this.killEnemy(enemyIndex, enemy);
            }
        }
    }

    checkEnemyPlayerCollisions() {
        for (const enemy of this.enemies) {
            if (!checkRectRectCollision(this.player, enemy)) {
                continue;
            }

            this.resolvePlayerEnemyOverlap(enemy);
            this.player.takeDamage(enemy.damage, { useCooldown: true });
        }
    }

    resolvePlayerEnemyOverlap(enemy) {
        const playerRect = this.player.collisionRect;
        const enemyRect = enemy.collisionRect;

        const overlapLeft = playerRect.x + playerRect.width - enemyRect.x;
        const overlapRight = enemyRect.x + enemyRect.width - playerRect.x;
        const overlapTop = playerRect.y + playerRect.height - enemyRect.y;
        const overlapBottom = enemyRect.y + enemyRect.height - playerRect.y;

        const overlapX = Math.min(overlapLeft, overlapRight);
        const overlapY = Math.min(overlapTop, overlapBottom);

        if (overlapX <= 0 || overlapY <= 0) {
            return;
        }

        const playerIsAbove =
            playerRect.y + playerRect.height / 2 <
            enemyRect.y + enemyRect.height / 2;

        const playerIsLeft =
            playerRect.x + playerRect.width / 2 <
            enemyRect.x + enemyRect.width / 2;

        if (overlapY < overlapX * 0.65) {
            if (playerIsAbove) {
                this.player.y -= overlapY;
                this.player.vy = Math.min(0, this.player.vy);
            } else {
                this.player.y += overlapY;
                this.player.vy = Math.max(1, this.player.vy);
            }
        } else {
            const direction = playerIsLeft ? -1 : 1;
            const enemyIsBoss = enemy.isBoss;

            const playerPush = enemyIsBoss ? overlapX * 0.9 : overlapX * 0.58;
            const enemyPush = enemyIsBoss ? overlapX * 0.1 : overlapX * 0.42;

            this.player.x += direction * playerPush;
            enemy.x -= direction * enemyPush;

            this.player.vx += direction * 2.2;
            enemy.vx -= direction * (enemyIsBoss ? 0.5 : 1.5);
        }

        this.terrain.clampEntityToWorld(this.player);
        this.terrain.clampEntityToWorld(enemy);
    }

    updatePickups(timestamp) {
        for (const pickup of this.terrain.pickups) {
            if (pickup.enabled) {
                continue;
            }

            if (!pickup.respawnAt) {
                continue;
            }

            if (timestamp >= pickup.respawnAt) {
                pickup.enabled = true;
                pickup.respawnAt = null;
            }
        }
    }

    checkPickups(timestamp) {
        for (const pickup of this.terrain.pickups) {
            if (!pickup.enabled) {
                continue;
            }

            const hit =
                this.player.x < pickup.x + pickup.width &&
                this.player.x + this.player.size > pickup.x &&
                this.player.y < pickup.y + pickup.height &&
                this.player.y + this.player.size > pickup.y;

            if (!hit) {
                continue;
            }

            pickup.enabled = false;

            const respawnDelay = pickup.type === "weapon" ? 15000 : pickup.type === "health" ? 12000 : 8000;
            pickup.respawnAt = timestamp + respawnDelay;

            if (pickup.type === "weapon") {
                this.weaponManager.unlockWeapon(pickup.weapon);
                this.showMessage(`Picked up weapon: ${pickup.weapon}`, timestamp);
            } else if (pickup.type === "ammo") {
                this.weaponManager.addAmmo(pickup.weapon, pickup.amount);
                this.showMessage(`Picked up ${pickup.weapon} ammo +${pickup.amount}`, timestamp);
            } else if (pickup.type === "health") {
                const rawAmount = Number(pickup.amount || 1);
                const amount = rawAmount > CONFIG.player.hp ? 1 : Math.max(1, Math.ceil(rawAmount));
                const maxHp = Math.max(CONFIG.player.hp, Math.ceil(this.player.maxHp || CONFIG.player.hp));
                this.player.maxHp = maxHp;
                this.player.hp = Math.min(maxHp, Math.ceil(this.player.hp || 0) + amount);
                this.showMessage(`Picked up health +${amount}`, timestamp);
            }
        }
    }

    checkVoidDeaths() {
        if (this.terrain.isEntityInVoid(this.player)) {
            this.endGame("Fell into the void");
            return;
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];

            if (this.terrain.isEntityInVoid(enemy)) {
                this.enemies.splice(i, 1);
            }
        }
    }

    killEnemy(enemyIndex, enemy) {
        this.enemies.splice(enemyIndex, 1);
        this.score += enemy.isBoss ? 150 : 10;
    }

    endGame(reason) {
        if (this.gameOver) {
            return;
        }

        this.gameOver = true;
        this.gameOverReason = reason;
    }

    getInitialPlayerStart() {
        if (this.isMultiplayer) {
            return this.terrain.getPlayerSpawnPoint(true);
        }

        return this.terrain.getPlayerStart();
    }

    restart() {
        this.waveManager = new WaveManager(this.canvas, this.terrain);
        this.weaponManager = new WeaponManager();

        const start = this.getInitialPlayerStart();
        this.player = new Player(start.x, start.y - CONFIG.player.size);

        this.applyMultiplayerRules();

        for (const pickup of this.terrain.pickups) {
            pickup.enabled = true;
        }

        this.bullets = [];
        this.shells = [];
        this.lazers = [];
        this.enemies = [];
        this.effects = [];

        this.score = 0;

        this.gameOver = false;
        this.gameOverReason = "";

        this.freeCamera = false;
        this.paused = false;
        this.spectating = false;
        this.multiplayerDead = false;
        this.multiplayerRankingShown = false;
        this.lastAttackerId = null;

        this.camera.snapToTarget(this.player);
    }

    restartMultiplayerMatch(shouldBroadcast = true) {
        if (!this.isMultiplayer) {
            this.restart();
            return;
        }

        if (shouldBroadcast && !this.multiplayerClient?.isHost) {
            return;
        }

        this.restart();
        this.lastMultiplayerSyncTime = -Infinity;

        if (shouldBroadcast) {
            this.multiplayerClient?.sendRestartMatch();
        } else {
            this.multiplayerClient?.resetMatchState();
        }

        this.multiplayerClient?.restoreLocalPlayerAfterRestart({
            x: this.player.x,
            y: this.player.y,
            vx: this.player.vx,
            vy: this.player.vy,
            facing: this.player.facing,
            hp: this.player.hp,
            maxHp: this.player.maxHp,
            alive: true,
            selectedWeapon: this.weaponManager.getSelectedWeapon()?.id || "bullet",
            aimAngle: this.player.aimAngle,
            aimFlipY: this.player.aimFlipY
        });

        this.syncMultiplayerSnapshot(performance.now() + 1000);
    }

    handleMultiplayerRestartInput() {
        if (!this.multiplayerClient?.isHost) {
            return;
        }

        if (!this.input.wasLeftMousePressed() || !this.restartButtonRect) {
            return;
        }

        const { x, y, width, height } = this.restartButtonRect;
        const mouse = this.input.mouse;
        const inside =
            mouse.x >= x &&
            mouse.x <= x + width &&
            mouse.y >= y &&
            mouse.y <= y + height;

        if (inside) {
            this.restartMultiplayerMatch(true);
        }
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    draw(timestamp) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawSky();

        this.camera.apply(this.ctx);

        this.terrain.draw(this.ctx);

        for (const bullet of this.bullets) {
            bullet.draw(this.ctx);
        }

        for (const shell of this.shells) {
            shell.draw(this.ctx);
        }

        for (const lazer of this.lazers) {
            lazer.draw(this.ctx);
        }

        if (!this.isMultiplayer) {
            for (const enemy of this.enemies) {
                enemy.draw(this.ctx);
            }
        }

        this.drawRemotePlayers();
        this.player.draw(this.ctx, this.weaponManager.getSelectedWeapon()?.id || "bullet");
        this.drawLocalPlayerOverheadInfo();

        if (this.settings.showHitboxes) {
            this.drawHitboxes();
        }

        for (const effect of this.effects) {
            effect.draw(this.ctx);
        }

        this.camera.restore(this.ctx);

        this.drawUI(timestamp);

        if (this.input.chatOpen) {
            this.drawChatBox();
        }

        if (timestamp < this.messageEndTime) {
            this.drawMessage();
        }

        if (this.gameOver && !this.isMultiplayer) {
            this.drawGameOver();
        }

        if (this.multiplayerRankingShown) {
            this.drawLeaderboard();
        }
    }

    drawRemotePlayers() {
        if (!this.multiplayerClient) {
            return;
        }

        for (const remote of this.multiplayerClient.getRemotePlayers()) {
            if (remote.alive === false) {
                continue;
            }

            this.ctx.save();

            const hurtSynced = Number(remote.damageCooldown || 0) > 0 || Number(remote.hurtUntil || 0) > performance.now();

            this.ctx.globalAlpha = 0.92;
            this.ctx.fillStyle = hurtSynced ? "#fb7185" : "#a78bfa";
            this.ctx.fillRect(remote.x, remote.y, CONFIG.player.size, CONFIG.player.size);

            this.ctx.strokeStyle = "white";
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(remote.x, remote.y, CONFIG.player.size, CONFIG.player.size);

            this.drawRemotePlayerGun(remote);
            this.drawPlayerOverheadInfo(remote);

            this.ctx.restore();
        }
    }

    drawLocalPlayerOverheadInfo() {
        if (!this.isMultiplayer || this.multiplayerDead) {
            return;
        }

        this.drawPlayerOverheadInfo({
            x: this.player.x,
            y: this.player.y,
            hp: this.player.hp,
            maxHp: this.player.maxHp,
            name: this.multiplayerClient?.playerName || "Player"
        });
    }

    drawPlayerOverheadInfo(player) {
        const centerX = player.x + CONFIG.player.size / 2;
        const hp = Math.max(0, Math.ceil(Number(player.hp ?? 0)));
        const maxHp = Math.max(hp, Math.ceil(Number(player.maxHp ?? CONFIG.player.hp)));

        this.ctx.save();
        this.ctx.textAlign = "center";
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = "rgba(15, 23, 42, 0.85)";

        this.ctx.font = "14px Arial";
        this.ctx.fillStyle = "white";
        this.ctx.strokeText(player.name || "Player", centerX, player.y - 24);
        this.ctx.fillText(player.name || "Player", centerX, player.y - 24);

        this.ctx.font = "12px Arial";
        const hpText = `${hp}/${maxHp}`;
        this.ctx.strokeText(hpText, centerX, player.y - 8);
        this.ctx.fillText(hpText, centerX, player.y - 8);
        this.ctx.restore();
    }

    drawRemotePlayerGun(remote) {
        const size = CONFIG.player.size;
        const angle = Number.isFinite(remote.aimAngle)
            ? remote.aimAngle
            : remote.facing === -1 ? Math.PI : 0;
        const cx = remote.x + size / 2;
        const cy = remote.y + size / 2;

        this.ctx.save();
        this.ctx.translate(cx, cy);
        drawWeaponModel(
            this.ctx,
            size,
            angle,
            Boolean(remote.aimFlipY),
            remote.selectedWeapon || "bullet"
        );
        this.ctx.restore();
    }

    drawHitboxes() {
        this.ctx.save();

        this.ctx.strokeStyle = "rgba(34, 211, 238, 0.9)";
        this.ctx.lineWidth = 2;

        const playerRect = this.player.collisionRect;
        this.ctx.strokeRect(playerRect.x, playerRect.y, playerRect.width, playerRect.height);

        this.ctx.strokeStyle = "rgba(239, 68, 68, 0.9)";

        for (const enemy of this.enemies) {
            const rect = enemy.collisionRect;
            this.ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        }

        this.ctx.strokeStyle = "rgba(250, 204, 21, 0.75)";

        for (const block of this.terrain.terrainBlocks) {
            const rect = this.terrain.getBlockCollisionRect(block);
            this.ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        }

        this.ctx.restore();
    }

    drawSky() {
        drawSeasonBackground(this.ctx, this.canvas, this.season, {
            cameraX: this.camera.x,
            cameraY: this.camera.y,
            zoom: 1
        });
    }

    drawUI(timestamp) {
        const selected = this.weaponManager.getSelectedWeapon();

        this.ctx.save();

        this.ctx.textBaseline = "middle";
        const healthRows = this.drawHealthHearts(24, 34, this.player.hp, this.player.maxHp);

        const ammoY = 34 + healthRows * 18 + 10;
        const ammoRows = this.drawSelectedAmmoSlots(selected, 24, ammoY);
        const hudY = ammoY + Math.max(1, ammoRows) * 18 + 34;

        this.ctx.fillStyle = "#facc15";
        this.ctx.font = "18px Arial";
        this.ctx.fillText(`Score ${this.score}`, 24, hudY);

        let infoLine = 28;

        if (this.freeCamera) {
            this.ctx.fillStyle = "#facc15";
            this.ctx.font = "16px Arial";
            this.ctx.fillText("Free Camera", 24, hudY + infoLine);
            infoLine += 26;
        }

        if (this.isMultiplayer) {
            this.ctx.fillStyle = "#facc15";
            this.ctx.font = "16px Arial";
            const modeText = this.isCoopMultiplayer ? "Multiplayer: Co-op vs enemies" : "Multiplayer: Brawl";
            this.ctx.fillText(modeText, 24, hudY + infoLine);
            infoLine += 26;

            if (this.multiplayerDead || this.spectating) {
                this.ctx.fillText("Spectating · Press Tab to switch target", 24, hudY + infoLine);
            }
        }

        this.ctx.restore();

        if (!this.isMultiplayer || this.isCoopMultiplayer) {
            this.drawWaveCenterInfo(timestamp);
        } else {
            this.drawMultiplayerCenterInfo();
        }
    }

    drawHealthHearts(x, y, hp, maxHp = CONFIG.player.hp) {
        const icons = this.terrain.mapData.assets?.iconTextures || {};
        const totalSlots = Math.max(8, Math.ceil(Math.max(maxHp, hp)));
        const filledSlots = Math.max(0, Math.ceil(hp));
        const slotsPerRow = 8;
        const iconSize = 24;
        const gapX = 26;
        const rowStep = 14;
        const rows = Math.ceil(totalSlots / slotsPerRow);

        this.ctx.save();
        this.ctx.textBaseline = "middle";

        for (let i = 0; i < totalSlots; i++) {
            const row = Math.floor(i / slotsPerRow);
            const col = i % slotsPerRow;
            const filled = i < filledSlots;
            const textureId = filled ? icons.heartFull : icons.heartEmpty;
            const slotX = x + col * gapX;
            const slotY = y + row * rowStep;

            drawTexture(this.ctx, this.terrain.mapData, textureId, slotX - 2, slotY - 13, iconSize, iconSize, {
                fallback: () => {
                    this.ctx.fillStyle = filled ? "#ef4444" : "rgba(239, 68, 68, 0.24)";
                    this.ctx.font = "25px Arial";
                    this.ctx.fillText("♥", slotX, slotY);
                }
            });
        }

        this.ctx.restore();
        return rows;
    }

    drawSelectedAmmoSlots(weapon, x, y) {
        if (!weapon) {
            return 0;
        }

        const slotsPerRow = 8;
        const gapX = 26;
        const rowStep = 14;
        const infiniteAmmo = Boolean(this.weaponManager.infiniteAmmo);
        const totalSlots = infiniteAmmo
            ? slotsPerRow
            : Math.max(1, Math.floor(weapon.maxAmmo || 0));
        const filledSlots = infiniteAmmo
            ? totalSlots
            : Math.max(0, Math.min(totalSlots, Math.floor(weapon.ammo || 0)));
        const rows = infiniteAmmo ? 1 : Math.max(1, Math.ceil(totalSlots / slotsPerRow));

        if (!weapon.unlocked && !infiniteAmmo) {
            for (let i = 0; i < totalSlots; i++) {
                const row = Math.floor(i / slotsPerRow);
                const col = i % slotsPerRow;
                const slotX = x + col * gapX;
                const slotY = y + row * rowStep;
                this.drawAmmoSlotByWeapon(weapon.id, slotX, slotY, false);
            }
            return rows;
        }

        for (let i = 0; i < totalSlots; i++) {
            const row = Math.floor(i / slotsPerRow);
            const col = i % slotsPerRow;
            const slotX = x + col * gapX;
            const slotY = y + row * rowStep;
            this.drawAmmoSlotByWeapon(weapon.id, slotX, slotY, i < filledSlots);
        }

        if (infiniteAmmo) {
            this.ctx.save();
            this.ctx.fillStyle = "white";
            this.ctx.font = "22px Arial";
            this.ctx.textBaseline = "middle";
            this.ctx.fillText("∞", x + slotsPerRow * gapX + 8, y);
            this.ctx.restore();
        }

        return rows;
    }

    drawAmmoSlotByWeapon(weaponId, x, y, filled) {
        if (weaponId === "bullet") {
            this.drawAmmoBulletSlot(x, y, filled);
        } else if (weaponId === "shell") {
            this.drawAmmoShellSlot(x + 10, y, filled);
        } else if (weaponId === "lazer") {
            this.drawAmmoLazerSlot(x, y, filled);
        }
    }

    drawAmmoBulletSlot(x, y, filled) {
        if (!filled) {
            this.drawAmmoBulletFallback(x, y, false);
            return;
        }

        const icons = this.terrain.mapData.assets?.iconTextures || {};
        const drawn = drawTexture(this.ctx, this.terrain.mapData, icons.ammoBullet, x, y - 8, 20, 16, {
            alpha: 1,
            fallback: () => this.drawAmmoBulletFallback(x, y, true)
        });

        if (!drawn) {
            this.drawAmmoBulletFallback(x, y, true);
        }
    }

    drawAmmoBulletFallback(x, y, filled) {
        this.ctx.save();
        this.ctx.globalAlpha = filled ? 1 : 0.55;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - 7);
        this.ctx.lineTo(x + 13, y - 7);
        this.ctx.lineTo(x + 20, y);
        this.ctx.lineTo(x + 13, y + 7);
        this.ctx.lineTo(x, y + 7);
        this.ctx.closePath();
        if (filled) {
            this.ctx.fillStyle = "#cbd5e1";
            this.ctx.fill();
        }
        this.ctx.strokeStyle = filled ? "#f8fafc" : "#94a3b8";
        this.ctx.lineWidth = filled ? 1.5 : 2;
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawAmmoLazerSlot(x, y, filled) {
        this.ctx.save();
        this.ctx.globalAlpha = filled ? 1 : 0.55;
        this.ctx.lineCap = "round";
        if (filled) {
            this.ctx.strokeStyle = "#38bdf8";
            this.ctx.lineWidth = 5;
            this.ctx.beginPath();
            this.ctx.moveTo(x + 1, y);
            this.ctx.lineTo(x + 19, y);
            this.ctx.stroke();
            this.ctx.strokeStyle = "#e0f2fe";
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(x + 3, y);
            this.ctx.lineTo(x + 17, y);
            this.ctx.stroke();
        } else {
            this.ctx.strokeStyle = "#94a3b8";
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(x + 1, y - 3);
            this.ctx.lineTo(x + 19, y - 3);
            this.ctx.moveTo(x + 1, y + 3);
            this.ctx.lineTo(x + 19, y + 3);
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    drawAmmoShellSlot(x, y, filled) {
        if (!filled) {
            this.drawAmmoShellFallback(x, y, false);
            return;
        }

        const icons = this.terrain.mapData.assets?.iconTextures || {};
        const drawn = drawTexture(this.ctx, this.terrain.mapData, icons.ammoShell, x - 8, y - 8, 16, 16, {
            alpha: 1,
            fallback: () => this.drawAmmoShellFallback(x, y, true)
        });

        if (!drawn) {
            this.drawAmmoShellFallback(x, y, true);
        }
    }

    drawAmmoShellFallback(x, y, filled) {
        this.ctx.save();
        this.ctx.globalAlpha = filled ? 1 : 0.55;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 8, 0, Math.PI * 2);
        if (filled) {
            this.ctx.fillStyle = "#facc15";
            this.ctx.fill();
        }
        this.ctx.strokeStyle = filled ? "#fef3c7" : "#94a3b8";
        this.ctx.lineWidth = filled ? 1.5 : 2;
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawMultiplayerCenterInfo() {
        const players = this.multiplayerClient?.getPlayers() || [];
        const alive = players.filter((player) => player.alive !== false).length;

        this.ctx.save();

        this.ctx.textAlign = "center";
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
        this.ctx.fillRect(this.canvas.width / 2 - 170, 28, 340, 84);

        this.ctx.fillStyle = "white";
        this.ctx.font = "28px Arial";
        this.ctx.fillText("Multiplayer", this.canvas.width / 2, 62);

        this.ctx.font = "18px Arial";
        this.ctx.fillText(
            `Alive ${alive}/${players.length}`,
            this.canvas.width / 2,
            94
        );

        this.ctx.restore();
    }

    drawLeaderboard() {
        const leaderboard = this.multiplayerClient?.getLeaderboard() || [];

        this.ctx.save();

        this.ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const panelWidth = 520;
        const panelX = this.canvas.width / 2 - panelWidth / 2;
        const panelY = 110;

        const panelHeight = 150 + leaderboard.length * 44;

        this.ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
        this.ctx.fillRect(panelX, panelY, panelWidth, panelHeight);

        this.ctx.fillStyle = "#111827";
        this.ctx.textAlign = "center";
        this.ctx.font = "38px Arial";
        this.ctx.fillText("排行榜", this.canvas.width / 2, panelY + 48);

        this.ctx.textAlign = "left";
        this.ctx.font = "18px Arial";
        this.ctx.fillText("名次", panelX + 36, panelY + 86);
        this.ctx.fillText("玩家", panelX + 130, panelY + 86);
        this.ctx.fillText("击杀玩家数", panelX + 330, panelY + 86);

        this.ctx.font = "18px Arial";

        for (let i = 0; i < leaderboard.length; i++) {
            const player = leaderboard[i];
            const y = panelY + 122 + i * 44;

            this.ctx.fillStyle = i % 2 === 0
                ? "rgba(15, 23, 42, 0.06)"
                : "rgba(15, 23, 42, 0.12)";

            this.ctx.fillRect(panelX + 20, y - 26, panelWidth - 40, 36);

            this.ctx.fillStyle = "#111827";
            this.ctx.fillText(String(player.rank), panelX + 46, y);
            this.ctx.fillText(player.name, panelX + 130, y);
            this.ctx.fillText(String(player.kills), panelX + 370, y);
        }

        const buttonWidth = 210;
        const buttonHeight = 42;
        const buttonX = this.canvas.width / 2 - buttonWidth / 2;
        const buttonY = panelY + 102 + leaderboard.length * 44;

        this.restartButtonRect = {
            x: buttonX,
            y: buttonY,
            width: buttonWidth,
            height: buttonHeight
        };

        if (this.multiplayerClient?.isHost) {
            this.ctx.fillStyle = "#2563eb";
            this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);

            this.ctx.strokeStyle = "#dbeafe";
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);

            this.ctx.fillStyle = "white";
            this.ctx.font = "18px Arial";
            this.ctx.textAlign = "center";
            this.ctx.fillText("重新开始", this.canvas.width / 2, buttonY + 27);
        } else {
            this.ctx.fillStyle = "#374151";
            this.ctx.font = "16px Arial";
            this.ctx.textAlign = "center";
            this.ctx.fillText("等待房主重新开始", this.canvas.width / 2, buttonY + 25);
        }

        this.ctx.font = "16px Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillStyle = "#111827";
        this.ctx.fillText("按 ESC 退出游戏", this.canvas.width / 2, buttonY + 70);

        this.ctx.restore();
    }

    drawChatBox() {
        this.ctx.save();

        this.ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
        this.ctx.fillRect(20, this.canvas.height - 62, this.canvas.width - 40, 42);

        this.ctx.strokeStyle = "#64748b";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(20, this.canvas.height - 62, this.canvas.width - 40, 42);

        this.ctx.fillStyle = "white";
        this.ctx.font = "18px Arial";
        this.ctx.fillText(this.input.chatText, 34, this.canvas.height - 35);

        this.ctx.restore();
    }

    drawMessage() {
        this.ctx.save();

        this.ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        this.ctx.fillRect(20, this.canvas.height - 108, this.canvas.width - 40, 34);

        this.ctx.fillStyle = "#e5e7eb";
        this.ctx.font = "16px Arial";
        this.ctx.fillText(this.message, 34, this.canvas.height - 86);

        this.ctx.restore();
    }

    drawGameOver() {
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.68)";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = "white";
        this.ctx.textAlign = "center";

        this.ctx.font = "52px Arial";
        this.ctx.fillText(
            "Game Over",
            this.canvas.width / 2,
            this.canvas.height / 2 - 50
        );

        this.ctx.font = "24px Arial";
        this.ctx.fillText(
            this.gameOverReason,
            this.canvas.width / 2,
            this.canvas.height / 2 - 10
        );

        this.ctx.font = "26px Arial";
        this.ctx.fillText(
            `Final Score: ${this.score}`,
            this.canvas.width / 2,
            this.canvas.height / 2 + 30
        );

        this.ctx.fillText(
            `Reached Wave: ${this.waveManager.wave}`,
            this.canvas.width / 2,
            this.canvas.height / 2 + 64
        );

        this.ctx.font = "18px Arial";
        this.ctx.fillText(
            "Left click to restart",
            this.canvas.width / 2,
            this.canvas.height / 2 + 105
        );

        this.ctx.textAlign = "start";
    }

    drawBulletIcon(x, y) {
        const icons = this.terrain.mapData.assets?.iconTextures || {};
        const drawn = drawTexture(this.ctx, this.terrain.mapData, icons.ammoBullet, x, y - 10, 28, 20, {
            fallback: () => this.drawAmmoBulletFallback(x, y, true)
        });

        if (!drawn) {
            this.drawAmmoBulletFallback(x, y, true);
        }
    }

    drawShellIcon(x, y) {
        const icons = this.terrain.mapData.assets?.iconTextures || {};
        const drawn = drawTexture(this.ctx, this.terrain.mapData, icons.ammoShell, x - 11, y - 11, 22, 22, {
            fallback: () => this.drawAmmoShellFallback(x, y, true)
        });

        if (!drawn) {
            this.drawAmmoShellFallback(x, y, true);
        }
    }

    drawWaveCenterInfo(timestamp) {
        const remaining = this.waveManager.getRemainingEnemyCount(this.enemies);
        const total = this.waveManager.getTotalEnemyCount();

        this.ctx.save();

        this.ctx.textAlign = "center";

        this.ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
        this.ctx.fillRect(
            this.canvas.width / 2 - 170,
            28,
            340,
            96
        );

        this.ctx.fillStyle = "white";
        this.ctx.font = "30px Arial";

        if (this.waveManager.inBreak) {
            const seconds = this.waveManager.getBreakSecondsLeft(timestamp);

            this.ctx.fillText(
                `Next Wave In ${seconds}`,
                this.canvas.width / 2,
                66
            );

            this.ctx.font = "18px Arial";
            this.ctx.fillText(
                `Wave ${this.waveManager.wave + 1}`,
                this.canvas.width / 2,
                98
            );
        } else {
            this.ctx.fillText(
                this.waveManager.isBossWave
                    ? `Boss Wave ${this.waveManager.wave}`
                    : `Wave ${this.waveManager.wave}`,
                this.canvas.width / 2,
                64
            );

            this.ctx.font = "18px Arial";
            this.ctx.fillText(
                `Enemies ${remaining}/${total}`,
                this.canvas.width / 2,
                98
            );
        }

        this.ctx.restore();
    }

    getPlayerListForMenu() {
        if (!this.multiplayerClient) {
            return [
                {
                    name: "Player 1",
                    alive: true,
                    kills: 0,
                    self: true
                }
            ];
        }

        return this.multiplayerClient.getPlayers().map((player) => {
            return {
                name: player.name,
                alive: player.alive !== false,
                kills: player.kills || 0,
                self: player.id === this.multiplayerClient.playerId
            };
        });
    }
}