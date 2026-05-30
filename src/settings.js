export const DEFAULT_SETTINGS = {
    season: "spring",

    keybinds: {
        left: ["a", "arrowleft"],
        right: ["d", "arrowright"],
        jump: [" "],
        fire: ["e"],
        chat: ["t"],
        freeCamera: ["q"],
        weapon1: ["1"],
        weapon2: ["2"],
        weapon3: ["3"]
    },

    showHitboxes: false
};

const COOKIE_NAME = "cube_shoot_settings";

function setCookie(name, value, days = 365) {
    const expires = new Date(
        Date.now() + days * 24 * 60 * 60 * 1000
    ).toUTCString();

    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name) {
    const prefix = `${name}=`;
    const parts = document.cookie.split(";");

    for (const part of parts) {
        const text = part.trim();

        if (text.startsWith(prefix)) {
            return decodeURIComponent(text.slice(prefix.length));
        }
    }

    return null;
}

function clone(value) {
    if (typeof structuredClone === "function") {
        return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, override) {
    const result = clone(base);

    for (const key of Object.keys(override || {})) {
        if (
            override[key] &&
            typeof override[key] === "object" &&
            !Array.isArray(override[key])
        ) {
            result[key] = deepMerge(result[key] || {}, override[key]);
        } else {
            result[key] = override[key];
        }
    }

    return result;
}

export function loadSettings() {
    const raw = getCookie(COOKIE_NAME);

    if (!raw) {
        return clone(DEFAULT_SETTINGS);
    }

    try {
        return deepMerge(DEFAULT_SETTINGS, JSON.parse(raw));
    } catch {
        return clone(DEFAULT_SETTINGS);
    }
}

export function saveSettings(settings) {
    setCookie(COOKIE_NAME, JSON.stringify(settings));
}

export function resetSettings() {
    saveSettings(DEFAULT_SETTINGS);
    return clone(DEFAULT_SETTINGS);
}

export function normalizeKey(event) {
    return event.key.toLowerCase();
}

export function keyName(key) {
    if (key === " ") return "Space";
    if (key === "arrowleft") return "Arrow Left";
    if (key === "arrowright") return "Arrow Right";
    if (key === "arrowup") return "Arrow Up";
    if (key === "arrowdown") return "Arrow Down";
    return key.toUpperCase();
}
