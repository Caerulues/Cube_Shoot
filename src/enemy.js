import { CONFIG } from "./config.js";

export class Enemy {
    constructor(options) {
        this.x = options.x;
        this.y = options.y;

        this.prevX = options.x;
        this.prevY = options.y;

        this.isBoss = Boolean(options.isBoss);

        this.size = options.size;

        this.hitbox = {
            offsetX: this.isBoss ? 6 : 3,
            offsetY: this.isBoss ? 4 : 2,
            width: this.isBoss ? this.size - 12 : this.size - 6,
            height: this.isBoss ? this.size - 4 : this.size - 2
        };

        this.vx = 0;
        this.vy = 0;

        this.speed = options.speed;

        this.maxHp = options.hp;
        this.hp = options.hp;

        this.damage = options.damage;

        this.canJump = options.canJump;
        this.jumpCooldown = Math.random() * 120;

        this.onGround = false;

        this.visionRange = options.visionRange;
        this.canSeePlayer = false;

        this.patrolDirection = Math.random() < 0.5 ? -1 : 1;
        this.patrolChangeTimer = 80 + Math.random() * 120;
    }

    static createNormal(spawnPoint, wave) {
        const hp = 10 + Math.floor(wave / 2);
        const speed = CONFIG.enemy.baseSpeed + wave * 0.08;
        const canJump = 1;

        return new Enemy({
            x: spawnPoint.x,
            y: spawnPoint.y - CONFIG.enemy.size,
            size: CONFIG.enemy.size,
            speed,
            hp,
            damage: 7 + Math.floor(wave / 3),
            canJump,
            isBoss: false,
            visionRange: 430 + wave * 12
        });
    }

    static createBoss(spawnPoint, wave) {
        const size = CONFIG.boss.size;

        return new Enemy({
            x: spawnPoint.x,
            y: spawnPoint.y - size,
            size,
            speed: CONFIG.boss.baseSpeed + wave * 0.02,
            hp: 36 + wave * 1.2,
            damage: 12 + Math.floor(wave / 3),
            canJump: false,
            isBoss: true,
            visionRange: 650
        });
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

    update(player, terrain) {
        this.prevX = this.x;
        this.prevY = this.y;

        this.updateVision(player, terrain);

        if (this.canSeePlayer) {
            this.updateChaseMovement(player);
        } else {
            this.updatePatrolMovement(terrain);
        }

        this.vx *= 0.88;
        this.vy += CONFIG.gravity;

        this.updateJump(player);

        this.x += this.vx;
        terrain.resolveHorizontalCollision(this);

        this.y += this.vy;

        const verticalCollision = terrain.resolveVerticalCollision(this);

        if (verticalCollision === "ground") {
            this.onGround = true;
        } else {
            this.onGround = false;
        }

        terrain.clampEntityToWorld(this);
    }

    updateVision(player, terrain) {
        const dx = player.centerX - this.centerX;
        const dy = player.centerY - this.centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > this.visionRange) {
            this.canSeePlayer = false;
            return;
        }

        this.canSeePlayer = terrain.hasLineOfSight(
            this.centerX,
            this.centerY,
            player.centerX,
            player.centerY
        );
    }

    updateChaseMovement(player) {
        const direction = player.centerX < this.centerX ? -1 : 1;

        this.vx += direction * this.speed * 0.18;

        const maxMoveSpeed = this.speed;

        this.vx = Math.max(
            -maxMoveSpeed - 8,
            Math.min(maxMoveSpeed + 8, this.vx)
        );
    }

    updatePatrolMovement(terrain) {
        this.patrolChangeTimer--;

        if (this.patrolChangeTimer <= 0) {
            this.patrolDirection = Math.random() < 0.5 ? -1 : 1;
            this.patrolChangeTimer = 80 + Math.random() * 160;
        }

        const hasGroundAhead = terrain.hasGroundAhead(this, this.patrolDirection);
        const hasWallAhead = terrain.hasWallAhead(this, this.patrolDirection);

        if (!hasGroundAhead || hasWallAhead) {
            this.patrolDirection *= -1;
            this.patrolChangeTimer = 60 + Math.random() * 80;
        }

        this.vx += this.patrolDirection * this.speed * 0.08;

        const patrolMaxSpeed = this.speed * 0.85;

        this.vx = Math.max(
            -patrolMaxSpeed,
            Math.min(patrolMaxSpeed, this.vx)
        );
    }

    updateJump(player) {
        if (!this.canJump) {
            return;
        }

        this.jumpCooldown--;

        const playerIsAbove = player.y + player.size < this.y;
        const closeToPlayer = Math.abs(player.centerX - this.centerX) < 170;

        if (
            this.onGround &&
            this.jumpCooldown <= 0 &&
            this.canSeePlayer &&
            (playerIsAbove || closeToPlayer) &&
            !this.isBoss
        ) {
            this.vy = -16;
            this.onGround = false;
            this.jumpCooldown = 110 + Math.random() * 70;
        }
    }

    takeDamage(amount, knockback = 0, sourceX = this.centerX) {
        this.hp -= amount;

        if (knockback > 0) {
            const direction = this.centerX < sourceX ? -1 : 1;
            const finalKnockback = this.isBoss ? knockback * 0.35 : knockback;

            this.vx += direction * finalKnockback;

            if (this.onGround && !this.isBoss) {
                this.vy = -4;
                this.onGround = false;
            }
        }
    }

    getHealthColor() {
        const ratio = Math.max(0, Math.min(1, this.hp / this.maxHp));

        const minRed = 90;
        const maxRed = 255;

        const minGreen = 0;
        const maxGreen = 200;

        const minBlue = 0;
        const maxBlue = 200;

        const r = Math.round(maxRed - ratio * (maxRed - minRed));
        const g = Math.round(maxGreen - ratio * (maxGreen - minGreen));
        const b = Math.round(maxBlue - ratio * (maxBlue - minBlue));

        return this.rgbToHex(r, g, b);
    }

    rgbToHex(r, g, b) {
        const toHex = (value) => {
            return value.toString(16).padStart(2, "0");
        };

        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    draw(ctx) {
        ctx.fillStyle = this.getHealthColor();
        ctx.fillRect(this.x, this.y, this.size, this.size);

        ctx.strokeStyle = this.isBoss ? "#facc15" : "#fee2e2";
        ctx.lineWidth = this.isBoss ? 4 : 2;
        ctx.strokeRect(this.x, this.y, this.size, this.size);
    }
}