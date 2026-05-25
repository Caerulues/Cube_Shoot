import { CONFIG } from "./config.js";

export class Bullet {
    constructor(x, y, direction) {
        this.x = x;
        this.y = y;
        this.startX = x;

        this.vx = direction * CONFIG.bullet.speed;

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

        const distance = Math.abs(this.x - this.startX);

        if (distance >= this.maxDistance) {
            this.active = false;
            return;
        }

        if (terrain.isRectCollidingWithTerrain(this.rect)) {
            this.active = false;
        }
    }

    draw(ctx) {
        ctx.fillStyle = "#facc15";
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

export class Shell {
    constructor(x, y, direction) {
        this.x = x;
        this.y = y;

        this.prevX = x;
        this.prevY = y;

        this.vx = direction * CONFIG.shell.speed;
        this.vy = -CONFIG.shell.jumpPower;

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