import { CONFIG } from "./config.js";
import { Player } from "./player.js";
import { Bullet, Shell } from "./projectile.js";
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

export class Game {
    constructor(canvas, mapData = null, settings = null, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");

        this.resizeCanvas();
        window.addEventListener("resize", () => this.resizeCanvas());

        this.mode = options.mode || "single";
        this.multiplayerClient = options.multiplayerClient || null;
        this.isMultiplayer = this.mode === "multiplayer";

        this.settings = settings || {
            season: mapData?.season || "spring",
            showHitboxes: false
        };

        this.input = new InputManager(this.settings);

        this.season = this.settings.season || mapData?.season || "spring";
        this.terrain = new Terrain(canvas, mapData || undefined);

        this.camera = new Camera(
            canvas,
            this.terrain.worldWidth,
            this.terrain.worldHeight
        );

        this.waveManager = new WaveManager(canvas, this.terrain);
        this.weaponManager = new WeaponManager();

        const start = this.terrain.getPlayerStart();
        this.player = new Player(start.x, start.y - CONFIG.player.size);

        this.bullets = [];
        this.shells = [];
        this.enemies = [];
        this.effects = [];

        this.score = 0;

        this.gameOver = false;
        this.gameOverReason = "";

        this.freeCamera = false;
        this.paused = false;
        this.running = false;

        this.spectating = false;
        this.spectatorIndex = 0;
        this.multiplayerDead = false;
        this.multiplayerRankingShown = false;
        this.lastMultiplayerSyncTime = 0;
        this.lastAttackerId = null;

        this.noPlayerInput = {
            isDown: () => false,
            wasPressed: () => false,
            isActionDown: () => false,
            wasActionPressed: () => false
        };

        this.message = "";
        this.messageEndTime = 0;
    }

    start() {
        if (this.running) {
            return;
        }

        this.running = true;
        requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
    }

    stop() {
        this.running = false;
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

        if (!this.paused) {
            if (!this.gameOver) {
                this.update(timestamp);
            } else if (!this.isMultiplayer && this.input.wasLeftMousePressed()) {
                this.restart();
            }
        }

        this.draw(timestamp);
        this.input.endFrame();

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

        this.handleWeaponSelection();
        this.weaponManager.update(timestamp);
        this.handleWeapons(timestamp);

        this.updateProjectiles();

        this.waveManager.update(timestamp, this.enemies);

        this.updateEnemies();
        this.updateEffects();
        this.updatePickups(timestamp);

        this.checkBulletHits();
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

            this.handleWeaponSelection();
            this.weaponManager.update(timestamp);
            this.handleWeapons(timestamp);
            this.checkPickups(timestamp);
            this.checkMultiplayerVoidDeath();
        }

        this.updateProjectiles();
        this.updateEffects();
        this.updatePickups(timestamp);
        this.checkMultiplayerProjectileHits();

        if (this.multiplayerDead || this.spectating) {
            this.updateSpectatorTarget();
        } else {
            this.camera.update(this.player, this.input, false);
        }

        this.syncMultiplayerSnapshot(timestamp);

        if (this.multiplayerClient?.isMatchFinished()) {
            this.multiplayerRankingShown = true;
        }
    }

    consumeMultiplayerEvents() {
        if (!this.multiplayerClient) {
            return;
        }

        for (const event of this.multiplayerClient.consumeEvents()) {
            if (event.type === "hit" && !this.multiplayerDead) {
                this.player.takeDamage(event.damage);
                this.lastAttackerId = event.attackerId;

                if (this.player.hp <= 0) {
                    this.player.hp = 0;
                    this.dieInMultiplayer(event.attackerId);
                }
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
            alive: !this.multiplayerDead,
            kills: this.multiplayerClient.getLocalPlayer()?.kills || 0
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

    checkMultiplayerProjectileHits() {
        if (!this.multiplayerClient) {
            return;
        }

        const remotePlayers = this.multiplayerClient
            .getRemotePlayers()
            .filter((player) => player.alive !== false);

        for (let bulletIndex = this.bullets.length - 1; bulletIndex >= 0; bulletIndex--) {
            const bullet = this.bullets[bulletIndex];

            for (const player of remotePlayers) {
                const rect = {
                    x: player.x + 3,
                    y: player.y + 2,
                    width: CONFIG.player.size - 6,
                    height: CONFIG.player.size - 2
                };

                const hit =
                    bullet.x < rect.x + rect.width &&
                    bullet.x + bullet.width > rect.x &&
                    bullet.y < rect.y + rect.height &&
                    bullet.y + bullet.height > rect.y;

                if (!hit) {
                    continue;
                }

                this.multiplayerClient.sendHit(player.id, bullet.damage);
                this.bullets.splice(bulletIndex, 1);
                break;
            }
        }

        for (let shellIndex = this.shells.length - 1; shellIndex >= 0; shellIndex--) {
            const shell = this.shells[shellIndex];

            if (!shell.shouldExplode && shell.active) {
                continue;
            }

            for (const player of remotePlayers) {
                const distance = getDistance(
                    shell.centerX,
                    shell.centerY,
                    player.x + CONFIG.player.size / 2,
                    player.y + CONFIG.player.size / 2
                );

                if (distance > shell.radius) {
                    continue;
                }

                const falloff = 1 - distance / shell.radius;
                const damage = Math.max(1, shell.damage * (0.5 + falloff));
                this.multiplayerClient.sendHit(player.id, damage);
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
                "/help | /health <value> | /weapon <shell> | /autoammo | /speedshot | /infiniteammo",
                timestamp
            );
            return;
        }

        if (command === "health") {
            const amount = Number(parts[1]);

            if (!Number.isFinite(amount) || amount <= 0) {
                this.showMessage("Usage: /health <value>", timestamp);
                return;
            }

            const cost = Math.ceil(amount * 25);

            if (!this.spendScore(cost, timestamp)) {
                return;
            }

            this.player.hp += amount;
            this.showMessage(`Health +${amount} | Cost ${cost}`, timestamp);
            return;
        }

        if (command === "weapon") {
            const type = parts[1]?.toLowerCase();

            if (type !== "shell") {
                this.showMessage("Usage: /weapon shell", timestamp);
                return;
            }

            const cost = 300;

            if (!this.spendScore(cost, timestamp)) {
                return;
            }

            this.weaponManager.unlockWeapon("shell");
            this.showMessage("Unlocked Cannon | Cost 300", timestamp);
            return;
        }

        if (command === "autoammo") {
            const cost = 400;

            if (!this.spendScore(cost, timestamp)) {
                return;
            }

            const enabled = this.weaponManager.toggleAutoAmmo();
            this.showMessage(`Auto fire: ${enabled ? "ON" : "OFF"} | Cost 400`, timestamp);
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
        }

        this.weaponManager.consumeFire(timestamp);
    }

    fireBullet() {
        const direction = this.player.facing;

        const x = direction === 1
            ? this.player.x + this.player.size
            : this.player.x - CONFIG.bullet.width;

        const y =
            this.player.y +
            this.player.size / 2 -
            CONFIG.bullet.height / 2;

        this.bullets.push(new Bullet(x, y, direction));
    }

    fireShell() {
        const direction = this.player.facing;

        const x = direction === 1
            ? this.player.x + this.player.size
            : this.player.x - CONFIG.shell.size;

        const y =
            this.player.y +
            this.player.size / 2 -
            CONFIG.shell.size / 2;

        this.shells.push(new Shell(x, y, direction));
    }

    updateProjectiles() {
        for (const bullet of this.bullets) {
            bullet.update(this.terrain);
        }

        for (const shell of this.shells) {
            shell.update(this.terrain);
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
            const damage = Math.max(1, shell.damage * (0.5 + falloff));
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
            this.player.takeDamage(enemy.damage);
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

            const respawnDelay = pickup.type === "weapon" ? 15000 : 8000;
            pickup.respawnAt = timestamp + respawnDelay;

            if (pickup.type === "weapon") {
                this.weaponManager.unlockWeapon(pickup.weapon);
                this.showMessage(`Picked up weapon: ${pickup.weapon}`, timestamp);
            } else if (pickup.type === "ammo") {
                this.weaponManager.addAmmo(pickup.weapon, pickup.amount);
                this.showMessage(`Picked up ${pickup.weapon} ammo +${pickup.amount}`, timestamp);
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

    restart() {
        this.waveManager = new WaveManager(this.canvas, this.terrain);
        this.weaponManager = new WeaponManager();

        const start = this.terrain.getPlayerStart();
        this.player = new Player(start.x, start.y - CONFIG.player.size);

        for (const pickup of this.terrain.pickups) {
            pickup.enabled = true;
        }

        this.bullets = [];
        this.shells = [];
        this.enemies = [];
        this.effects = [];

        this.score = 0;

        this.gameOver = false;
        this.gameOverReason = "";

        this.freeCamera = false;
        this.paused = false;

        this.camera.snapToTarget(this.player);
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

        if (!this.isMultiplayer) {
            for (const enemy of this.enemies) {
                enemy.draw(this.ctx);
            }
        }

        this.drawRemotePlayers();
        this.player.draw(this.ctx);

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

            this.ctx.globalAlpha = 0.92;
            this.ctx.fillStyle = "#a78bfa";
            this.ctx.fillRect(remote.x, remote.y, CONFIG.player.size, CONFIG.player.size);

            this.ctx.strokeStyle = "white";
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(remote.x, remote.y, CONFIG.player.size, CONFIG.player.size);

            this.ctx.fillStyle = "white";
            this.ctx.font = "14px Arial";
            this.ctx.textAlign = "center";
            this.ctx.fillText(
                remote.name || "Player",
                remote.x + CONFIG.player.size / 2,
                remote.y - 10
            );

            this.ctx.restore();
        }
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

        const hpPercent = Math.max(
            0,
            Math.min(
                100,
                Math.round((this.player.hp / CONFIG.player.hp) * 100)
            )
        );

        this.ctx.save();

        this.ctx.textBaseline = "middle";
        this.ctx.font = "24px Arial";

        this.ctx.fillStyle = "#ef4444";
        this.ctx.fillText("♥", 24, 34);

        this.ctx.fillStyle = "white";
        this.ctx.font = "18px Arial";
        this.ctx.fillText(`${hpPercent}%`, 56, 35);

        this.drawSelectedAmmoSlots(selected, 24, 72);

        this.ctx.fillStyle = "#facc15";
        this.ctx.font = "18px Arial";
        this.ctx.fillText(`Score ${this.score}`, 24, 130);

        this.ctx.fillStyle = "white";
        this.ctx.font = "16px Arial";
        this.ctx.fillText(`Weapon: ${selected.name}`, 24, 158);

        if (this.freeCamera) {
            this.ctx.fillStyle = "#facc15";
            this.ctx.fillText("Free Camera", 24, 184);
        }

        if (this.isMultiplayer) {
            this.ctx.fillStyle = "#facc15";
            this.ctx.font = "16px Arial";
            this.ctx.fillText("Multiplayer: commands and monsters disabled", 24, 210);

            if (this.multiplayerDead || this.spectating) {
                this.ctx.fillText("Spectating · Press Tab to switch target", 24, 236);
            }
        }

        this.ctx.restore();

        if (!this.isMultiplayer) {
            this.drawWaveCenterInfo(timestamp);
        } else {
            this.drawMultiplayerCenterInfo();
        }
    }

    drawSelectedAmmoSlots(weapon, x, y) {
        const slots = 8;

        if (!weapon) {
            return;
        }

        if (!weapon.unlocked) {
            this.ctx.save();
            this.ctx.fillStyle = "#94a3b8";
            this.ctx.font = "18px Arial";
            this.ctx.fillText("LOCKED", x, y);
            this.ctx.restore();
            return;
        }

        const filledSlots = this.weaponManager.infiniteAmmo
            ? slots
            : Math.ceil((weapon.ammo / weapon.maxAmmo) * slots);

        for (let i = 0; i < slots; i++) {
            const slotX = x + i * 24;
            const filled = i < filledSlots;

            if (weapon.id === "bullet") {
                this.drawAmmoBulletSlot(slotX, y, filled);
            } else if (weapon.id === "shell") {
                this.drawAmmoShellSlot(slotX + 8, y, filled);
            }
        }
    }

    drawAmmoBulletSlot(x, y, filled) {
        this.ctx.save();

        this.ctx.globalAlpha = filled ? 1 : 0.28;
        this.ctx.fillStyle = filled ? "#cbd5e1" : "#64748b";

        this.ctx.beginPath();
        this.ctx.moveTo(x, y - 7);
        this.ctx.lineTo(x + 13, y - 7);
        this.ctx.lineTo(x + 20, y);
        this.ctx.lineTo(x + 13, y + 7);
        this.ctx.lineTo(x, y + 7);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.strokeStyle = filled ? "#f8fafc" : "#94a3b8";
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        this.ctx.restore();
    }

    drawAmmoShellSlot(x, y, filled) {
        this.ctx.save();

        this.ctx.globalAlpha = filled ? 1 : 0.28;
        this.ctx.fillStyle = filled ? "#facc15" : "#64748b";

        this.ctx.beginPath();
        this.ctx.arc(x, y, 8, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.strokeStyle = filled ? "#fef3c7" : "#94a3b8";
        this.ctx.lineWidth = 1.5;
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

        this.ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
        this.ctx.fillRect(panelX, panelY, panelWidth, 80 + leaderboard.length * 44);

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

        this.ctx.font = "16px Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillText("按 ESC 退出游戏", this.canvas.width / 2, panelY + 112 + leaderboard.length * 44);

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
        this.ctx.save();

        this.ctx.fillStyle = "#cbd5e1";

        this.ctx.beginPath();
        this.ctx.moveTo(x, y - 8);
        this.ctx.lineTo(x + 18, y - 8);
        this.ctx.lineTo(x + 26, y);
        this.ctx.lineTo(x + 18, y + 8);
        this.ctx.lineTo(x, y + 8);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.strokeStyle = "#f8fafc";
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        this.ctx.restore();
    }

    drawShellIcon(x, y) {
        this.ctx.save();

        this.ctx.fillStyle = "#facc15";

        this.ctx.beginPath();
        this.ctx.arc(x, y, 11, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.strokeStyle = "#fef3c7";
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        this.ctx.restore();
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