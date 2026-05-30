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
        this.aimAngle = 0;
        this.aimFlipY = false;
        this.maxHp = CONFIG.player.hp;
        this.hp = this.maxHp;

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

    takeDamage(amount, options = {}) {
        const useCooldown = options.useCooldown === true;

        if (useCooldown && this.damageCooldown > 0) {
            return false;
        }

        const damage = Math.max(1, Math.ceil(Number(amount) || 1));
        this.hp -= damage;
        this.damageCooldown = 28;
        return true;
    }

    draw(ctx, weaponId = "bullet") {
        ctx.fillStyle = this.damageCooldown > 0 ? "#fb7185" : "#22d3ee";
        ctx.fillRect(this.x, this.y, this.size, this.size);

        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.size, this.size);

        this.drawWeapon(ctx, this.x, this.y, this.facing, weaponId);
    }

    drawWeapon(ctx, x, y, facing, weaponId) {
        const angle = Number.isFinite(this.aimAngle)
            ? this.aimAngle
            : facing === 1 ? 0 : Math.PI;
        const cx = x + this.size / 2;
        const cy = y + this.size / 2;

        ctx.save();
        ctx.translate(cx, cy);
        drawWeaponModel(ctx, this.size, angle, this.aimFlipY, weaponId);
        ctx.restore();
    }
}

export function drawWeaponModel(ctx, playerSize, angle, flipY = false, weaponId = "bullet") {
    ctx.rotate(angle);

    if (flipY) {
        ctx.scale(1, -1);
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (weaponId === "shell") {
        ctx.fillStyle = "#1f2937";
        ctx.fillRect(0, -8, 31, 15);

        ctx.fillStyle = "#64748b";
        ctx.fillRect(5, -11, 22, 21);

        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 3;
        ctx.strokeRect(5, -11, 22, 21);

        ctx.fillStyle = "#fb923c";
        ctx.beginPath();
        ctx.arc(35, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        return;
    }

    if (weaponId === "lazer") {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(1, -5, 34, 10);

        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(35, 0);
        ctx.stroke();

        ctx.fillStyle = "#e0f2fe";
        ctx.beginPath();
        ctx.arc(38, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        return;
    }

    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(2, -2);
    ctx.lineTo(28, -2);
    ctx.stroke();

    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(2, -2);
    ctx.lineTo(28, -2);
    ctx.stroke();

    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(4, 1);
    ctx.lineTo(-2, 13);
    ctx.stroke();

    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.moveTo(37, -2);
    ctx.lineTo(28, -7);
    ctx.lineTo(28, 3);
    ctx.closePath();
    ctx.fill();
}
