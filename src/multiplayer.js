const ROOM_STORAGE_PREFIX = "cubeShoot.room.";
const PLAYER_TIMEOUT = 6000;

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
    constructor({ roomId, playerName, isHost = false, mapData = null }) {
        this.roomId = String(roomId).trim();
        this.playerId = createId("player");
        this.playerName = playerName?.trim() || "Player";
        this.isHost = isHost;

        this.channelName = `cubeShoot.room.${this.roomId}`;
        this.channel = new BroadcastChannel(this.channelName);

        this.players = new Map();
        this.pendingEvents = [];
        this.deathOrder = [];
        this.closed = false;

        this.mapData = mapData ? clone(mapData) : this.loadRoomMap();

        if (this.isHost && this.mapData) {
            this.saveRoomMap(this.mapData);
        }

        this.channel.addEventListener("message", (event) => {
            this.handleMessage(event.data);
        });

        this.upsertPlayer({
            id: this.playerId,
            name: this.playerName,
            x: 0,
            y: 0,
            hp: 100,
            alive: true,
            kills: 0,
            deathIndex: null,
            lastSeen: performance.now()
        });

        this.broadcast({
            type: "hello",
            player: this.getLocalPlayer(),
            mapData: this.isHost ? this.mapData : null,
            deathOrder: this.deathOrder
        });

        this.heartbeatTimer = window.setInterval(() => {
            this.prunePlayers();
            this.broadcast({
                type: "heartbeat",
                player: this.getLocalPlayer()
            });
        }, 1000);
    }

    static createRoomId() {
        return String(Math.floor(100000 + Math.random() * 900000));
    }

    static getRoomMap(roomId) {
        const raw = localStorage.getItem(`${ROOM_STORAGE_PREFIX}${roomId}.map`);

        if (!raw) {
            return null;
        }

        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    loadRoomMap() {
        return MultiplayerClient.getRoomMap(this.roomId);
    }

    saveRoomMap(mapData) {
        localStorage.setItem(
            `${ROOM_STORAGE_PREFIX}${this.roomId}.map`,
            JSON.stringify(mapData)
        );
    }

    destroy() {
        if (this.closed) {
            return;
        }

        this.closed = true;

        window.clearInterval(this.heartbeatTimer);

        this.broadcast({
            type: "leave",
            playerId: this.playerId
        });

        this.channel.close();
    }

    broadcast(message) {
        if (this.closed) {
            return;
        }

        this.channel.postMessage({
            ...message,
            roomId: this.roomId,
            senderId: this.playerId,
            sentAt: performance.now()
        });
    }

    handleMessage(message) {
        if (!message || message.roomId !== this.roomId) {
            return;
        }

        if (message.senderId === this.playerId) {
            return;
        }

        if (message.type === "hello") {
            if (message.mapData && !this.mapData) {
                this.mapData = clone(message.mapData);
                this.saveRoomMap(this.mapData);
            }

            if (Array.isArray(message.deathOrder)) {
                this.mergeDeathOrder(message.deathOrder);
            }

            this.upsertPlayer(message.player);

            this.broadcast({
                type: "helloAck",
                player: this.getLocalPlayer(),
                mapData: this.isHost ? this.mapData : null,
                deathOrder: this.deathOrder
            });

            return;
        }

        if (message.type === "helloAck") {
            if (message.mapData && !this.mapData) {
                this.mapData = clone(message.mapData);
                this.saveRoomMap(this.mapData);
            }

            if (Array.isArray(message.deathOrder)) {
                this.mergeDeathOrder(message.deathOrder);
            }

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

        if (!this.deathOrder.includes(playerId)) {
            this.deathOrder.push(playerId);
        }

        player.alive = false;
        player.hp = 0;
        player.killerId = killerId;
        player.deathIndex = this.deathOrder.indexOf(playerId) + 1;
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