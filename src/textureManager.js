const imageCache = new Map();

export const DEFAULT_TEXTURE_IDS = {
    heartFull: "ui_heart_full",
    heartEmpty: "ui_heart_empty",
    ammoBullet: "ui_ammo_bullet",
    ammoShell: "ui_ammo_shell",
    pickupHealth: "pickup_health",
    pickupBulletAmmo: "pickup_bullet_ammo",
    pickupShellAmmo: "pickup_shell_ammo",
    pickupShellWeapon: "pickup_shell_weapon"
};

function svgData(svg) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const BUILTIN_TEXTURES = [
    {
        id: "ui_heart_full",
        name: "HUD Heart Full",
        kind: "ui",
        src: svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#ef4444" stroke="#fecaca" stroke-width="4" d="M32 56C17 43 8 35 8 23 8 14 14 8 22 8c5 0 9 3 10 7 1-4 5-7 10-7 8 0 14 6 14 15 0 12-9 20-24 33z"/></svg>`)
    },
    {
        id: "ui_heart_empty",
        name: "HUD Heart Empty",
        kind: "ui",
        src: svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="rgba(239,68,68,0.22)" stroke="rgba(254,202,202,0.55)" stroke-width="4" d="M32 56C17 43 8 35 8 23 8 14 14 8 22 8c5 0 9 3 10 7 1-4 5-7 10-7 8 0 14 6 14 15 0 12-9 20-24 33z"/></svg>`)
    },
    {
        id: "ui_ammo_bullet",
        name: "HUD Bullet",
        kind: "ui",
        src: svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32"><path fill="#cbd5e1" stroke="#f8fafc" stroke-width="3" d="M5 7h40l14 9-14 9H5z"/><path stroke="#64748b" stroke-width="3" d="M15 7v18"/></svg>`)
    },
    {
        id: "ui_ammo_shell",
        name: "HUD Shell",
        kind: "ui",
        src: svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="25" fill="#facc15" stroke="#fef3c7" stroke-width="4"/><circle cx="24" cy="23" r="7" fill="#fde68a" opacity=".75"/></svg>`)
    },
    {
        id: "pickup_health",
        name: "Health Pickup",
        kind: "pickup",
        src: svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#ef4444" stroke="#fecaca" stroke-width="4" d="M32 56C17 43 8 35 8 23 8 14 14 8 22 8c5 0 9 3 10 7 1-4 5-7 10-7 8 0 14 6 14 15 0 12-9 20-24 33z"/></svg>`)
    },
    {
        id: "pickup_bullet_ammo",
        name: "Bullet Ammo Pickup",
        kind: "pickup",
        src: svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40"><path fill="#cbd5e1" stroke="#f8fafc" stroke-width="4" d="M4 10h42l14 10-14 10H4z"/><path stroke="#64748b" stroke-width="3" d="M15 10v20"/></svg>`)
    },
    {
        id: "pickup_shell_ammo",
        name: "Shell Ammo Pickup",
        kind: "pickup",
        src: svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#fb923c" stroke="#fed7aa" stroke-width="4"/><circle cx="24" cy="22" r="8" fill="#ffedd5" opacity=".45"/></svg>`)
    },
    {
        id: "pickup_shell_weapon",
        name: "Shell Weapon Pickup",
        kind: "pickup",
        src: svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 48"><rect x="7" y="18" width="54" height="18" rx="5" fill="#1f2937" stroke="#f8fafc" stroke-width="3"/><rect x="58" y="21" width="16" height="12" fill="#f8fafc"/><circle cx="28" cy="27" r="7" fill="#f97316"/></svg>`)
    },
    {
        id: "terrain_grass_tile",
        name: "Grass Tile",
        kind: "terrain",
        src: svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#795039"/><rect width="64" height="16" fill="#5ca547"/><path fill="#6fc35a" d="M0 16l8 8 8-8 8 8 8-8 8 8 8-8 8 8 8-8v-16H0z"/><circle cx="14" cy="38" r="6" fill="#7b4d34" opacity=".5"/><circle cx="45" cy="50" r="8" fill="#7b4d34" opacity=".35"/></svg>`)
    },
    {
        id: "terrain_stone_brick_tile",
        name: "Stone Brick Tile",
        kind: "terrain",
        src: svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="48" viewBox="0 0 96 48"><rect width="96" height="48" fill="#64748b"/><path d="M0 24h96M48 0v24M24 24v24M72 24v24" stroke="#1f2937" stroke-width="3" opacity=".45"/></svg>`)
    }
];

export function normalizeMapAssets(mapData) {
    mapData.assets ||= {};
    mapData.assets.textures ||= [];
    mapData.assets.iconTextures ||= { ...DEFAULT_TEXTURE_IDS };

    for (const [key, value] of Object.entries(DEFAULT_TEXTURE_IDS)) {
        mapData.assets.iconTextures[key] ||= value;
    }

    for (const texture of BUILTIN_TEXTURES) {
        const exists = mapData.assets.textures.some((item) => item.id === texture.id);
        if (!exists) {
            mapData.assets.textures.push({ ...texture, builtin: true });
        }
    }

    return mapData.assets;
}

export function getTextureList(mapData) {
    return normalizeMapAssets(mapData).textures;
}

export function getTexture(mapData, textureId) {
    if (!textureId) {
        return null;
    }

    return getTextureList(mapData).find((texture) => texture.id === textureId) || null;
}

export function getTextureSrc(mapData, textureId) {
    return getTexture(mapData, textureId)?.src || "";
}

export function getImage(mapData, textureId) {
    const src = getTextureSrc(mapData, textureId);

    if (!src) {
        return null;
    }

    if (!imageCache.has(src)) {
        const image = new Image();
        image.src = src;
        imageCache.set(src, image);
    }

    const image = imageCache.get(src);
    return image?.complete ? image : null;
}

export function drawTexture(ctx, mapData, textureId, x, y, width, height, options = {}) {
    const image = getImage(mapData, textureId);

    if (!image) {
        if (typeof options.fallback === "function") {
            options.fallback();
        }
        return false;
    }

    ctx.save();
    if (typeof options.alpha === "number") {
        ctx.globalAlpha *= options.alpha;
    }

    if (options.clipRounded && typeof options.roundRect === "function") {
        options.roundRect(ctx, x, y, width, height, options.radius || 0);
        ctx.clip();
    }

    if (options.repeat) {
        const pattern = ctx.createPattern(image, "repeat");
        if (pattern) {
            ctx.translate(x, y);
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, width, height);
        }
    } else {
        ctx.drawImage(image, x, y, width, height);
    }

    ctx.restore();
    return true;
}
