import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8080);
const wss = new WebSocketServer({ port: PORT });
const rooms = new Map();

function getRoom(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            id: roomId,
            mapData: null,
            clients: new Map(),
            deathOrder: [],
            hostId: null
        });
    }

    return rooms.get(roomId);
}

function send(ws, message) {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

function broadcast(roomId, message, exceptWs = null) {
    const room = rooms.get(roomId);

    if (!room) {
        return;
    }

    for (const client of room.clients.values()) {
        if (client.ws !== exceptWs) {
            send(client.ws, message);
        }
    }
}

function getPlayers(room) {
    return Array.from(room.clients.values())
        .map((client) => client.player)
        .filter(Boolean);
}

wss.on("connection", (ws) => {
    let currentRoomId = null;
    let currentPlayerId = null;

    ws.on("message", (raw) => {
        let message;

        try {
            message = JSON.parse(raw.toString());
        } catch {
            return;
        }

        const { type, roomId, senderId } = message;

        if (!type || !roomId || !senderId) {
            return;
        }

        currentRoomId = String(roomId);
        currentPlayerId = String(senderId);

        if (type === "createRoom") {
            const room = getRoom(currentRoomId);
            room.mapData = message.mapData || room.mapData;
            room.hostId = currentPlayerId;
            room.clients.set(currentPlayerId, {
                ws,
                player: message.player
            });

            send(ws, {
                type: "roomCreated",
                roomId: currentRoomId,
                mapData: room.mapData,
                players: getPlayers(room),
                deathOrder: room.deathOrder
            });

            return;
        }

        const room = rooms.get(currentRoomId);

        if (type === "joinRoom") {
            if (!room || !room.mapData) {
                send(ws, {
                    type: "joinFailed",
                    reason: "未找到房间。请确认房间号正确，并且创建者仍然在线。"
                });
                return;
            }

            room.clients.set(currentPlayerId, {
                ws,
                player: message.player
            });

            send(ws, {
                type: "joinSuccess",
                roomId: currentRoomId,
                mapData: room.mapData,
                players: getPlayers(room),
                deathOrder: room.deathOrder
            });

            broadcast(currentRoomId, {
                type: "playerJoined",
                roomId: currentRoomId,
                senderId: currentPlayerId,
                player: message.player
            }, ws);

            return;
        }

        if (!room || !room.clients.has(currentPlayerId)) {
            return;
        }

        if (type === "snapshot" || type === "heartbeat") {
            const client = room.clients.get(currentPlayerId);
            client.player = message.player;
        }

        if (type === "playerDied") {
            if (!room.deathOrder.includes(message.playerId)) {
                room.deathOrder.push(message.playerId);
            }

            const client = room.clients.get(message.playerId);
            if (client?.player) {
                client.player.alive = false;
                client.player.hp = 0;
                client.player.killerId = message.killerId || null;
                client.player.deathIndex = room.deathOrder.indexOf(message.playerId) + 1;
            }
        }

        if (type === "restartMatch") {
            if (currentPlayerId !== room.hostId) {
                return;
            }

            room.deathOrder = [];

            for (const client of room.clients.values()) {
                if (!client.player) {
                    continue;
                }

                client.player.alive = true;
                client.player.hp = 100;
                client.player.kills = 0;
                client.player.deathIndex = null;
                client.player.killerId = null;
            }
        }

        broadcast(currentRoomId, message, ws);
    });

    ws.on("close", () => {
        if (!currentRoomId || !currentPlayerId) {
            return;
        }

        const room = rooms.get(currentRoomId);

        if (!room) {
            return;
        }

        room.clients.delete(currentPlayerId);

        broadcast(currentRoomId, {
            type: "leave",
            roomId: currentRoomId,
            playerId: currentPlayerId
        });

        if (room.clients.size === 0) {
            rooms.delete(currentRoomId);
        }
    });
});

console.log(`Cube Shoot WebSocket server running on ws://localhost:${PORT}`);
