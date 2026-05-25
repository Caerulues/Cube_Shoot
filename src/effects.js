export class Explosion {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.life = 28;
        this.maxLife = 28;
    }
    get done() { return this.life <= 0; }
    update() { this.life--; }
    draw(ctx) {
        const progress = 1 - this.life / this.maxLife;
        const currentRadius = this.radius * progress;
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillStyle = "#fb923c";
        ctx.beginPath();
        ctx.arc(this.x, this.y, currentRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife) * 0.7;
        ctx.strokeStyle = "#fed7aa";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(this.x, this.y, currentRadius * 0.72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillStyle = "#fef3c7";
        for (let i = 0; i < 10; i++) {
            const angle = (Math.PI * 2 * i) / 10;
            const distance = currentRadius * 0.85;
            ctx.fillRect(this.x + Math.cos(angle) * distance, this.y + Math.sin(angle) * distance, 6, 6);
        }
        ctx.restore();
    }
}
