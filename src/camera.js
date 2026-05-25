export class Camera {
    constructor(canvas, worldWidth, worldHeight) {
        this.canvas = canvas;

        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;

        this.x = 0;
        this.y = 0;

        this.freeSpeed = 12;
    }

    update(target, input, freeCamera) {
        if (freeCamera) {
            this.updateFreeCamera(input);
        } else {
            this.updateFollowCamera(target);
        }

        this.clamp();
    }

    updateFollowCamera(target) {
        const targetX = target.centerX - this.canvas.width / 2;
        const targetY = target.centerY - this.canvas.height / 2;

        this.x += (targetX - this.x) * 0.12;
        this.y += (targetY - this.y) * 0.12;
    }

    updateFreeCamera(input) {
        if (input.isActionDown("left")) {
            this.x -= this.freeSpeed;
        }

        if (input.isActionDown("right")) {
            this.x += this.freeSpeed;
        }

        if (input.isDown("w", "arrowup")) {
            this.y -= this.freeSpeed;
        }

        if (input.isDown("s", "arrowdown")) {
            this.y += this.freeSpeed;
        }
    }

    snapToTarget(target) {
        this.x = target.centerX - this.canvas.width / 2;
        this.y = target.centerY - this.canvas.height / 2;
        this.clamp();
    }

    clamp() {
        this.x = Math.max(
            0,
            Math.min(this.worldWidth - this.canvas.width, this.x)
        );

        this.y = Math.max(
            0,
            Math.min(this.worldHeight - this.canvas.height, this.y)
        );
    }

    apply(ctx) {
        ctx.save();
        ctx.translate(-this.x, -this.y);
    }

    restore(ctx) {
        ctx.restore();
    }
}