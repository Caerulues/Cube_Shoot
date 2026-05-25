export const CONFIG = {
    canvasWidth: 960,
    canvasHeight: 540,

    gravity: 0.75,
    friction: 0.82,

    voidY: 720,

    player: {
        size: 34,
        speed: 0.85,
        maxSpeed: 5.2,
        jumpPower: 15,
        hp: 100
    },

    bullet: {
        width: 16,
        height: 6,
        speed: 12,
        damage: 1,
        cooldown: 95,
        maxDistance: 520,

        maxAmmo: 100,
        regenInterval: 850
    },

    shell: {
        size: 14,
        speed: 5.8,
        jumpPower: 4.8,
        damage: 3,
        radius: 95,
        cooldown: 680,
        knockback: 11,

        maxAmmo: 12,
        regenInterval: 3200
    },

    autoFire: {
        normalMultiplier: 1,
        speedshotMultiplier: 0.55
    },

    enemy: {
        size: 30,
        baseSpeed: 1.2
    },

    boss: {
        size: 72,
        baseSpeed: 0.9
    }
};