import { CONFIG } from "./config.js";

export class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;

        this.prevX = x;
        this.prevY = y;

        this.size = CONFIG.player.size;

        this.hitbox = {
            offsetX: 3,
            offsetY: 2,
            width: this.size - 6,
            height: this.size - 2
        };

        this.vx = 0;
        this.vy = 0;

        this.facing = 1;
        this.hp = CONFIG.player.hp;

        this.onGround = false;

        this.maxJumps = 2;
        this.jumpCount = 0;

        this.damageCooldown = 0;
    }

    get centerX() {
        return this.x + this.size / 2;
    }

    get centerY() {
        return this.y + this.size / 2;
    }

    get collisionRect() {
        return {
            x: this.x + this.hitbox.offsetX,
            y: this.y + this.hitbox.offsetY,
            width: this.hitbox.width,
            height: this.hitbox.height
        };
    }

    update(input, canvas, terrain) {
        this.prevX = this.x;
        this.prevY = this.y;

        if (input.isActionDown("left")) {
            this.vx -= CONFIG.player.speed;
            this.facing = -1;
        }

        if (input.isActionDown("right")) {
            this.vx += CONFIG.player.speed;
            this.facing = 1;
        }

        if (input.wasActionPressed("jump")) {
            this.jump();
        }

        this.vx *= CONFIG.friction;

        this.vx = Math.max(
            -CONFIG.player.maxSpeed,
            Math.min(CONFIG.player.maxSpeed, this.vx)
        );

        this.vy += CONFIG.gravity;

        this.x += this.vx;
        terrain.resolveHorizontalCollision(this);

        this.y += this.vy;

        const verticalCollision = terrain.resolveVerticalCollision(this);

        if (verticalCollision === "ground") {
            this.onGround = true;
            this.jumpCount = 0;
        } else {
            this.onGround = false;
        }

        terrain.clampEntityToWorld(this);

        if (this.damageCooldown > 0) {
            this.damageCooldown--;
        }
    }

    jump() {
        if (this.jumpCount >= this.maxJumps) {
            return;
        }

        if (this.jumpCount === 0) {
            this.vy = -CONFIG.player.jumpPower;
        } else {
            this.vy = -CONFIG.player.jumpPower * 0.85;
        }

        this.onGround = false;
        this.jumpCount++;
    }

    takeDamage(amount) {
        if (this.damageCooldown > 0) {
            return;
        }

        this.hp -= amount;
        this.damageCooldown = 28;
    }

    draw(ctx) {
        ctx.fillStyle = this.damageCooldown > 0 ? "#fb7185" : "#22d3ee";
        ctx.fillRect(this.x, this.y, this.size, this.size);

        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.size, this.size);

        ctx.fillStyle = "white";

        const barrelX = this.facing === 1
            ? this.x + this.size
            : this.x - 10;

        const barrelY = this.y + this.size / 2 - 4;

        ctx.fillRect(barrelX, barrelY, 10, 8);
    }
}