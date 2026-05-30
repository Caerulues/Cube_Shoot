import { CONFIG } from "./config.js";

function normalizeAim(aim, fallbackDirection = 1) {
    const x = Number(aim?.x ?? fallbackDirection);
    const y = Number(aim?.y ?? 0);
    const length = Math.hypot(x, y) || 1;

    return {
        x: x / length,
        y: y / length
    };
}

export class Bullet {
    constructor(x, y, aim) {
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;

        this.aim = normalizeAim(aim, typeof aim === "number" ? aim : 1);
        this.vx = this.aim.x * CONFIG.bullet.speed;
        this.vy = this.aim.y * CONFIG.bullet.speed;

        this.width = CONFIG.bullet.width;
        this.height = CONFIG.bullet.height;

        this.damage = CONFIG.bullet.damage;
        this.maxDistance = CONFIG.bullet.maxDistance;

        this.active = true;
    }

    get rect() {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    }

    update(terrain) {
        this.x += this.vx;
        this.y += this.vy;

        const distance = Math.hypot(this.x - this.startX, this.y - this.startY);

        if (distance >= this.maxDistance) {
            this.active = false;
            return;
        }

        if (terrain.isRectCollidingWithTerrain(this.rect)) {
            this.active = false;
        }
    }

    draw(ctx) {
        const angle = Math.atan2(this.aim.y, this.aim.x);

        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
        ctx.rotate(angle);
        ctx.fillStyle = "#facc15";
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        ctx.restore();
    }
}

export class Shell {
    constructor(x, y, aim) {
        this.x = x;
        this.y = y;

        this.prevX = x;
        this.prevY = y;

        this.aim = normalizeAim(aim, typeof aim === "number" ? aim : 1);
        this.vx = this.aim.x * CONFIG.shell.speed;
        this.vy = this.aim.y * CONFIG.shell.speed;

        this.size = CONFIG.shell.size;

        this.damage = CONFIG.shell.damage;
        this.radius = CONFIG.shell.radius;

        this.active = true;
        this.shouldExplode = false;
    }

    get centerX() {
        return this.x + this.size / 2;
    }

    get centerY() {
        return this.y + this.size / 2;
    }

    get rect() {
        return {
            x: this.x,
            y: this.y,
            width: this.size,
            height: this.size
        };
    }

    update(terrain) {
        this.prevX = this.x;
        this.prevY = this.y;

        this.vy += CONFIG.gravity * 0.55;

        this.x += this.vx;
        this.y += this.vy;

        if (terrain.isRectCollidingWithTerrain(this.rect)) {
            this.x = this.prevX;
            this.y = this.prevY;
            this.active = false;
            this.shouldExplode = true;
            return;
        }

        if (this.y > terrain.voidY) {
            this.active = false;
            this.shouldExplode = false;
        }
    }

    draw(ctx) {
        ctx.fillStyle = "#fb923c";
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.size / 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#fed7aa";
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

export class Lazer {
    constructor(x, y, aim) {
        this.x = x;
        this.y = y;
        this.aim = normalizeAim(aim, typeof aim === "number" ? aim : 1);
        this.length = CONFIG.lazer.length;
        this.width = CONFIG.lazer.width;
        this.damage = CONFIG.lazer.damage;
        this.life = CONFIG.lazer.life;
        this.maxBounces = CONFIG.lazer.maxBounces ?? 1;
        this.active = true;
        this.hitIds = new Set();
        this.segments = [];
    }

    get endX() {
        const last = this.segments[this.segments.length - 1];
        return last ? last.x2 : this.x + this.aim.x * this.length;
    }

    get endY() {
        const last = this.segments[this.segments.length - 1];
        return last ? last.y2 : this.y + this.aim.y * this.length;
    }

    update(terrain) {
        if (!this.traced) {
            this.traceBeam(terrain);
            this.traced = true;
        }

        this.life--;
        if (this.life <= 0) {
            this.active = false;
        }
    }

    traceBeam(terrain) {
        this.segments = [];

        let startX = this.x;
        let startY = this.y;
        let dirX = this.aim.x;
        let dirY = this.aim.y;
        let remaining = this.length;
        let bounces = 0;

        while (remaining > 0.1 && bounces <= this.maxBounces) {
            const hit = this.findTerrainHit(terrain, startX, startY, dirX, dirY, remaining);

            if (!hit) {
                this.segments.push({
                    x1: startX,
                    y1: startY,
                    x2: startX + dirX * remaining,
                    y2: startY + dirY * remaining
                });
                break;
            }

            this.segments.push({
                x1: startX,
                y1: startY,
                x2: hit.x,
                y2: hit.y
            });

            if (bounces >= this.maxBounces) {
                break;
            }

            const dot = dirX * hit.normalX + dirY * hit.normalY;
            dirX = dirX - 2 * dot * hit.normalX;
            dirY = dirY - 2 * dot * hit.normalY;

            const length = Math.hypot(dirX, dirY) || 1;
            dirX /= length;
            dirY /= length;

            remaining -= hit.distance;
            startX = hit.x + dirX * 2;
            startY = hit.y + dirY * 2;
            bounces++;
        }
    }

    findTerrainHit(terrain, startX, startY, dirX, dirY, maxDistance) {
        const step = 8;
        let previousX = startX;
        let previousY = startY;

        for (let distance = step; distance <= maxDistance; distance += step) {
            const x = startX + dirX * distance;
            const y = startY + dirY * distance;
            const probe = {
                x: x - this.width / 2,
                y: y - this.width / 2,
                width: this.width,
                height: this.width
            };

            if (!terrain.isRectCollidingWithTerrain(probe)) {
                previousX = x;
                previousY = y;
                continue;
            }

            const normal = this.estimateSurfaceNormal(terrain, previousX, previousY, x, y);
            return {
                x: previousX,
                y: previousY,
                distance: Math.max(0, distance - step),
                normalX: normal.x,
                normalY: normal.y
            };
        }

        return null;
    }

    estimateSurfaceNormal(terrain, clearX, clearY, hitX, hitY) {
        const horizontalProbe = {
            x: hitX - this.width / 2,
            y: clearY - this.width / 2,
            width: this.width,
            height: this.width
        };
        const verticalProbe = {
            x: clearX - this.width / 2,
            y: hitY - this.width / 2,
            width: this.width,
            height: this.width
        };

        const horizontalBlocked = terrain.isRectCollidingWithTerrain(horizontalProbe);
        const verticalBlocked = terrain.isRectCollidingWithTerrain(verticalProbe);

        if (horizontalBlocked && !verticalBlocked) {
            return { x: hitX > clearX ? -1 : 1, y: 0 };
        }

        if (verticalBlocked && !horizontalBlocked) {
            return { x: 0, y: hitY > clearY ? -1 : 1 };
        }

        return Math.abs(hitX - clearX) > Math.abs(hitY - clearY)
            ? { x: hitX > clearX ? -1 : 1, y: 0 }
            : { x: 0, y: hitY > clearY ? -1 : 1 };
    }

    draw(ctx) {
        ctx.save();
        ctx.lineCap = "round";

        for (const segment of this.segments.length ? this.segments : [{ x1: this.x, y1: this.y, x2: this.endX, y2: this.endY }]) {
            ctx.strokeStyle = "rgba(14, 165, 233, 0.25)";
            ctx.lineWidth = this.width * 2.8;
            ctx.beginPath();
            ctx.moveTo(segment.x1, segment.y1);
            ctx.lineTo(segment.x2, segment.y2);
            ctx.stroke();

            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = this.width;
            ctx.beginPath();
            ctx.moveTo(segment.x1, segment.y1);
            ctx.lineTo(segment.x2, segment.y2);
            ctx.stroke();

            ctx.strokeStyle = "#e0f2fe";
            ctx.lineWidth = Math.max(1, this.width * 0.32);
            ctx.beginPath();
            ctx.moveTo(segment.x1, segment.y1);
            ctx.lineTo(segment.x2, segment.y2);
            ctx.stroke();
        }

        ctx.restore();
    }
}
