const PLAYER_TIMEOUT = 6000;
const DEFAULT_WS_PORT = 8080;

function getDefaultWebSocketUrl() {
    if (window.CUBE_SHOOT_WS_URL) {
        return window.CUBE_SHOOT_WS_URL;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.hostname || "localhost"}:${DEFAULT_WS_PORT}`;
}

function createId(prefix = "player") {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function clone(value) {
    if (typeof structuredClone === "function") {
        return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
}

export class MultiplayerClient {
    constructor({
        roomId,
        playerName,
        isHost = false,
        mapData = null,
        wsUrl = getDefaultWebSocketUrl(),
        onReady = null,
        onError = null,
        onClose = null
    }) {
        this.roomId = String(roomId).trim();
        this.playerId = createId("player");
        this.playerName = playerName?.trim() || "Player";
        this.isHost = isHost;
        this.wsUrl = wsUrl;

        this.players = new Map();
        this.pendingEvents = [];
        this.deathOrder = [];
        this.closed = false;
        this.ready = false;
        this.mapData = mapData ? clone(mapData) : null;

        this.onReady = onReady;
        this.onError = onError;
        this.onClose = onClose;

        this.upsertPlayer({
            id: this.playerId,
            name: this.playerName,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            facing: 1,
            hp: 100,
            alive: true,
            kills: 0,
            deathIndex: null,
            lastSeen: performance.now()
        });

        this.socket = new WebSocket(this.wsUrl);

        this.socket.addEventListener("open", () => {
            if (this.isHost) {
                this.sendRaw({
                    type: "createRoom",
                    roomId: this.roomId,
                    senderId: this.playerId,
                    player: this.getLocalPlayer(),
                    mapData: this.mapData
                });
            } else {
                this.sendRaw({
                    type: "joinRoom",
                    roomId: this.roomId,
                    senderId: this.playerId,
                    player: this.getLocalPlayer()
                });
            }
        });

        this.socket.addEventListener("message", (event) => {
            try {
                this.handleMessage(JSON.parse(event.data));
            } catch {
                // Ignore invalid packets.
            }
        });

        this.socket.addEventListener("close", () => {
            const wasClosedManually = this.closed;
            this.closed = true;
            window.clearInterval(this.heartbeatTimer);

            if (!wasClosedManually) {
                this.onClose?.();
            }
        });

        this.socket.addEventListener("error", () => {
            this.onError?.("WebSocket 连接失败。请确认服务器已启动，并检查 ws 地址是否正确。");
        });

        this.heartbeatTimer = window.setInterval(() => {
            this.prunePlayers();

            if (this.ready) {
                this.broadcast({
                    type: "heartbeat",
                    player: this.getLocalPlayer()
                });
            }
        }, 1000);
    }

    static createRoomId() {
        return String(Math.floor(100000 + Math.random() * 900000));
    }

    static getDefaultWebSocketUrl() {
        return getDefaultWebSocketUrl();
    }

    destroy() {
        if (this.closed) {
            return;
        }

        this.broadcast({
            type: "leave",
            playerId: this.playerId
        });

        this.closed = true;
        window.clearInterval(this.heartbeatTimer);
        this.socket.close();
    }

    sendRaw(message) {
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        }
    }

    broadcast(message) {
        if (this.closed || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }

        this.sendRaw({
            ...message,
            roomId: this.roomId,
            senderId: this.playerId,
            sentAt: performance.now()
        });
    }

    handleMessage(message) {
        if (!message) {
            return;
        }

        if (message.type === "roomCreated") {
            this.ready = true;
            this.mapData = message.mapData ? clone(message.mapData) : this.mapData;
            this.loadPlayers(message.players);
            this.mergeDeathOrder(message.deathOrder || []);
            this.onReady?.(this.mapData);
            return;
        }

        if (message.type === "joinSuccess") {
            this.ready = true;
            this.mapData = message.mapData ? clone(message.mapData) : this.mapData;
            this.loadPlayers(message.players);
            this.mergeDeathOrder(message.deathOrder || []);
            this.onReady?.(this.mapData);
            return;
        }

        if (message.type === "joinFailed") {
            this.onError?.(message.reason || "加入房间失败。");
            return;
        }

        if (message.roomId !== this.roomId) {
            return;
        }

        if (message.senderId === this.playerId) {
            return;
        }

        if (message.type === "playerJoined") {
            this.upsertPlayer(message.player);
            return;
        }

        if (message.type === "heartbeat" || message.type === "snapshot") {
            this.upsertPlayer(message.player);
            return;
        }

        if (message.type === "hitPlayer") {
            if (message.targetId === this.playerId) {
                this.pendingEvents.push({
                    type: "hit",
                    attackerId: message.attackerId,
                    damage: message.damage
                });
            }

            return;
        }

        if (message.type === "projectileFired") {
            this.pendingEvents.push({
                type: "projectileFired",
                projectile: message.projectile,
                ownerId: message.ownerId
            });

            return;
        }

        if (message.type === "restartMatch") {
            this.resetMatchState();
            this.pendingEvents.push({
                type: "restartMatch"
            });

            return;
        }

        if (message.type === "playerDied") {
            this.markPlayerDead(message.playerId, message.killerId);
            return;
        }

        if (message.type === "killCredit") {
            const player = this.players.get(message.killerId);

            if (player) {
                player.kills = Math.max(player.kills || 0, message.kills || 0);
            }

            return;
        }

        if (message.type === "leave") {
            const player = this.players.get(message.playerId);

            if (player) {
                player.lastSeen = -Infinity;
            }
        }
    }

    loadPlayers(players) {
        if (!Array.isArray(players)) {
            return;
        }

        for (const player of players) {
            this.upsertPlayer(player);
        }
    }

    upsertPlayer(player) {
        if (!player || !player.id) {
            return;
        }

        const existing = this.players.get(player.id) || {};

        this.players.set(player.id, {
            ...existing,
            ...player,
            name: player.name || existing.name || "Player",
            kills: Number(player.kills ?? existing.kills ?? 0),
            alive: player.alive !== false,
            deathIndex: player.deathIndex ?? existing.deathIndex ?? null,
            lastSeen: performance.now()
        });
    }

    getLocalPlayer() {
        return this.players.get(this.playerId);
    }

    updateLocalSnapshot(snapshot) {
        if (!this.ready) {
            return;
        }

        const local = {
            ...this.getLocalPlayer(),
            ...snapshot,
            id: this.playerId,
            name: this.playerName,
            lastSeen: performance.now()
        };

        this.players.set(this.playerId, local);

        this.broadcast({
            type: "snapshot",
            player: local
        });
    }

    sendHit(targetId, damage) {
        this.broadcast({
            type: "hitPlayer",
            targetId,
            attackerId: this.playerId,
            damage
        });
    }

    sendProjectile(projectile) {
        this.broadcast({
            type: "projectileFired",
            ownerId: this.playerId,
            projectile
        });
    }

    sendRestartMatch() {
        if (!this.isHost) {
            return;
        }

        this.resetMatchState();

        this.broadcast({
            type: "restartMatch"
        });
    }

    resetMatchState() {
        this.deathOrder = [];

        for (const player of this.players.values()) {
            player.alive = true;
            player.hp = 100;
            player.kills = 0;
            player.deathIndex = null;
            player.killerId = null;
        }
    }

    sendDeath(killerId = null) {
        this.markPlayerDead(this.playerId, killerId);

        this.broadcast({
            type: "playerDied",
            playerId: this.playerId,
            killerId
        });
    }

    addLocalKill() {
        const local = this.getLocalPlayer();

        if (!local) {
            return;
        }

        local.kills = (local.kills || 0) + 1;

        this.broadcast({
            type: "killCredit",
            killerId: this.playerId,
            kills: local.kills
        });
    }

    markPlayerDead(playerId, killerId = null) {
        const player = this.players.get(playerId);

        if (!player) {
            return;
        }

        const wasAlive = player.alive !== false;

        if (!this.deathOrder.includes(playerId)) {
            this.deathOrder.push(playerId);
        }

        player.alive = false;
        player.hp = 0;
        player.killerId = killerId;
        player.deathIndex = this.deathOrder.indexOf(playerId) + 1;

        if (wasAlive && killerId && killerId !== playerId) {
            const killer = this.players.get(killerId);

            if (killer) {
                killer.kills = (killer.kills || 0) + 1;
            }
        }
    }

    mergeDeathOrder(otherOrder) {
        for (const id of otherOrder) {
            if (!this.deathOrder.includes(id)) {
                this.deathOrder.push(id);
            }
        }
    }

    consumeEvents() {
        const events = this.pendingEvents.slice();
        this.pendingEvents.length = 0;
        return events;
    }

    getPlayers() {
        this.prunePlayers();
        return Array.from(this.players.values());
    }

    getRemotePlayers() {
        return this.getPlayers().filter((player) => player.id !== this.playerId);
    }

    getAlivePlayers() {
        return this.getPlayers().filter((player) => player.alive !== false);
    }

    getSpectatorTargets() {
        return this.getAlivePlayers();
    }

    isMatchFinished() {
        const players = this.getPlayers();

        if (players.length < 2) {
            return false;
        }

        return this.getAlivePlayers().length <= 1;
    }

    getLeaderboard() {
        const players = this.getPlayers();
        const alive = players.filter((player) => player.alive !== false);
        const dead = players
            .filter((player) => player.alive === false)
            .sort((a, b) => {
                return (b.deathIndex || 0) - (a.deathIndex || 0);
            });

        return [...alive, ...dead].map((player, index) => {
            return {
                rank: index + 1,
                id: player.id,
                name: player.name,
                kills: player.kills || 0,
                alive: player.alive !== false
            };
        });
    }

    prunePlayers() {
        const now = performance.now();

        for (const [id, player] of this.players.entries()) {
            if (id === this.playerId) {
                continue;
            }

            if (now - player.lastSeen > PLAYER_TIMEOUT) {
                this.players.delete(id);
            }
        }
    }
}
