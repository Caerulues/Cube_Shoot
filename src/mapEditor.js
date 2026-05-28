import { Terrain } from "./terrain.js";
import { defaultMap } from "./maps/defaultMap.js";
import { drawSeasonBackground } from "./seasonBackground.js";
import { normalizeMapAssets, getTextureList } from "./textureManager.js";

const STORAGE_KEY = "cubeShoot.editorMap";
const GRID_SIZE = 20;

function cloneMap(map) {
    if (typeof structuredClone === "function") {
        return structuredClone(map);
    }

    return JSON.parse(JSON.stringify(map));
}

function snap(value) {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function normalizeRect(start, end) {
    const x1 = snap(start.x);
    const y1 = snap(start.y);
    const x2 = snap(end.x);
    const y2 = snap(end.y);

    return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.max(GRID_SIZE, Math.abs(x2 - x1)),
        height: Math.max(GRID_SIZE, Math.abs(y2 - y1))
    };
}

function pointInRect(x, y, rect) {
    return (
        x >= rect.x &&
        x <= rect.x + rect.width &&
        y >= rect.y &&
        y <= rect.y + rect.height
    );
}

export class MapEditor {
    constructor(canvas, ui, settings = null) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.ui = ui;
        this.settings = settings;

        this.mapData = this.loadMap();
        this.validateMap(this.mapData);
        normalizeMapAssets(this.mapData);

        this.cameraX = 0;
        this.cameraY = 0;
        this.zoom = 1;
        this.running = false;

        this.keys = {};
        this.mouse = {
            x: 0,
            y: 0,
            dragging: false,
            dragButton: 0
        };

        this.lastMouseWorld = {
            x: 0,
            y: 0
        };

        this.terrainStart = null;

        this.selected = {
            category: null,
            id: null
        };

        this.boundHandlers = {
            keydown: (event) => this.handleKeyDown(event),
            keyup: (event) => this.handleKeyUp(event),
            contextmenu: (event) => this.handleContextMenu(event),
            mousedown: (event) => this.handleMouseDown(event),
            mouseup: () => this.handleMouseUp(),
            mousemove: (event) => this.handleMouseMove(event),
            wheel: (event) => this.handleWheel(event)
        };

        this.bindEvents();
        this.syncForm();
        this.setStatus("Map editor ready.");
    }

    start() {
        if (this.running) {
            return;
        }

        this.running = true;
        requestAnimationFrame(() => this.loop());
    }

    stop() {
        this.running = false;
        this.terrainStart = null;
        this.clearSelection();
    }

    bindEvents() {
        window.addEventListener("keydown", this.boundHandlers.keydown);
        window.addEventListener("keyup", this.boundHandlers.keyup);

        this.canvas.addEventListener("contextmenu", this.boundHandlers.contextmenu);
        this.canvas.addEventListener("mousedown", this.boundHandlers.mousedown);
        window.addEventListener("mouseup", this.boundHandlers.mouseup);
        this.canvas.addEventListener("mousemove", this.boundHandlers.mousemove);
        this.canvas.addEventListener("wheel", this.boundHandlers.wheel, {
            passive: false
        });

        this.ui.tool.addEventListener("change", () => {
            this.terrainStart = null;
            this.clearSelection();
            this.syncForm();
        });

        this.ui.spawnMode?.addEventListener("change", () => {
            this.terrainStart = null;
            this.clearSelection();

            if (this.ui.spawnMode.value === "single_monster" && this.ui.tool.value === "player_spawn_multiplayer") {
                this.ui.tool.value = "spawn_normal";
            }

            if (this.ui.spawnMode.value === "multiplayer_player" && (this.ui.tool.value === "spawn_normal" || this.ui.tool.value === "spawn_boss")) {
                this.ui.tool.value = "player_spawn_multiplayer";
            }

            this.syncForm();
        });

        this.ui.material.addEventListener("change", () => {
            const selectedBlock = this.getSelectedTerrainBlock();

            if (selectedBlock) {
                selectedBlock.type = this.ui.material.value;
                this.saveMap(false);
                this.setStatus("Selected terrain material changed.");
            }
        });

        this.ui.texture?.addEventListener("change", () => this.applySelectedTexture());
        this.ui.addTexture?.addEventListener("click", () => this.ui.textureInput?.click());
        this.ui.textureInput?.addEventListener("change", (event) => this.importTextureFile(event));
        this.ui.applyIconTexture?.addEventListener("click", () => this.applyIconTexture());

        this.ui.blockWidth.addEventListener("change", () => this.clampSizeInputs());
        this.ui.blockHeight.addEventListener("change", () => this.clampSizeInputs());

        this.ui.exportMap.addEventListener("click", () => this.exportJson());
        this.ui.exportJsMap.addEventListener("click", () => this.exportJsModule());
        this.ui.importMap.addEventListener("click", () => this.importJson());
        this.ui.importMapInput.addEventListener("change", (event) => this.importJsonFile(event));

        this.ui.saveMap.addEventListener("click", () => this.saveMap(true));
        this.ui.loadMap.addEventListener("click", () => this.loadSavedMap());
        this.ui.clearMap.addEventListener("click", () => this.clearMap());
    }

    handleKeyDown(event) {
        if (!this.running) {
            return;
        }

        const key = event.key.toLowerCase();
        this.keys[key] = true;

        if (event.key === "Delete" || event.key === "Backspace") {
            this.deleteSelected();
            event.preventDefault();
            return;
        }

        if (event.key === "Escape") {
            this.terrainStart = null;
            this.clearSelection();
            this.setStatus("Selection cancelled.");
            event.preventDefault();
        }
    }

    handleKeyUp(event) {
        this.keys[event.key.toLowerCase()] = false;
    }

    handleContextMenu(event) {
        if (!this.running) {
            return;
        }

        event.preventDefault();
    }

    handleMouseDown(event) {
        if (!this.running) {
            return;
        }

        this.mouse.dragging = true;
        this.mouse.dragButton = event.button;
        this.updateMouse(event);

        if (event.button === 0) {
            this.handleLeftClick();
        }

        if (event.button === 2) {
            this.handleRightClick();
        }
    }

    handleMouseUp() {
        this.mouse.dragging = false;
    }

    handleMouseMove(event) {
        if (!this.running) {
            return;
        }

        this.updateMouse(event);

        if (this.mouse.dragging && this.mouse.dragButton === 1) {
            this.cameraX -= event.movementX / this.zoom;
            this.cameraY -= event.movementY / this.zoom;
            this.clampCamera();
        }
    }

    handleWheel(event) {
        if (!this.running) {
            return;
        }

        event.preventDefault();

        const oldZoom = this.zoom;
        const zoomDelta = event.deltaY < 0 ? 0.1 : -0.1;

        this.zoom = Math.max(0.45, Math.min(2.2, this.zoom + zoomDelta));

        const world = this.screenToWorld(event.clientX, event.clientY, oldZoom);

        this.cameraX = world.x - event.clientX / this.zoom;
        this.cameraY = world.y - event.clientY / this.zoom;

        this.clampCamera();
    }

    loadMap() {
        const saved = localStorage.getItem(STORAGE_KEY);

        if (!saved) {
            return cloneMap(defaultMap);
        }

        try {
            const data = JSON.parse(saved);
            this.validateMap(data);
            return data;
        } catch {
            return cloneMap(defaultMap);
        }
    }

    loadSavedMap() {
        const saved = localStorage.getItem(STORAGE_KEY);

        if (!saved) {
            this.setStatus("No local saved map found.");
            return;
        }

        try {
            const data = JSON.parse(saved);
            this.validateMap(data);
            this.mapData = data;
            this.terrainStart = null;
            this.clearSelection();
            this.syncForm();
            this.setStatus("Local map loaded.");
        } catch (error) {
            this.setStatus(`Load failed: ${error.message}`);
        }
    }

    saveMap(showStatus = true) {
        this.mapData.season = this.settings?.season || this.mapData.season || "spring";
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.mapData));

        if (showStatus) {
            this.setStatus("Map saved to browser localStorage.");
        }
    }

    clearMap() {
        const confirmClear = window.confirm("Clear the editor map?");

        if (!confirmClear) {
            return;
        }

        this.mapData = {
            worldWidth: defaultMap.worldWidth || 3400,
            worldHeight: defaultMap.worldHeight || 1300,
            voidY: defaultMap.voidY || 1180,
            season: this.settings?.season || defaultMap.season || "spring",
            playerStart: cloneMap(defaultMap.playerStart || { x: 160, y: 520 }),
            terrainBlocks: [],
            spawnPoints: [],
            playerSpawnPoints: [],
            pickups: [],
            backgroundObjects: [],
            assets: cloneMap(defaultMap.assets || {})
        };

        this.terrainStart = null;
        this.clearSelection();
        this.saveMap(false);
        this.setStatus("Map cleared.");
    }

    resetToDefaultMap() {
        this.mapData = cloneMap(defaultMap);
        this.validateMap(this.mapData);
        this.terrainStart = null;
        this.clearSelection();
        this.saveMap(false);
        this.setStatus("Map reset to default.");
    }

    syncForm() {
        const isTerrain = this.ui.tool.value === "terrain";
        const spawnMode = this.ui.spawnMode?.value || "single_monster";

        for (const option of this.ui.tool.options) {
            if (option.value === "spawn_normal" || option.value === "spawn_boss") {
                option.hidden = spawnMode !== "single_monster";
            }

            if (option.value === "player_spawn_multiplayer") {
                option.hidden = spawnMode !== "multiplayer_player";
            }
        }

        this.ui.material.disabled = !isTerrain;
        this.ui.blockWidth.disabled = !isTerrain;
        this.ui.blockHeight.disabled = !isTerrain;

        if (this.ui.season) {
            this.mapData.season = this.settings?.season || this.ui.season.value || this.mapData.season || "spring";
        }

        this.refreshTextureSelect();
        this.clampSizeInputs();
    }

    clampSizeInputs() {
        this.ui.blockWidth.value = String(
            Math.max(16, Math.min(1200, Number(this.ui.blockWidth.value) || 160))
        );

        this.ui.blockHeight.value = String(
            Math.max(16, Math.min(800, Number(this.ui.blockHeight.value) || 64))
        );
    }

    loop() {
        if (!this.running) {
            return;
        }

        this.updateCamera();
        this.draw();

        requestAnimationFrame(() => this.loop());
    }

    updateCamera() {
        const speed = 16 / this.zoom;

        if (this.keys.a || this.keys.arrowleft) {
            this.cameraX -= speed;
        }

        if (this.keys.d || this.keys.arrowright) {
            this.cameraX += speed;
        }

        if (this.keys.w || this.keys.arrowup) {
            this.cameraY -= speed;
        }

        if (this.keys.s || this.keys.arrowdown) {
            this.cameraY += speed;
        }

        this.clampCamera();
    }

    clampCamera() {
        const maxX = Math.max(0, this.mapData.worldWidth - this.canvas.width / this.zoom);
        const maxY = Math.max(0, this.mapData.worldHeight - this.canvas.height / this.zoom);

        this.cameraX = Math.max(0, Math.min(maxX, this.cameraX));
        this.cameraY = Math.max(0, Math.min(maxY, this.cameraY));
    }

    updateMouse(event) {
        this.mouse.x = event.clientX;
        this.mouse.y = event.clientY;
        this.lastMouseWorld = this.screenToWorld(event.clientX, event.clientY);
    }

    screenToWorld(screenX, screenY, zoom = this.zoom) {
        return {
            x: this.cameraX + screenX / zoom,
            y: this.cameraY + screenY / zoom
        };
    }

    handleLeftClick() {
        const tool = this.ui.tool.value;
        const x = snap(this.lastMouseWorld.x);
        const y = snap(this.lastMouseWorld.y);

        if (tool === "terrain") {
            this.handleTerrainClick(x, y);
            return;
        }

        this.terrainStart = null;

        if (tool === "player_start") {
            this.mapData.playerStart = { x, y };
            this.clearSelection();
            this.saveMap(false);
            this.setStatus("Single-player start moved.");
            return;
        }

        if (tool === "player_spawn_multiplayer") {
            this.mapData.playerSpawnPoints ||= [];
            this.mapData.playerSpawnPoints.push({
                id: createId("player_spawn_multiplayer"),
                x,
                y,
                enabled: true
            });

            this.clearSelection();
            this.saveMap(false);
            this.setStatus("Multiplayer player spawn added.");
            return;
        }

        if (tool === "spawn_normal") {
            this.mapData.spawnPoints.push({
                id: createId("spawn_normal"),
                x,
                y,
                type: "normal",
                enabled: true
            });

            this.clearSelection();
            this.saveMap(false);
            this.setStatus("Normal enemy spawn added.");
            return;
        }

        if (tool === "spawn_boss") {
            this.mapData.spawnPoints.push({
                id: createId("spawn_boss"),
                x,
                y,
                type: "boss",
                enabled: true
            });

            this.clearSelection();
            this.saveMap(false);
            this.setStatus("Boss spawn added.");
            return;
        }

        if (tool === "pickup_shell_weapon") {
            this.mapData.pickups.push({
                id: createId("pickup_shell_weapon"),
                x,
                y,
                width: 28,
                height: 28,
                type: "weapon",
                weapon: "shell",
                textureId: this.ui.texture?.value || "",
                enabled: true
            });

            this.clearSelection();
            this.saveMap(false);
            this.setStatus("Shell weapon pickup added.");
            return;
        }

        if (tool === "pickup_shell_ammo") {
            this.mapData.pickups.push({
                id: createId("pickup_shell_ammo"),
                x,
                y,
                width: 24,
                height: 24,
                type: "ammo",
                weapon: "shell",
                amount: 4,
                textureId: this.ui.texture?.value || "",
                enabled: true
            });

            this.clearSelection();
            this.saveMap(false);
            this.setStatus("Shell ammo pickup added.");
            return;
        }

        if (tool === "pickup_bullet_ammo") {
            this.mapData.pickups.push({
                id: createId("pickup_bullet_ammo"),
                x,
                y,
                width: 24,
                height: 24,
                type: "ammo",
                weapon: "bullet",
                amount: 30,
                textureId: this.ui.texture?.value || "",
                enabled: true
            });

            this.clearSelection();
            this.saveMap(false);
            this.setStatus("Bullet ammo pickup added.");
            return;
        }

        if (tool === "pickup_health") {
            this.mapData.pickups.push({
                id: createId("pickup_health"),
                x,
                y,
                width: 26,
                height: 26,
                type: "health",
                amount: 25,
                textureId: this.ui.texture?.value || "",
                enabled: true
            });

            this.clearSelection();
            this.saveMap(false);
            this.setStatus("Health pickup added.");
            return;
        }

        if (tool.startsWith("background_")) {
            this.placeBackgroundObject(tool.replace("background_", ""), x, y);
            this.clearSelection();
            this.saveMap(false);
        }
    }

    handleTerrainClick(x, y) {
        const clickedBlock = this.findTerrainBlockAt(this.lastMouseWorld.x, this.lastMouseWorld.y);

        if (clickedBlock && !this.terrainStart) {
            this.selected = {
                category: "terrain",
                id: clickedBlock.id
            };

            this.ui.material.value = clickedBlock.type || "grass";
            if (this.ui.texture) {
                this.ui.texture.value = clickedBlock.textureId || "";
            }
            this.setStatus("Terrain selected. Press Delete to remove it, or change material/texture.");
            return;
        }

        if (!this.terrainStart) {
            this.terrainStart = { x, y };
            this.clearSelection();
            this.setStatus("Terrain start set. Left click again to set the end point.");
            return;
        }

        let rect = normalizeRect(this.terrainStart, { x, y });

        if (rect.width === GRID_SIZE && rect.height === GRID_SIZE) {
            rect = {
                x: this.terrainStart.x,
                y: this.terrainStart.y,
                width: Number(this.ui.blockWidth.value) || 160,
                height: Number(this.ui.blockHeight.value) || 64
            };
        }

        this.mapData.terrainBlocks.push({
            id: createId("terrain"),
            ...rect,
            type: this.ui.material.value,
            textureId: this.ui.texture?.value || ""
        });

        this.terrainStart = null;

        this.selected = {
            category: "terrain",
            id: this.mapData.terrainBlocks[this.mapData.terrainBlocks.length - 1].id
        };

        this.saveMap(false);
        this.setStatus("Terrain rectangle created.");
    }

    handleRightClick() {
        if (this.terrainStart) {
            this.terrainStart = null;
            this.setStatus("Terrain creation cancelled.");
            return;
        }

        const hit = this.findObjectAt(this.lastMouseWorld.x, this.lastMouseWorld.y);

        if (!hit) {
            this.clearSelection();
            this.setStatus("Nothing selected.");
            return;
        }

        this.selected = {
            category: hit.category,
            id: hit.object.id
        };

        this.deleteSelected();
    }

    placeBackgroundObject(type, x, y) {
        const base = {
            id: createId(`bg_${type}`),
            type,
            x,
            y,
            alpha: 0.75
        };

        if (type === "cloud") {
            this.mapData.backgroundObjects.push({
                ...base,
                scale: 0.9
            });

            this.setStatus("Background cloud added.");
            return;
        }

        if (type === "fence") {
            this.mapData.backgroundObjects.push({
                ...base,
                width: 120,
                height: 180,
                postGap: 40,
                alpha: 0.55
            });

            this.setStatus("Background fence added.");
            return;
        }

        if (type === "lantern") {
            this.mapData.backgroundObjects.push({
                ...base,
                alpha: 0.95
            });

            this.setStatus("Background lantern added.");
            return;
        }

        if (type === "dripstone") {
            this.mapData.backgroundObjects.push({
                ...base,
                width: 34,
                height: 95,
                alpha: 0.42
            });

            this.setStatus("Background dripstone added.");
            return;
        }

        if (type === "image") {
            this.mapData.backgroundObjects.push({
                ...base,
                type: "image",
                width: 240,
                height: 140,
                alpha: 1,
                textureId: this.ui.texture?.value || ""
            });

            this.setStatus("Background image added.");
        }
    }


    refreshTextureSelect() {
        if (!this.ui.texture) {
            return;
        }

        const current = this.ui.texture.value;
        normalizeMapAssets(this.mapData);
        const textures = getTextureList(this.mapData);

        this.ui.texture.innerHTML = '<option value="">默认 / 无贴图</option>';

        for (const texture of textures) {
            const option = document.createElement("option");
            option.value = texture.id;
            option.textContent = `${texture.id}${texture.kind ? ` (${texture.kind})` : ""}`;
            this.ui.texture.appendChild(option);
        }

        this.ui.texture.value = textures.some((texture) => texture.id === current) ? current : "";
    }

    applySelectedTexture() {
        const textureId = this.ui.texture?.value || "";

        if (this.selected.category === "terrain") {
            const block = this.getSelectedTerrainBlock();

            if (block) {
                block.textureId = textureId;
                this.saveMap(false);
                this.setStatus(textureId ? `Selected terrain texture set to ${textureId}.` : "Selected terrain texture cleared.");
                return;
            }
        }

        if (this.selected.category === "pickup") {
            const pickup = this.mapData.pickups.find((item) => item.id === this.selected.id);

            if (pickup) {
                pickup.textureId = textureId;
                this.saveMap(false);
                this.setStatus(textureId ? `Selected pickup texture set to ${textureId}.` : "Selected pickup texture cleared.");
                return;
            }
        }

        if (this.selected.category === "background") {
            const object = this.mapData.backgroundObjects.find((item) => item.id === this.selected.id);

            if (object) {
                object.textureId = textureId;
                this.saveMap(false);
                this.setStatus(textureId ? `Selected background texture set to ${textureId}.` : "Selected background texture cleared.");
            }
        }
    }


    applyIconTexture() {
        const textureId = this.ui.texture?.value || "";
        const slot = this.ui.iconSlot?.value || "";

        if (!textureId || !slot) {
            this.setStatus("Choose a texture and an icon slot first.");
            return;
        }

        normalizeMapAssets(this.mapData);
        this.mapData.assets.iconTextures[slot] = textureId;
        this.saveMap(false);
        this.setStatus(`Icon slot ${slot} now uses ${textureId}.`);
    }

    importTextureFile(event) {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        const idFromName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "_").toLowerCase();
        const textureId = window.prompt("Texture ID", idFromName);

        if (!textureId) {
            this.ui.textureInput.value = "";
            return;
        }

        const kind = window.prompt("Texture kind: terrain / background / pickup / ui", "terrain") || "terrain";
        const reader = new FileReader();

        reader.onload = () => {
            normalizeMapAssets(this.mapData);
            const textures = this.mapData.assets.textures;
            const texture = {
                id: textureId.trim(),
                name: file.name,
                kind: kind.trim(),
                src: String(reader.result || "")
            };
            const index = textures.findIndex((item) => item.id === texture.id);

            if (index >= 0) {
                textures[index] = texture;
            } else {
                textures.push(texture);
            }

            this.refreshTextureSelect();
            this.ui.texture.value = texture.id;
            this.applySelectedTexture();
            this.saveMap(false);
            this.setStatus(`Texture added: ${texture.id}. It will be exported inside the map JSON.`);
            this.ui.textureInput.value = "";
        };

        reader.onerror = () => {
            this.setStatus("Texture import failed.");
            this.ui.textureInput.value = "";
        };

        reader.readAsDataURL(file);
    }

    deleteSelected() {
        if (!this.selected.category || !this.selected.id) {
            this.setStatus("No selected item to delete.");
            return;
        }

        const { category, id } = this.selected;

        if (category === "terrain") {
            this.mapData.terrainBlocks = this.mapData.terrainBlocks.filter((block) => block.id !== id);
            this.clearSelection();
            this.saveMap(false);
            this.setStatus("Selected terrain deleted.");
            return;
        }

        if (category === "spawn") {
            this.mapData.spawnPoints = this.mapData.spawnPoints.filter((point) => point.id !== id);
            this.clearSelection();
            this.saveMap(false);
            this.setStatus("Selected monster spawn deleted.");
            return;
        }

        if (category === "playerSpawn") {
            this.mapData.playerSpawnPoints = (this.mapData.playerSpawnPoints || []).filter((point) => point.id !== id);
            this.clearSelection();
            this.saveMap(false);
            this.setStatus("Selected multiplayer player spawn deleted.");
            return;
        }

        if (category === "pickup") {
            this.mapData.pickups = this.mapData.pickups.filter((pickup) => pickup.id !== id);
            this.clearSelection();
            this.saveMap(false);
            this.setStatus("Selected pickup deleted.");
            return;
        }

        if (category === "background") {
            this.mapData.backgroundObjects = this.mapData.backgroundObjects.filter((object) => object.id !== id);
            this.clearSelection();
            this.saveMap(false);
            this.setStatus("Selected background object deleted.");
        }
    }

    clearSelection() {
        this.selected = {
            category: null,
            id: null
        };
    }

    getSelectedTerrainBlock() {
        if (this.selected.category !== "terrain") {
            return null;
        }

        return this.mapData.terrainBlocks.find((block) => block.id === this.selected.id) || null;
    }

    findTerrainBlockAt(x, y) {
        for (let i = this.mapData.terrainBlocks.length - 1; i >= 0; i--) {
            const block = this.mapData.terrainBlocks[i];

            if (pointInRect(x, y, block)) {
                return block;
            }
        }

        return null;
    }

    findSpawnAt(x, y) {
        for (let i = this.mapData.spawnPoints.length - 1; i >= 0; i--) {
            const point = this.mapData.spawnPoints[i];

            const rect = {
                x: point.x - 14,
                y: point.y - 34,
                width: 28,
                height: 36
            };

            if (pointInRect(x, y, rect)) {
                return point;
            }
        }

        return null;
    }

    findPlayerSpawnAt(x, y) {
        const points = this.mapData.playerSpawnPoints || [];

        for (let i = points.length - 1; i >= 0; i--) {
            const point = points[i];
            const rect = {
                x: point.x - 16,
                y: point.y - 38,
                width: 32,
                height: 42
            };

            if (pointInRect(x, y, rect)) {
                return point;
            }
        }

        return null;
    }

    findPickupAt(x, y) {
        for (let i = this.mapData.pickups.length - 1; i >= 0; i--) {
            const pickup = this.mapData.pickups[i];

            if (pointInRect(x, y, pickup)) {
                return pickup;
            }
        }

        return null;
    }

    findBackgroundObjectAt(x, y) {
        for (let i = this.mapData.backgroundObjects.length - 1; i >= 0; i--) {
            const object = this.mapData.backgroundObjects[i];
            const rect = this.getBackgroundObjectBounds(object);

            if (pointInRect(x, y, rect)) {
                return object;
            }
        }

        return null;
    }

    findObjectAt(x, y) {
        const terrain = this.findTerrainBlockAt(x, y);

        if (terrain) {
            return {
                category: "terrain",
                object: terrain
            };
        }

        const pickup = this.findPickupAt(x, y);

        if (pickup) {
            return {
                category: "pickup",
                object: pickup
            };
        }

        const spawnMode = this.ui.spawnMode?.value || "single_monster";

        if (spawnMode === "single_monster") {
            const spawn = this.findSpawnAt(x, y);

            if (spawn) {
                return {
                    category: "spawn",
                    object: spawn
                };
            }
        }

        if (spawnMode === "multiplayer_player") {
            const playerSpawn = this.findPlayerSpawnAt(x, y);

            if (playerSpawn) {
                return {
                    category: "playerSpawn",
                    object: playerSpawn
                };
            }
        }

        const background = this.findBackgroundObjectAt(x, y);

        if (background) {
            return {
                category: "background",
                object: background
            };
        }

        return null;
    }

    getBackgroundObjectBounds(object) {
        if (object.type === "cloud") {
            const scale = object.scale || 1;

            return {
                x: object.x - 60 * scale,
                y: object.y - 40 * scale,
                width: 170 * scale,
                height: 80 * scale
            };
        }

        if (object.type === "fence") {
            return {
                x: object.x - 8,
                y: object.y - 8,
                width: object.width || 120,
                height: object.height || 180
            };
        }

        if (object.type === "lantern") {
            return {
                x: object.x - 24,
                y: object.y - 84,
                width: 48,
                height: 110
            };
        }

        if (object.type === "dripstone") {
            return {
                x: object.x - (object.width || 34) / 2,
                y: object.y,
                width: object.width || 34,
                height: object.height || 95
            };
        }

        if (object.type === "image") {
            return {
                x: object.x,
                y: object.y,
                width: object.width || 240,
                height: object.height || 140
            };
        }

        return {
            x: object.x - 20,
            y: object.y - 20,
            width: 40,
            height: 40
        };
    }

    exportJson() {
        this.ui.output.value = JSON.stringify(this.mapData, null, 4);
        this.setStatus("JSON exported to text box.");
    }

    exportJsModule() {
        this.ui.output.value = `export const customMap = ${JSON.stringify(this.mapData, null, 4)};\n`;
        this.setStatus("JavaScript map module exported to text box.");
    }

    importJson() {
        const text = this.ui.output.value.trim();

        if (text) {
            this.importJsonText(text);
            return;
        }

        this.ui.importMapInput.value = "";
        this.ui.importMapInput.click();
    }

    importJsonFile(event) {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            this.importJsonText(String(reader.result || ""));
        };

        reader.onerror = () => {
            this.setStatus("Import failed: unable to read file.");
        };

        reader.readAsText(file);
    }

    importJsonText(text) {
        try {
            const cleanedText = text
                .replace(/^export\s+const\s+\w+\s*=\s*/, "")
                .replace(/;\s*$/, "");

            const data = JSON.parse(cleanedText);

            this.validateMap(data);

            this.mapData = data;
            this.terrainStart = null;
            this.clearSelection();
            this.saveMap(false);
            this.setStatus("Map imported.");
        } catch (error) {
            this.setStatus(`Import failed: ${error.message}`);
        }
    }

    validateMap(data) {
        if (!data || typeof data !== "object") {
            throw new Error("map must be an object");
        }

        if (!data.playerStart || typeof data.playerStart !== "object") {
            data.playerStart = {
                x: 160,
                y: 520
            };
        }

        if (!Array.isArray(data.terrainBlocks)) {
            data.terrainBlocks = [];
        }

        if (!Array.isArray(data.spawnPoints)) {
            data.spawnPoints = [];
        }

        if (!Array.isArray(data.playerSpawnPoints)) {
            data.playerSpawnPoints = [];
        }

        if (!Array.isArray(data.pickups)) {
            data.pickups = [];
        }

        if (!Array.isArray(data.backgroundObjects)) {
            data.backgroundObjects = [];
        }

        data.worldWidth = Number(data.worldWidth) || 3400;
        data.worldHeight = Number(data.worldHeight) || 1300;
        data.voidY = Number(data.voidY) || 1180;
        data.season ||= this.settings?.season || "spring";
        normalizeMapAssets(data);

        data.playerStart.x = Number(data.playerStart.x) || 160;
        data.playerStart.y = Number(data.playerStart.y) || 520;

        for (const block of data.terrainBlocks) {
            block.id ||= createId("terrain");
            block.x = Number(block.x) || 0;
            block.y = Number(block.y) || 0;
            block.width = Math.max(GRID_SIZE, Number(block.width) || GRID_SIZE);
            block.height = Math.max(GRID_SIZE, Number(block.height) || GRID_SIZE);
            block.type ||= "grass";
            block.textureId ||= "";
            block.textureMode ||= "repeat";
        }

        for (const point of data.spawnPoints) {
            point.id ||= createId("spawn");
            point.x = Number(point.x) || 0;
            point.y = Number(point.y) || 0;
            point.type = point.type === "boss" ? "boss" : "normal";
            point.enabled = point.enabled !== false;
        }

        for (const point of data.playerSpawnPoints) {
            point.id ||= createId("player_spawn_multiplayer");
            point.x = Number(point.x) || 0;
            point.y = Number(point.y) || 0;
            point.enabled = point.enabled !== false;
        }

        for (const pickup of data.pickups) {
            pickup.id ||= createId("pickup");
            pickup.x = Number(pickup.x) || 0;
            pickup.y = Number(pickup.y) || 0;
            pickup.width = Number(pickup.width) || 24;
            pickup.height = Number(pickup.height) || 24;
            pickup.type ||= "ammo";
            pickup.weapon ||= "bullet";
            pickup.amount = Number(pickup.amount) || 1;
            pickup.textureId ||= "";
            pickup.enabled = pickup.enabled !== false;
        }

        for (const object of data.backgroundObjects) {
            object.id ||= createId("background");
            object.x = Number(object.x) || 0;
            object.y = Number(object.y) || 0;
            object.type ||= "cloud";
            object.alpha = Number.isFinite(Number(object.alpha)) ? Number(object.alpha) : 0.75;
            object.textureId ||= "";
            object.width = Number(object.width) || (object.type === "image" ? 240 : object.width);
            object.height = Number(object.height) || (object.type === "image" ? 140 : object.height);
        }
    }

    getMapData() {
        const data = cloneMap(this.mapData);
        data.season = this.settings?.season || data.season || "spring";
        this.validateMap(data);
        return data;
    }

    getCurrentMap() {
        return this.getMapData();
    }

    setStatus(text) {
        if (this.ui.status) {
            this.ui.status.textContent = text;
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const season = this.settings?.season || this.mapData.season || "spring";

        drawSeasonBackground(this.ctx, this.canvas, season, {
            cameraX: this.cameraX,
            cameraY: this.cameraY,
            zoom: this.zoom
        });

        this.ctx.save();
        this.ctx.scale(this.zoom, this.zoom);
        this.ctx.translate(-this.cameraX, -this.cameraY);

        this.drawGrid();

        const terrain = new Terrain(this.canvas, this.mapData);
        terrain.draw(this.ctx, {
            selectedBlockId: this.selected.category === "terrain" ? this.selected.id : null
        });

        this.drawPlayerStart();
        this.drawEditorMarkers();
        this.drawTerrainPreview();

        if (this.settings?.showHitboxes) {
            this.drawEditorHitboxes(terrain);
        }

        this.ctx.restore();

        this.drawOverlay();
    }

    drawGrid() {
        const startX = Math.floor(this.cameraX / GRID_SIZE) * GRID_SIZE;
        const startY = Math.floor(this.cameraY / GRID_SIZE) * GRID_SIZE;
        const endX = this.cameraX + this.canvas.width / this.zoom;
        const endY = this.cameraY + this.canvas.height / this.zoom;

        this.ctx.save();
        this.ctx.strokeStyle = "rgba(80, 96, 110, 0.15)";
        this.ctx.lineWidth = 1 / this.zoom;

        for (let x = startX; x <= endX; x += GRID_SIZE) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, startY);
            this.ctx.lineTo(x, endY);
            this.ctx.stroke();
        }

        for (let y = startY; y <= endY; y += GRID_SIZE) {
            this.ctx.beginPath();
            this.ctx.moveTo(startX, y);
            this.ctx.lineTo(endX, y);
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    drawTerrainPreview() {
        if (!this.terrainStart || this.ui.tool.value !== "terrain") {
            return;
        }

        const rect = normalizeRect(this.terrainStart, this.lastMouseWorld);

        this.ctx.save();

        this.ctx.fillStyle = "rgba(56, 189, 248, 0.18)";
        this.ctx.strokeStyle = "#38bdf8";
        this.ctx.lineWidth = 2 / this.zoom;
        this.ctx.setLineDash([8 / this.zoom, 6 / this.zoom]);

        this.ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        this.ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

        this.ctx.restore();
    }

    drawPlayerStart() {
        const start = this.mapData.playerStart;

        this.ctx.save();

        this.ctx.fillStyle = "#22d3ee";
        this.ctx.fillRect(start.x - 12, start.y - 34, 24, 34);

        this.ctx.strokeStyle = "white";
        this.ctx.lineWidth = 2 / this.zoom;
        this.ctx.strokeRect(start.x - 12, start.y - 34, 24, 34);

        this.ctx.fillStyle = "#111827";
        this.ctx.font = `${14 / this.zoom}px Arial`;
        this.ctx.fillText("Player", start.x + 16, start.y - 16);

        this.ctx.restore();
    }

    drawEditorMarkers() {
        if ((this.ui.spawnMode?.value || "single_monster") === "single_monster") {
            this.drawSpawnMarkers();
        } else {
            this.drawPlayerSpawnMarkers();
        }

        this.drawPickupMarkers();
        this.drawBackgroundSelection();
    }

    drawSpawnMarkers() {
        this.ctx.save();

        for (const point of this.mapData.spawnPoints) {
            const selected = this.selected.category === "spawn" && this.selected.id === point.id;

            this.ctx.fillStyle = point.type === "boss" ? "#facc15" : "#ef4444";
            this.ctx.strokeStyle = selected ? "#38bdf8" : "white";
            this.ctx.lineWidth = selected ? 4 / this.zoom : 2 / this.zoom;

            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y - 18, 12, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.fillStyle = "#111827";
            this.ctx.font = `${13 / this.zoom}px Arial`;
            this.ctx.fillText(point.type === "boss" ? "Boss" : "Spawn", point.x + 16, point.y - 14);
        }

        this.ctx.restore();
    }

    drawPlayerSpawnMarkers() {
        this.ctx.save();

        for (const point of this.mapData.playerSpawnPoints || []) {
            const selected = this.selected.category === "playerSpawn" && this.selected.id === point.id;

            this.ctx.fillStyle = "#22d3ee";
            this.ctx.strokeStyle = selected ? "#38bdf8" : "white";
            this.ctx.lineWidth = selected ? 4 / this.zoom : 2 / this.zoom;

            this.ctx.fillRect(point.x - 12, point.y - 34, 24, 34);
            this.ctx.strokeRect(point.x - 12, point.y - 34, 24, 34);

            this.ctx.fillStyle = "#111827";
            this.ctx.font = `${13 / this.zoom}px Arial`;
            this.ctx.fillText("MP Spawn", point.x + 16, point.y - 16);
        }

        this.ctx.restore();
    }

    drawPickupMarkers() {
        this.ctx.save();

        for (const pickup of this.mapData.pickups) {
            const selected = this.selected.category === "pickup" && this.selected.id === pickup.id;

            this.ctx.strokeStyle = selected ? "#38bdf8" : "white";
            this.ctx.lineWidth = selected ? 4 / this.zoom : 2 / this.zoom;
            this.ctx.strokeRect(
                pickup.x - 3,
                pickup.y - 3,
                pickup.width + 6,
                pickup.height + 6
            );

            this.ctx.fillStyle = "#111827";
            this.ctx.font = `${12 / this.zoom}px Arial`;

            const label =
                pickup.type === "weapon"
                    ? "Shell Weapon"
                    : pickup.weapon === "shell"
                        ? "Shell Ammo"
                        : "Bullet Ammo";

            this.ctx.fillText(label, pickup.x + pickup.width + 8, pickup.y + 16);
        }

        this.ctx.restore();
    }

    drawBackgroundSelection() {
        if (this.selected.category !== "background") {
            return;
        }

        const object = this.mapData.backgroundObjects.find((item) => item.id === this.selected.id);

        if (!object) {
            return;
        }

        const bounds = this.getBackgroundObjectBounds(object);

        this.ctx.save();

        this.ctx.setLineDash([8 / this.zoom, 6 / this.zoom]);
        this.ctx.strokeStyle = "#38bdf8";
        this.ctx.lineWidth = 3 / this.zoom;
        this.ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

        this.ctx.restore();
    }

    drawEditorHitboxes(terrain) {
        this.ctx.save();

        this.ctx.strokeStyle = "rgba(250, 204, 21, 0.8)";
        this.ctx.lineWidth = 2 / this.zoom;

        for (const block of terrain.terrainBlocks) {
            const rect = terrain.getBlockCollisionRect(block);
            this.ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        }

        this.ctx.strokeStyle = "rgba(34, 211, 238, 0.85)";

        const start = this.mapData.playerStart;
        this.ctx.strokeRect(start.x - 12, start.y - 34, 24, 34);

        this.ctx.restore();
    }

    drawOverlay() {
        this.ctx.save();

        this.ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
        this.ctx.fillRect(16, this.canvas.height - 64, 850, 48);

        this.ctx.fillStyle = "#1f2937";
        this.ctx.font = "15px Arial";
        this.ctx.fillText(
            "Editor: terrain = click start, click end · click terrain to select · Right click delete · Delete remove · WASD pan · Wheel zoom · Middle drag pan",
            30,
            this.canvas.height - 38
        );

        this.ctx.fillStyle = "#475569";
        this.ctx.font = "13px Arial";
        this.ctx.fillText(
            `Mouse: ${Math.round(this.lastMouseWorld.x)}, ${Math.round(this.lastMouseWorld.y)} · Zoom: ${this.zoom.toFixed(2)}x`,
            30,
            this.canvas.height - 20
        );

        this.ctx.restore();
    }
}