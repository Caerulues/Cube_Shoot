const SEASON_PALETTES = {
    spring: {
        top: "#9ed9ff",
        middle: "#f4d7c9",
        bottom: "#ffe9b8",
        sun: "rgba(255, 236, 160, 0.75)",
        hill1: "rgba(112, 171, 106, 0.40)",
        hill2: "rgba(147, 197, 114, 0.34)",
        cloud: "rgba(255, 255, 255, 0.78)"
    },
    summer: {
        top: "#72c7ff",
        middle: "#bce6ff",
        bottom: "#ffe29a",
        sun: "rgba(255, 218, 95, 0.85)",
        hill1: "rgba(74, 163, 96, 0.42)",
        hill2: "rgba(102, 178, 110, 0.35)",
        cloud: "rgba(255, 255, 255, 0.72)"
    },
    autumn: {
        top: "#f0a36f",
        middle: "#f7c28a",
        bottom: "#ffe0b0",
        sun: "rgba(255, 210, 116, 0.82)",
        hill1: "rgba(168, 99, 54, 0.38)",
        hill2: "rgba(202, 138, 66, 0.32)",
        cloud: "rgba(255, 240, 222, 0.68)"
    },
    winter: {
        top: "#bfe8ff",
        middle: "#e5f5ff",
        bottom: "#fff7ec",
        sun: "rgba(255, 240, 190, 0.68)",
        hill1: "rgba(175, 205, 211, 0.40)",
        hill2: "rgba(214, 231, 234, 0.50)",
        cloud: "rgba(255, 255, 255, 0.82)"
    }
};

export function drawSeasonBackground(ctx, canvas, season = "spring", view = {}) {
    const palette = SEASON_PALETTES[season] || SEASON_PALETTES.spring;
    const cameraX = view.cameraX || 0;
    const cameraY = view.cameraY || 0;
    const zoom = view.zoom || 1;

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, palette.top);
    gradient.addColorStop(0.55, palette.middle);
    gradient.addColorStop(1, palette.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawSun(ctx, canvas, palette);
    drawDistantHills(ctx, canvas, palette, cameraX, cameraY, zoom);
    drawCloudLayer(ctx, canvas, palette, cameraX, cameraY, zoom);
}

function drawSun(ctx, canvas, palette) {
    const x = canvas.width * 0.82;
    const y = canvas.height * 0.18;
    const glow = ctx.createRadialGradient(x, y, 12, x, y, 120);
    glow.addColorStop(0, palette.sun);
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 247, 194, 0.8)";
    ctx.beginPath();
    ctx.arc(x, y, 34, 0, Math.PI * 2);
    ctx.fill();
}

function drawDistantHills(ctx, canvas, palette, cameraX, cameraY, zoom) {
    const offset1 = -(cameraX * 0.08 * zoom) % 900;
    const baseY = canvas.height * 0.72 - cameraY * 0.02 * zoom;
    ctx.fillStyle = palette.hill2;
    for (let x = offset1 - 900; x < canvas.width + 900; x += 900) {
        ctx.beginPath();
        ctx.moveTo(x, canvas.height);
        ctx.quadraticCurveTo(x + 220, baseY - 80, x + 460, baseY + 10);
        ctx.quadraticCurveTo(x + 690, baseY - 65, x + 900, baseY + 20);
        ctx.lineTo(x + 900, canvas.height);
        ctx.closePath();
        ctx.fill();
    }

    const offset2 = -(cameraX * 0.14 * zoom) % 760;
    const baseY2 = canvas.height * 0.80 - cameraY * 0.03 * zoom;
    ctx.fillStyle = palette.hill1;
    for (let x = offset2 - 760; x < canvas.width + 760; x += 760) {
        ctx.beginPath();
        ctx.moveTo(x, canvas.height);
        ctx.quadraticCurveTo(x + 180, baseY2 - 70, x + 390, baseY2 + 8);
        ctx.quadraticCurveTo(x + 560, baseY2 - 50, x + 760, baseY2 + 12);
        ctx.lineTo(x + 760, canvas.height);
        ctx.closePath();
        ctx.fill();
    }
}

function drawCloudLayer(ctx, canvas, palette, cameraX, cameraY, zoom) {
    ctx.save();
    ctx.fillStyle = palette.cloud;
    const offset = -(cameraX * 0.18 * zoom) % 520;
    const yOffset = -cameraY * 0.04 * zoom;

    for (let i = -1; i < Math.ceil(canvas.width / 520) + 2; i++) {
        const x = offset + i * 520;
        const y = 110 + ((i * 53) % 120) + yOffset;
        drawSoftCloud(ctx, x, y, 0.85 + (i % 3) * 0.12);
    }

    ctx.restore();
}

function drawSoftCloud(ctx, x, y, scale) {
    ctx.beginPath();
    ctx.ellipse(x, y, 48 * scale, 15 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 38 * scale, y - 10 * scale, 38 * scale, 23 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 82 * scale, y, 58 * scale, 17 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
}
