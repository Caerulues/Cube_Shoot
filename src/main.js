import { Game } from "./game.js";
import { defaultMap } from "./maps/defaultMap.js";
import { drawSeasonBackground } from "./seasonBackground.js";
import { MultiplayerClient } from "./multiplayer.js";
import { MapEditor } from "./mapEditor.js";
import {
    loadSettings,
    saveSettings,
    resetSettings,
    normalizeKey,
    keyName
} from "./settings.js";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const panels = {
    main: document.getElementById("mainMenu"),
    start: document.getElementById("startGameMenu"),
    single: document.getElementById("singlePlayerMenu"),
    create: document.getElementById("createRoomMenu"),
    join: document.getElementById("joinRoomMenu"),
    settings: document.getElementById("settingsPanel"),
    editor: document.getElementById("mapEditorPanel")
};

const openStartMenuButton = document.getElementById("openStartMenuButton");
const openMapEditorButton = document.getElementById("openMapEditorButton");
const openJoinMenuButton = document.getElementById("openJoinMenuButton");
const settingsButton = document.getElementById("settingsButton");

const openSinglePlayerMenuButton = document.getElementById("openSinglePlayerMenuButton");
const openCreateRoomMenuButton = document.getElementById("openCreateRoomMenuButton");
const backFromStartMenuButton = document.getElementById("backFromStartMenuButton");

const singleMapSelect = document.getElementById("singleMapSelect");
const singleMapInput = document.getElementById("singleMapInput");
const chooseSingleMapFileButton = document.getElementById("chooseSingleMapFileButton");
const singleMapStatus = document.getElementById("singleMapStatus");
const startSinglePlayerButton = document.getElementById("startSinglePlayerButton");
const backFromSingleMenuButton = document.getElementById("backFromSingleMenuButton");

const createPlayerNameInput = document.getElementById("createPlayerNameInput");
const createMapSelect = document.getElementById("createMapSelect");
const createMapInput = document.getElementById("createMapInput");
const chooseCreateMapFileButton = document.getElementById("chooseCreateMapFileButton");
const createMapStatus = document.getElementById("createMapStatus");
const createRoomButton = document.getElementById("createRoomButton");
const backFromCreateMenuButton = document.getElementById("backFromCreateMenuButton");

const joinRoomInput = document.getElementById("joinRoomInput");
const joinPlayerNameInput = document.getElementById("joinPlayerNameInput");
const joinRoomButton = document.getElementById("joinRoomButton");
const backFromJoinMenuButton = document.getElementById("backFromJoinMenuButton");
const joinRoomStatus = document.getElementById("joinRoomStatus");

const roomInfoPanel = document.getElementById("roomInfoPanel");
const roomCodeText = document.getElementById("roomCodeText");
const copyRoomCodeButton = document.getElementById("copyRoomCodeButton");

const settingsSeasonSelect = document.getElementById("settingsSeasonSelect");
const showHitboxesCheckbox = document.getElementById("showHitboxesCheckbox");
const resetSettingsButton = document.getElementById("resetSettingsButton");
const closeSettingsButton = document.getElementById("closeSettingsButton");
const settingsStatus = document.getElementById("settingsStatus");
const keybindButtons = document.querySelectorAll(".keybindButton");

const escapeMenu = document.getElementById("escapeMenu");
const escapeTabs = document.querySelectorAll(".escape-tab");
const escapeGamePage = document.getElementById("escapeGamePage");
const escapeSpectatePage = document.getElementById("escapeSpectatePage");
const escapePlayersPage = document.getElementById("escapePlayersPage");
const escapePlayerList = document.getElementById("escapePlayerList");

const escapeResumeButton = document.getElementById("escapeResumeButton");
const escapeBackToMenuButton = document.getElementById("escapeBackToMenuButton");
const escapeSettingsButton = document.getElementById("escapeSettingsButton");
const escapeExitButton = document.getElementById("escapeExitButton");
const escapeSpectateButton = document.getElementById("escapeSpectateButton");

const closeMapEditorButton = document.getElementById("closeMapEditorButton");

let settings = loadSettings();
let game = null;
let multiplayerClient = null;
let mapEditor = null;
let currentMode = "menu";
let settingsReturnTarget = "menu";
let listeningAction = null;

let singleUploadedMap = null;
let createUploadedMap = null;

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

initializeSettingsUi();
showPanel("main");
drawMenuFrame();

openStartMenuButton.addEventListener("click", () => showPanel("start"));
openMapEditorButton.addEventListener("click", openMapEditor);
openJoinMenuButton.addEventListener("click", () => showPanel("join"));
settingsButton.addEventListener("click", () => openSettings("menu"));

openSinglePlayerMenuButton.addEventListener("click", () => showPanel("single"));
openCreateRoomMenuButton.addEventListener("click", () => showPanel("create"));
backFromStartMenuButton.addEventListener("click", () => showPanel("main"));

backFromSingleMenuButton.addEventListener("click", () => showPanel("start"));
backFromCreateMenuButton.addEventListener("click", () => showPanel("start"));
backFromJoinMenuButton.addEventListener("click", () => showPanel("main"));

singleMapSelect.addEventListener("change", () => {
    const upload = singleMapSelect.value === "upload";
    chooseSingleMapFileButton.classList.toggle("hidden", !upload);

    if (!upload) {
        singleMapStatus.textContent = "当前：默认地图";
    }
});

createMapSelect.addEventListener("change", () => {
    const upload = createMapSelect.value === "upload";
    chooseCreateMapFileButton.classList.toggle("hidden", !upload);

    if (!upload) {
        createMapStatus.textContent = "当前：默认地图";
    }
});

chooseSingleMapFileButton.addEventListener("click", () => {
    singleMapInput.click();
});

chooseCreateMapFileButton.addEventListener("click", () => {
    createMapInput.click();
});

singleMapInput.addEventListener("change", async () => {
    singleUploadedMap = await readMapFile(singleMapInput.files?.[0], singleMapStatus);
});

createMapInput.addEventListener("change", async () => {
    createUploadedMap = await readMapFile(createMapInput.files?.[0], createMapStatus);
});

startSinglePlayerButton.addEventListener("click", () => {
    const mapData = singleMapSelect.value === "upload"
        ? singleUploadedMap
        : structuredClone(defaultMap);

    if (!mapData) {
        singleMapStatus.textContent = "请先选择有效地图文件。";
        return;
    }

    startSinglePlayer(mapData);
});

createRoomButton.addEventListener("click", () => {
    const playerName = createPlayerNameInput.value.trim() || "Player";
    const mapData = createMapSelect.value === "upload"
        ? createUploadedMap
        : structuredClone(defaultMap);

    if (!mapData) {
        createMapStatus.textContent = "请先选择有效地图文件。";
        return;
    }

    cleanupGame();

    const roomId = MultiplayerClient.createRoomId();
    createRoomButton.disabled = true;
    createMapStatus.textContent = "正在连接 WebSocket 服务器...";

    multiplayerClient = new MultiplayerClient({
        roomId,
        playerName,
        isHost: true,
        mapData,
        onReady: (serverMap) => {
            createRoomButton.disabled = false;
            createMapStatus.textContent = "房间已创建。";
            startMultiplayerGame(serverMap, multiplayerClient);
            showRoomCode(roomId);
        },
        onError: (message) => {
            createRoomButton.disabled = false;
            createMapStatus.textContent = message;
            cleanupGame();
        },
        onClose: () => {
            if (currentMode !== "game") {
                return;
            }

            backToMenu();
        }
    });
});

joinRoomButton.addEventListener("click", () => {
    const roomId = joinRoomInput.value.trim();
    const playerName = joinPlayerNameInput.value.trim() || "Player";

    if (!roomId) {
        joinRoomStatus.textContent = "请输入房间号。";
        return;
    }

    cleanupGame();

    joinRoomButton.disabled = true;
    joinRoomStatus.textContent = "正在连接房间...";

    multiplayerClient = new MultiplayerClient({
        roomId,
        playerName,
        isHost: false,
        mapData: null,
        onReady: (serverMap) => {
            joinRoomButton.disabled = false;
            joinRoomStatus.textContent = "已加入房间。";
            startMultiplayerGame(serverMap, multiplayerClient);
            showRoomCode(roomId);
        },
        onError: (message) => {
            joinRoomButton.disabled = false;
            joinRoomStatus.textContent = message;
            cleanupGame();
        },
        onClose: () => {
            if (currentMode !== "game") {
                return;
            }

            backToMenu();
        }
    });
});

copyRoomCodeButton.addEventListener("click", async () => {
    const text = roomCodeText.textContent.trim();

    if (!text) {
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
    } catch {
        window.prompt("Copy room code:", text);
    }
});

settingsSeasonSelect.addEventListener("change", applySettings);
showHitboxesCheckbox.addEventListener("change", applySettings);

resetSettingsButton.addEventListener("click", () => {
    settings = resetSettings();
    initializeSettingsUi();
    drawMenuFrame();
    settingsStatus.textContent = "Settings reset.";
});

closeSettingsButton.addEventListener("click", closeSettings);

for (const button of keybindButtons) {
    button.addEventListener("click", () => {
        listeningAction = button.dataset.action;
        button.textContent = "Press a key...";
        settingsStatus.textContent = "Press any key to bind.";
    });
}

window.addEventListener("keydown", (event) => {
    if (listeningAction) {
        event.preventDefault();
        settings.keybinds[listeningAction] = [normalizeKey(event)];
        listeningAction = null;
        applySettings();
        return;
    }

    if (event.key === "Escape" && currentMode === "game" && game && !game.gameOver) {
        event.preventDefault();
        toggleEscapeMenu();
        return;
    }

    if (event.key === "Escape" && currentMode === "settings" && settingsReturnTarget === "game") {
        event.preventDefault();
        closeSettings();
    }
});

escapeResumeButton.addEventListener("click", closeEscapeMenuAndResume);
escapeBackToMenuButton.addEventListener("click", backToMenu);
escapeExitButton.addEventListener("click", backToMenu);
escapeSettingsButton.addEventListener("click", () => openSettings("game"));

escapeSpectateButton.addEventListener("click", () => {
    if (game) {
        game.enterSpectatorMode();
        closeEscapeMenuAndResume();
    }
});

closeMapEditorButton.addEventListener("click", closeMapEditor);

for (const tab of escapeTabs) {
    tab.addEventListener("click", () => {
        setEscapeTab(tab.dataset.tab);
    });
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    if (currentMode !== "game") {
        drawMenuFrame();
    }
}

function showPanel(name) {
    if (currentMode === "editor" && name !== "editor") {
        mapEditor?.stop();
    }

    currentMode = "menu";

    for (const panel of Object.values(panels)) {
        panel.classList.add("hidden");
    }

    panels[name].classList.remove("hidden");
    escapeMenu.classList.add("hidden");
    roomInfoPanel.classList.add("hidden");

    drawMenuFrame();
}

function getMapEditorUi() {
    return {
        tool: document.getElementById("editorToolSelect"),
        material: document.getElementById("editorMaterialSelect"),
        blockWidth: document.getElementById("editorBlockWidthInput"),
        blockHeight: document.getElementById("editorBlockHeightInput"),
        season: document.getElementById("editorSeasonSelect"),
        exportMap: document.getElementById("editorExportMapButton"),
        exportJsMap: document.getElementById("editorExportJsMapButton"),
        importMap: document.getElementById("editorImportMapButton"),
        importMapInput: document.getElementById("editorImportMapInput"),
        saveMap: document.getElementById("editorSaveMapButton"),
        loadMap: document.getElementById("editorLoadMapButton"),
        clearMap: document.getElementById("editorClearMapButton"),
        output: document.getElementById("editorMapOutput"),
        status: document.getElementById("editorStatus")
    };
}

function openMapEditor() {
    cleanupGame();

    currentMode = "editor";
    hideAllMenus();
    roomInfoPanel.classList.add("hidden");
    panels.editor.classList.remove("hidden");

    if (!mapEditor) {
        mapEditor = new MapEditor(canvas, getMapEditorUi(), settings);
    }

    mapEditor.settings = settings;
    mapEditor.start();
}

function closeMapEditor() {
    mapEditor?.stop();
    showPanel("main");
}

async function readMapFile(file, statusElement) {
    if (!file) {
        return null;
    }

    try {
        const text = await file.text();
        const cleaned = text
            .replace(/^export\s+const\s+\w+\s*=\s*/, "")
            .replace(/;\s*$/, "");

        const data = JSON.parse(cleaned);

        if (!Array.isArray(data.terrainBlocks)) {
            throw new Error("terrainBlocks missing");
        }

        if (!data.playerStart) {
            throw new Error("playerStart missing");
        }

        data.pickups ||= [];
        data.spawnPoints ||= [];
        data.backgroundObjects ||= [];
        data.season ||= settings.season;

        statusElement.textContent = `当前：${file.name}`;
        return data;
    } catch (error) {
        statusElement.textContent = `地图读取失败：${error.message}`;
        return null;
    }
}

function startSinglePlayer(mapData) {
    cleanupGame();

    currentMode = "game";
    hideAllMenus();

    const playableMap = structuredClone(mapData);
    playableMap.season = playableMap.season || settings.season;

    game = new Game(canvas, playableMap, settings, {
        mode: "single",
        multiplayerClient: null
    });

    game.start();
}

function startMultiplayerGame(mapData, client) {
    cleanupGame(client);

    currentMode = "game";
    hideAllMenus();

    const playableMap = structuredClone(mapData);
    playableMap.season = playableMap.season || settings.season;

    game = new Game(canvas, playableMap, settings, {
        mode: "multiplayer",
        multiplayerClient: client
    });

    game.start();
}

function cleanupGame(keepClient = null) {
    if (mapEditor?.running) {
        mapEditor.stop();
    }

    if (game) {
        game.stop?.();
        game = null;
    }

    if (multiplayerClient && multiplayerClient !== keepClient) {
        multiplayerClient.destroy();
        multiplayerClient = null;
    }

    if (keepClient) {
        multiplayerClient = keepClient;
    }
}

function hideAllMenus() {
    for (const panel of Object.values(panels)) {
        panel.classList.add("hidden");
    }

    escapeMenu.classList.add("hidden");
}

function showRoomCode(roomId) {
    roomCodeText.textContent = roomId;
    roomInfoPanel.classList.remove("hidden");
}

function backToMenu() {
    cleanupGame();

    currentMode = "menu";

    escapeMenu.classList.add("hidden");
    roomInfoPanel.classList.add("hidden");

    showPanel("main");
}

function initializeSettingsUi() {
    settingsSeasonSelect.value = settings.season;
    showHitboxesCheckbox.checked = settings.showHitboxes;
    refreshKeybindButtons();
}

function applySettings() {
    settings.season = settingsSeasonSelect.value;
    settings.showHitboxes = showHitboxesCheckbox.checked;

    saveSettings(settings);
    refreshKeybindButtons();

    if (mapEditor) {
        mapEditor.settings = settings;
    }

    if (game) {
        game.settings = settings;
        game.season = settings.season;

        if (game.input) {
            game.input.settings = settings;
        }
    }

    if (currentMode !== "game") {
        drawMenuFrame();
    }

    settingsStatus.textContent = "Settings saved.";
}

function refreshKeybindButtons() {
    for (const button of keybindButtons) {
        const action = button.dataset.action;
        const keys = settings.keybinds[action] || [];
        const title = button.dataset.label || button.textContent.split(":")[0];

        button.dataset.label = title;
        button.textContent = `${title}: ${keys.map(keyName).join(" / ")}`;
    }
}

function openSettings(returnTarget = "menu") {
    settingsReturnTarget = returnTarget;
    currentMode = "settings";

    if (returnTarget === "game" && game) {
        game.setPaused(true);
    }

    hideAllMenus();
    panels.settings.classList.remove("hidden");

    initializeSettingsUi();
    settingsStatus.textContent = "";
    drawSeasonBackground(ctx, canvas, settings.season);
}

function closeSettings() {
    panels.settings.classList.add("hidden");

    if (settingsReturnTarget === "game" && game) {
        currentMode = "game";
        game.setPaused(true);
        escapeMenu.classList.remove("hidden");
        setEscapeTab("game");
        return;
    }

    showPanel("main");
}

function toggleEscapeMenu() {
    if (!game) {
        return;
    }

    if (escapeMenu.classList.contains("hidden")) {
        openEscapeMenu();
    } else {
        closeEscapeMenuAndResume();
    }
}

function openEscapeMenu() {
    if (!game) {
        return;
    }

    game.setPaused(true);
    escapeMenu.classList.remove("hidden");
    setEscapeTab("game");
    refreshEscapePlayerList();
}

function closeEscapeMenuAndResume() {
    if (!game) {
        return;
    }

    escapeMenu.classList.add("hidden");
    game.setPaused(false);
}

function setEscapeTab(tabName) {
    for (const tab of escapeTabs) {
        tab.classList.toggle("active", tab.dataset.tab === tabName);
    }

    escapeGamePage.classList.toggle("hidden", tabName !== "game");
    escapeSpectatePage.classList.toggle("hidden", tabName !== "spectate");
    escapePlayersPage.classList.toggle("hidden", tabName !== "players");

    if (tabName === "players") {
        refreshEscapePlayerList();
    }
}

function refreshEscapePlayerList() {
    escapePlayerList.innerHTML = "";

    const players = game?.getPlayerListForMenu?.() || [
        {
            name: "Player 1",
            alive: true,
            kills: 0,
            self: true
        }
    ];

    for (const player of players) {
        const row = document.createElement("div");
        row.className = "player-list-row";

        const dot = document.createElement("span");
        dot.className = `player-dot${player.alive ? "" : " dead"}`;

        const name = document.createElement("span");
        name.textContent = player.name;

        const tag = document.createElement("span");
        tag.className = "player-tag";
        tag.textContent = `${player.self ? "You · " : ""}${player.alive ? "Alive" : "Dead"} · ${player.kills || 0} K`;

        row.append(dot, name, tag);
        escapePlayerList.append(row);
    }
}

function drawMenuFrame() {
    drawSeasonBackground(ctx, canvas, settings.season);

    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}