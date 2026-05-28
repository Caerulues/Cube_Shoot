import { defaultMap } from "./maps/defaultMap.js";
import { drawTexture, normalizeMapAssets } from "./textureManager.js";

export class Terrain {
    constructor(canvas, mapData = defaultMap) {
        this.canvas = canvas;
        this.mapData = structuredClone(mapData);
        this.mapData.pickups ||= [];
        this.mapData.playerSpawnPoints ||= [];
        this.mapData.backgroundObjects ||= [];
        this.mapData.season ||= "spring";
        normalizeMapAssets(this.mapData);

        this.worldWidth = this.mapData.worldWidth;
        this.worldHeight = this.mapData.worldHeight;
        this.voidY = this.mapData.voidY;

        this.terrainBlocks = this.mapData.terrainBlocks;
        this.spawnPoints = this.mapData.spawnPoints;
        this.playerSpawnPoints = this.mapData.playerSpawnPoints;
        this.pickups = this.mapData.pickups;
        this.backgroundObjects = this.mapData.backgroundObjects;
    }

    getEntityCollisionRect(entity) {
        if (entity.collisionRect) {
            return entity.collisionRect;
        }

        return {
            x: entity.x,
            y: entity.y,
            width: entity.width ?? entity.size,
            height: entity.height ?? entity.size
        };
    }

    getPreviousEntityCollisionRect(entity) {
        const rect = this.getEntityCollisionRect(entity);

        return {
            x: entity.prevX + (rect.x - entity.x),
            y: entity.prevY + (rect.y - entity.y),
            width: rect.width,
            height: rect.height
        };
    }

    getBlockCollisionRect(block) {
        return {
            x: block.x,
            y: block.y,
            width: block.width,
            height: block.height
        };
    }

    getPlayerStart() {
        return {
            x: this.mapData.playerStart.x,
            y: this.mapData.playerStart.y
        };
    }

    getPlayerSpawnPoint(randomize = false) {
        const points = Array.isArray(this.playerSpawnPoints)
            ? this.playerSpawnPoints.filter((point) => point.enabled !== false)
            : [];

        if (points.length === 0) {
            return this.getPlayerStart();
        }

        const index = randomize
            ? Math.floor(Math.random() * points.length)
            : 0;

        return {
            x: points[index].x,
            y: points[index].y
        };
    }

    getSpawnPoints(type = "normal") {
        return this.spawnPoints.filter((point) => {
            return point.enabled && point.type === type;
        });
    }

    getRandomSpawnPoint(type = "normal") {
        const points = this.getSpawnPoints(type);

        if (points.length === 0) {
            return {
                x: this.worldWidth / 2,
                y: 430,
                type
            };
        }

        return points[Math.floor(Math.random() * points.length)];
    }

    getStandingSurface(entity) {
        const rect = this.getEntityCollisionRect(entity);
        const prevRect = this.getPreviousEntityCollisionRect(entity);

        const entityBottom = rect.y + rect.height;
        const previousBottom = prevRect.y + prevRect.height;

        let surfaceY = null;

        for (const block of this.terrainBlocks) {
            const blockRect = this.getBlockCollisionRect(block);

            const horizontallyOverBlock =
                rect.x + rect.width > blockRect.x &&
                rect.x < blockRect.x + blockRect.width;

            const wasAboveBlock = previousBottom <= blockRect.y;
            const isFallingOntoBlock = entityBottom >= blockRect.y && entity.vy >= 0;

            if (horizontallyOverBlock && wasAboveBlock && isFallingOntoBlock) {
                if (surfaceY === null || blockRect.y < surfaceY) {
                    surfaceY = blockRect.y;
                }
            }
        }

        return surfaceY;
    }

    resolveHorizontalCollision(entity) {
        const hitbox = entity.hitbox || {
            offsetX: 0,
            offsetY: 0
        };

        for (const block of this.terrainBlocks) {
            const rect = this.getEntityCollisionRect(entity);
            const prevRect = this.getPreviousEntityCollisionRect(entity);
            const blockRect = this.getBlockCollisionRect(block);

            const overlapsVertically =
                rect.y + rect.height > blockRect.y &&
                rect.y < blockRect.y + blockRect.height;

            const overlapsHorizontally =
                rect.x + rect.width > blockRect.x &&
                rect.x < blockRect.x + blockRect.width;

            if (!overlapsVertically || !overlapsHorizontally) {
                continue;
            }

            const previousRight = prevRect.x + prevRect.width;
            const previousLeft = prevRect.x;

            const cameFromLeft = previousRight <= blockRect.x;
            const cameFromRight = previousLeft >= blockRect.x + blockRect.width;

            if (cameFromLeft) {
                entity.x = blockRect.x - hitbox.offsetX - rect.width;
                entity.vx = 0;
            } else if (cameFromRight) {
                entity.x = blockRect.x + blockRect.width - hitbox.offsetX;
                entity.vx = 0;
            } else {
                const pushLeft = rect.x + rect.width - blockRect.x;
                const pushRight = blockRect.x + blockRect.width - rect.x;

                if (pushLeft < pushRight) {
                    entity.x -= pushLeft;
                } else {
                    entity.x += pushRight;
                }

                entity.vx = 0;
            }
        }
    }

    resolveVerticalCollision(entity) {
        const hitbox = entity.hitbox || {
            offsetX: 0,
            offsetY: 0
        };

        let collisionType = null;

        for (const block of this.terrainBlocks) {
            const rect = this.getEntityCollisionRect(entity);
            const prevRect = this.getPreviousEntityCollisionRect(entity);
            const blockRect = this.getBlockCollisionRect(block);

            const overlapsHorizontally =
                rect.x + rect.width > blockRect.x &&
                rect.x < blockRect.x + blockRect.width;

            const overlapsVertically =
                rect.y + rect.height > blockRect.y &&
                rect.y < blockRect.y + blockRect.height;

            if (!overlapsHorizontally || !overlapsVertically) {
                continue;
            }

            const previousBottom = prevRect.y + prevRect.height;
            const previousTop = prevRect.y;

            const cameFromAbove = previousBottom <= blockRect.y;
            const cameFromBelow = previousTop >= blockRect.y + blockRect.height;

            if (cameFromAbove && entity.vy >= 0) {
                entity.y = blockRect.y - hitbox.offsetY - rect.height;
                entity.vy = 0;
                collisionType = "ground";
            } else if (cameFromBelow && entity.vy < 0) {
                entity.y = blockRect.y + blockRect.height - hitbox.offsetY;
                entity.vy = 0;
                collisionType = "ceiling";
            } else {
                const pushUp = rect.y + rect.height - blockRect.y;
                const pushDown = blockRect.y + blockRect.height - rect.y;

                if (pushUp < pushDown) {
                    entity.y -= pushUp;
                    if (entity.vy > 0) {
                        entity.vy = 0;
                    }
                    collisionType = "ground";
                } else {
                    entity.y += pushDown;
                    if (entity.vy < 0) {
                        entity.vy = 0;
                    }
                    collisionType = "ceiling";
                }
            }
        }

        return collisionType;
    }

    isRectCollidingWithTerrain(rect) {
        return this.terrainBlocks.some((block) => {
            const blockRect = this.getBlockCollisionRect(block);

            return (
                rect.x < blockRect.x + blockRect.width &&
                rect.x + rect.width > blockRect.x &&
                rect.y < blockRect.y + blockRect.height &&
                rect.y + rect.height > blockRect.y
            );
        });
    }

    getSurfaceYBelow(x, y, maxDistance = 90) {
        let nearestSurfaceY = null;

        for (const block of this.terrainBlocks) {
            const blockRect = this.getBlockCollisionRect(block);

            const horizontallyInside =
                x >= blockRect.x &&
                x <= blockRect.x + blockRect.width;

            if (!horizontallyInside) {
                continue;
            }

            const surfaceY = blockRect.y;
            const isBelowPoint = surfaceY >= y && surfaceY <= y + maxDistance;

            if (!isBelowPoint) {
                continue;
            }

            if (nearestSurfaceY === null || surfaceY < nearestSurfaceY) {
                nearestSurfaceY = surfaceY;
            }
        }

        return nearestSurfaceY;
    }

    hasGroundAhead(entity, direction, distance = 36) {
        const rect = this.getEntityCollisionRect(entity);

        const probeX =
            rect.x +
            rect.width / 2 +
            direction * (rect.width / 2 + distance);

        const probeY = rect.y + rect.height;

        return this.getSurfaceYBelow(probeX, probeY - 4, 90) !== null;
    }

    hasWallAhead(entity, direction, distance = 8) {
        const entityRect = this.getEntityCollisionRect(entity);

        const rect = {
            x: direction > 0
                ? entityRect.x + entityRect.width
                : entityRect.x - distance,
            y: entityRect.y + 4,
            width: distance,
            height: entityRect.height - 8
        };

        return this.isRectCollidingWithTerrain(rect);
    }

    hasLineOfSight(x1, y1, x2, y2) {
        const steps = 30;

        for (let i = 3; i < steps; i++) {
            const t = i / steps;
            const x = x1 + (x2 - x1) * t;
            const y = y1 + (y2 - y1) * t;

            const probe = {
                x: x - 3,
                y: y - 3,
                width: 6,
                height: 6
            };

            if (this.isRectCollidingWithTerrain(probe)) {
                return false;
            }
        }

        return true;
    }

    isEntityInVoid(entity) {
        const rect = this.getEntityCollisionRect(entity);
        return rect.y > this.voidY;
    }

    clampEntityToWorld(entity) {
        const rect = this.getEntityCollisionRect(entity);

        if (rect.x < 0) {
            entity.x -= rect.x;
        }

        if (rect.x + rect.width > this.worldWidth) {
            entity.x -= rect.x + rect.width - this.worldWidth;
        }
    }

    draw(ctx, options = {}) {
        if (options.drawBackgroundObjects !== false) {
            this.drawBackgroundObjects(ctx);
        }

        this.drawTerrainBlocks(ctx, options.selectedBlockId);
        if (options.showSpawnPoints === true) {
            this.drawSpawnPoints(ctx);
        }
        this.drawWorldBounds(ctx);
        this.drawVoidLine(ctx);
        this.drawPickups(ctx);
    }

    drawBackgroundObjects(ctx) {
        for (const object of this.backgroundObjects) {
            if (object.type === "cloud") {
                this.drawCloud(ctx, object);
            }

            if (object.type === "fence") {
                this.drawFence(ctx, object);
            }

            if (object.type === "lantern") {
                this.drawLantern(ctx, object);
            }

            if (object.type === "dripstone") {
                this.drawDripstone(ctx, object);
            }

            if (object.type === "image" && object.textureId) {
                const width = object.width || 240;
                const height = object.height || 140;
                drawTexture(ctx, this.mapData, object.textureId, object.x, object.y, width, height, {
                    alpha: Number.isFinite(Number(object.alpha)) ? Number(object.alpha) : 1
                });
            }
        }
    }

    drawCloud(ctx, object) {
        const scale = object.scale || 1;

        ctx.save();
        ctx.globalAlpha = object.alpha ?? 0.85;
        ctx.fillStyle = "#ffffff";

        ctx.beginPath();
        ctx.ellipse(object.x, object.y, 52 * scale, 16 * scale, 0, 0, Math.PI * 2);
        ctx.ellipse(object.x + 36 * scale, object.y - 8 * scale, 42 * scale, 22 * scale, 0, 0, Math.PI * 2);
        ctx.ellipse(object.x + 80 * scale, object.y, 62 * scale, 18 * scale, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(150, 105, 105, 0.28)";
        ctx.lineWidth = 2 * scale;

        ctx.beginPath();
        ctx.arc(object.x + 52 * scale, object.y - 2 * scale, 12 * scale, 0, Math.PI * 1.6);
        ctx.arc(object.x + 82 * scale, object.y - 2 * scale, 12 * scale, Math.PI * 1.2, Math.PI * 2.15);
        ctx.stroke();

        ctx.restore();
    }

    drawFence(ctx, object) {
        const width = object.width || 120;
        const height = object.height || 180;
        const postGap = object.postGap || 42;

        ctx.save();
        ctx.globalAlpha = object.alpha ?? 0.65;
        ctx.strokeStyle = "#8a6040";
        ctx.lineWidth = 8;

        for (let x = object.x; x <= object.x + width; x += postGap) {
            ctx.beginPath();
            ctx.moveTo(x, object.y);
            ctx.lineTo(x, object.y + height);
            ctx.stroke();
        }

        ctx.lineWidth = 7;

        for (let x = object.x; x < object.x + width; x += postGap) {
            ctx.beginPath();
            ctx.moveTo(x, object.y + 16);
            ctx.lineTo(x + postGap, object.y + height - 16);
            ctx.moveTo(x + postGap, object.y + 16);
            ctx.lineTo(x, object.y + height - 16);
            ctx.stroke();
        }

        ctx.restore();
    }

    drawLantern(ctx, object) {
        ctx.save();
        ctx.globalAlpha = object.alpha ?? 0.9;

        ctx.strokeStyle = "#38403c";
        ctx.lineWidth = 4;

        ctx.beginPath();
        ctx.moveTo(object.x, object.y - 76);
        ctx.lineTo(object.x, object.y - 14);
        ctx.stroke();

        const glow = ctx.createRadialGradient(
            object.x,
            object.y,
            2,
            object.x,
            object.y,
            56
        );

        glow.addColorStop(0, "rgba(255, 238, 166, 0.55)");
        glow.addColorStop(1, "rgba(255, 238, 166, 0)");

        ctx.fillStyle = glow;

        ctx.beginPath();
        ctx.arc(object.x, object.y, 56, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#242b28";
        ctx.fillRect(object.x - 13, object.y - 14, 26, 34);

        ctx.fillStyle = "#ffe08a";
        ctx.fillRect(object.x - 8, object.y - 7, 16, 20);

        ctx.strokeStyle = "#111827";
        ctx.strokeRect(object.x - 13, object.y - 14, 26, 34);

        ctx.restore();
    }

    drawDripstone(ctx, object) {
        const height = object.height || 90;
        const width = object.width || 30;

        ctx.save();
        ctx.globalAlpha = object.alpha ?? 0.45;
        ctx.fillStyle = "#9aa4a7";

        ctx.beginPath();
        ctx.moveTo(object.x - width / 2, object.y);
        ctx.lineTo(object.x + width / 2, object.y);
        ctx.lineTo(object.x, object.y + height);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,0.18)";

        ctx.beginPath();
        ctx.moveTo(object.x - width / 5, object.y + 8);
        ctx.lineTo(object.x + 1, object.y + 8);
        ctx.lineTo(object.x - 2, object.y + height * 0.62);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    drawPickups(ctx) {
        for (const pickup of this.pickups) {
            if (!pickup.enabled) {
                continue;
            }

            const textureId = pickup.textureId || this.getPickupTextureId(pickup);

            if (textureId) {
                const drawn = drawTexture(
                    ctx,
                    this.mapData,
                    textureId,
                    pickup.x,
                    pickup.y,
                    pickup.width,
                    pickup.height,
                    {
                        fallback: () => this.drawPickupFallback(ctx, pickup)
                    }
                );

                if (drawn) {
                    continue;
                }
            }

            this.drawPickupFallback(ctx, pickup);
        }
    }

    getPickupTextureId(pickup) {
        const icons = this.mapData.assets?.iconTextures || {};

        if (pickup.type === "health") {
            return icons.pickupHealth;
        }

        if (pickup.type === "weapon" && pickup.weapon === "shell") {
            return icons.pickupShellWeapon;
        }

        if (pickup.type === "ammo" && pickup.weapon === "shell") {
            return icons.pickupShellAmmo;
        }

        if (pickup.type === "ammo" && pickup.weapon === "bullet") {
            return icons.pickupBulletAmmo;
        }

        return null;
    }

    drawPickupFallback(ctx, pickup) {
        if (pickup.type === "health") {
            this.drawHealthPickup(ctx, pickup);
        } else if (pickup.type === "weapon" && pickup.weapon === "shell") {
            this.drawShellWeaponPickup(ctx, pickup);
        } else if (pickup.type === "ammo" && pickup.weapon === "shell") {
            this.drawShellAmmoPickup(ctx, pickup);
        } else if (pickup.type === "ammo" && pickup.weapon === "bullet") {
            this.drawBulletAmmoPickup(ctx, pickup);
        } else {
            this.drawGenericPickup(ctx, pickup);
        }
    }

    drawGenericPickup(ctx, pickup) {
        ctx.save();
        ctx.fillStyle = "#facc15";
        this.roundRect(ctx, pickup.x, pickup.y, pickup.width, pickup.height, 4);
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }

    drawHealthPickup(ctx, pickup) {
        const cx = pickup.x + pickup.width / 2;
        const cy = pickup.y + pickup.height / 2 + 2;
        const s = Math.min(pickup.width, pickup.height) / 2.2;

        ctx.save();
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.moveTo(cx, cy + s * 0.65);
        ctx.bezierCurveTo(cx - s * 1.25, cy - s * 0.15, cx - s * 0.95, cy - s * 1.1, cx - s * 0.25, cy - s * 0.8);
        ctx.bezierCurveTo(cx, cy - s * 1.35, cx + s * 0.25, cy - s * 1.35, cx + s * 0.5, cy - s * 0.8);
        ctx.bezierCurveTo(cx + s * 1.2, cy - s * 1.1, cx + s * 1.25, cy - s * 0.15, cx, cy + s * 0.65);
        ctx.fill();
        ctx.strokeStyle = "#fecaca";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }

    drawBulletAmmoPickup(ctx, pickup) {
        const x = pickup.x + 2;
        const y = pickup.y + pickup.height / 2;

        ctx.save();
        ctx.fillStyle = "#cbd5e1";
        ctx.beginPath();
        ctx.moveTo(x, y - 7);
        ctx.lineTo(x + pickup.width - 10, y - 7);
        ctx.lineTo(x + pickup.width - 2, y);
        ctx.lineTo(x + pickup.width - 10, y + 7);
        ctx.lineTo(x, y + 7);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#f8fafc";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }

    drawShellAmmoPickup(ctx, pickup) {
        const cx = pickup.x + pickup.width / 2;
        const cy = pickup.y + pickup.height / 2;
        const radius = Math.min(pickup.width, pickup.height) / 2 - 2;

        ctx.save();
        ctx.fillStyle = "#fb923c";
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fed7aa";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }

    drawShellWeaponPickup(ctx, pickup) {
        const cx = pickup.x + pickup.width / 2;
        const cy = pickup.y + pickup.height / 2;

        ctx.save();
        ctx.fillStyle = "#1f2937";
        this.roundRect(ctx, pickup.x + 2, pickup.y + 8, pickup.width - 4, pickup.height - 12, 4);
        ctx.fill();

        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(pickup.x + pickup.width - 2, cy - 4, 9, 8);

        ctx.fillStyle = "#f97316";
        ctx.beginPath();
        ctx.arc(cx - 3, cy, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.strokeRect(pickup.x + 2, pickup.y + 8, pickup.width - 4, pickup.height - 12);
        ctx.restore();
    }

    drawTerrainBlocks(ctx, selectedBlockId = null) {
        for (const block of this.terrainBlocks) {
            this.drawBlock(ctx, block, block.id === selectedBlockId);
        }
    }

    drawBlock(ctx, block, selected = false) {
        if (block.textureId) {
            this.drawTexturedBlock(ctx, block, selected);
            return;
        }

        if (block.type === "grass") {
            this.drawGrassBlock(ctx, block, selected);
            return;
        }

        const radius = Math.min(8, block.height / 5, block.width / 5);

        ctx.save();

        this.roundRect(ctx, block.x, block.y, block.width, block.height, radius);
        ctx.fillStyle = this.getBlockFillColor(block);
        ctx.fill();

        ctx.save();
        ctx.clip();

        ctx.fillStyle = this.getBlockTopColor(block);
        ctx.fillRect(block.x, block.y, block.width, Math.min(9, block.height));

        this.drawBlockTexture(ctx, block);

        ctx.restore();

        ctx.strokeStyle = this.getBlockStrokeColor(block);
        ctx.lineWidth =
            block.type === "solid_dark" ||
            block.type === "solid_blue" ||
            block.type === "solid_green"
                ? 3
                : 2;

        this.roundRect(ctx, block.x, block.y, block.width, block.height, radius);
        ctx.stroke();

        if (selected) {
            this.drawSelection(ctx, block);
        }

        ctx.restore();
    }


    drawTexturedBlock(ctx, block, selected = false) {
        const radius = Math.min(8, block.height / 5, block.width / 5);

        ctx.save();
        const drawn = drawTexture(ctx, this.mapData, block.textureId, block.x, block.y, block.width, block.height, {
            repeat: block.textureMode !== "stretch",
            clipRounded: true,
            radius,
            roundRect: (drawCtx, x, y, width, height, r) => this.roundRect(drawCtx, x, y, width, height, r),
            fallback: () => {
                this.roundRect(ctx, block.x, block.y, block.width, block.height, radius);
                ctx.fillStyle = this.getBlockFillColor(block);
                ctx.fill();
            }
        });

        if (drawn) {
            this.roundRect(ctx, block.x, block.y, block.width, block.height, radius);
            ctx.strokeStyle = this.getBlockStrokeColor(block);
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        if (selected) {
            this.drawSelection(ctx, block);
        }

        ctx.restore();
    }

    drawGrassBlock(ctx, block, selected = false) {
        ctx.save();

        ctx.fillStyle = "#795039";
        ctx.fillRect(block.x, block.y + 10, block.width, block.height - 10);

        ctx.fillStyle = "#7b4d34";
        ctx.globalAlpha = 0.28;

        for (let x = block.x + 10; x < block.x + block.width; x += 26) {
            ctx.beginPath();
            ctx.arc(x, block.y + 24 + ((x * 7) % 31), 9, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;

        ctx.fillStyle = "#5ca547";
        ctx.fillRect(block.x, block.y, block.width, 16);

        ctx.fillStyle = "#6fc35a";

        for (let x = block.x; x < block.x + block.width; x += 18) {
            ctx.beginPath();
            ctx.moveTo(x, block.y + 16);
            ctx.lineTo(x + 8, block.y + 24);
            ctx.lineTo(x + 16, block.y + 16);
            ctx.fill();
        }

        if (!this.hasAdjacentGrass(block, "left")) {
            ctx.fillStyle = "rgba(79, 45, 29, 0.28)";
            ctx.fillRect(block.x, block.y + 16, 3, block.height - 16);
        }

        if (!this.hasAdjacentGrass(block, "right")) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
            ctx.fillRect(block.x + block.width - 3, block.y + 16, 3, block.height - 16);
        }

        if (!this.hasAdjacentGrass(block, "bottom")) {
            ctx.fillStyle = "rgba(79, 45, 29, 0.22)";
            ctx.fillRect(block.x, block.y + block.height - 3, block.width, 3);
        }

        if (selected) {
            this.drawSelection(ctx, block);
        }

        ctx.restore();
    }

    hasAdjacentGrass(block, direction) {
        return this.terrainBlocks.some((other) => {
            if (other === block || other.type !== "grass") {
                return false;
            }

            if (direction === "left") {
                return (
                    other.x + other.width === block.x &&
                    other.y < block.y + block.height &&
                    other.y + other.height > block.y
                );
            }

            if (direction === "right") {
                return (
                    block.x + block.width === other.x &&
                    other.y < block.y + block.height &&
                    other.y + other.height > block.y
                );
            }

            if (direction === "bottom") {
                return (
                    block.y + block.height === other.y &&
                    other.x < block.x + block.width &&
                    other.x + other.width > block.x
                );
            }

            return false;
        });
    }

    drawSelection(ctx, block) {
        ctx.save();
        ctx.setLineDash([10, 6]);
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 3;
        ctx.strokeRect(block.x - 4, block.y - 4, block.width + 8, block.height + 8);
        ctx.restore();
    }

    drawBlockTexture(ctx, block) {
        if (block.type === "stone_brick") {
            ctx.save();

            ctx.strokeStyle = "rgba(31, 41, 55, 0.34)";
            ctx.lineWidth = 2;

            const h = 22;

            for (let y = block.y + h; y < block.y + block.height; y += h) {
                ctx.beginPath();
                ctx.moveTo(block.x, y);
                ctx.lineTo(block.x + block.width, y);
                ctx.stroke();
            }

            for (let y = block.y; y < block.y + block.height; y += h) {
                const offset = Math.floor((y - block.y) / h) % 2 === 0 ? 0 : 34;

                for (let x = block.x + offset; x < block.x + block.width; x += 68) {
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, Math.min(y + h, block.y + block.height));
                    ctx.stroke();
                }
            }

            ctx.restore();
            return;
        }

        if (
            block.type === "solid_dark" ||
            block.type === "solid_blue" ||
            block.type === "solid_green"
        ) {
            ctx.save();

            ctx.globalAlpha = 0.18;
            ctx.fillStyle = "#111827";

            for (let i = 0; i < Math.max(3, block.width / 70); i++) {
                const x =
                    block.x +
                    ((i * 43 + block.y) % Math.max(12, block.width - 12));

                const y =
                    block.y +
                    12 +
                    ((i * 29 + block.x) % Math.max(12, block.height - 24));

                ctx.beginPath();
                ctx.arc(x, y, 4 + (i % 3), 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
            return;
        }

        ctx.save();

        ctx.globalAlpha = 0.16;
        ctx.strokeStyle = "#1e1b4b";
        ctx.lineWidth = 2;

        const step = 48;

        for (let x = block.x + step; x < block.x + block.width; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, block.y + 14);
            ctx.lineTo(x - 20, block.y + block.height - 12);
            ctx.stroke();
        }

        ctx.restore();
    }

    getBlockFillColor(block) {
        const map = {
            chorus: "#6d28d9",
            end_stone_dark: "#78716c",
            stone_brick: "#8b949e",
            solid_dark: "#3f464c",
            solid_blue: "#4b647a",
            solid_green: "#577061",
            dirt: "#795039"
        };

        return map[block.type] || "#a8a29e";
    }

    getBlockTopColor(block) {
        const map = {
            chorus: "#a78bfa",
            end_stone_dark: "#a8a29e",
            stone_brick: "#aeb7c0",
            solid_dark: "#565f66",
            solid_blue: "#617b91",
            solid_green: "#6f8b77",
            dirt: "#956044"
        };

        return map[block.type] || "#d6d3d1";
    }

    getBlockStrokeColor(block) {
        const map = {
            chorus: "#c084fc",
            end_stone_dark: "#44403c",
            stone_brick: "#525b65",
            solid_dark: "#20252b",
            solid_blue: "#263b4f",
            solid_green: "#2f4437",
            dirt: "#4f2d1d"
        };

        return map[block.type] || "#57534e";
    }

    drawSpawnPoints(ctx) {
        for (const point of this.spawnPoints) {
            if (!point.enabled) {
                continue;
            }

            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = point.type === "boss" ? "#facc15" : "#ef4444";

            ctx.beginPath();
            ctx.arc(point.x, point.y - 18, 10, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
    }

    drawWorldBounds(ctx) {
        ctx.fillStyle = "#4c1d95";
        ctx.fillRect(-18, 0, 18, this.worldHeight);
        ctx.fillRect(this.worldWidth, 0, 18, this.worldHeight);
    }

    drawVoidLine(ctx) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#7f1d1d";
        ctx.fillRect(0, this.voidY, this.worldWidth, 6);
        ctx.restore();
    }

    roundRect(ctx, x, y, width, height, radius) {
        const r = Math.max(0, Math.min(radius, width / 2, height / 2));

        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + width - r, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + r);
        ctx.lineTo(x + width, y + height - r);
        ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        ctx.lineTo(x + r, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
}