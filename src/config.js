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
        hp: 8
    },

    bullet: {
        width: 16,
        height: 6,
        speed: 12,
        damage: 18,
        playerDamage: 1,
        cooldown: 95,
        maxDistance: 520,

        maxAmmo: 16
    },

    shell: {
        size: 14,
        speed: 8.2,
        damage: 30,
        playerDamage: 4,
        radius: 95,
        cooldown: 680,
        knockback: 11,

        maxAmmo: 8
    },

    lazer: {
        width: 6,
        length: 650,
        damage: 42,
        playerDamage: 2,
        cooldown: 520,
        life: 9,
        maxBounces: 6,

        maxAmmo: 24
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
        baseSpeed: 0.9,
        hp: 180,
        hpPerWave: 12,
        shellDamageMultiplier: 0.35
    }
};