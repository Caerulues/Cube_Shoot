import { CONFIG } from "./config.js";

export class WeaponManager {
    constructor() {
        this.selectedWeapon = "bullet";

        this.weapons = {
            bullet: {
                id: "bullet",
                name: "Bullet",
                unlocked: true,
                ammo: CONFIG.bullet.maxAmmo,
                maxAmmo: CONFIG.bullet.maxAmmo,
                cooldown: CONFIG.bullet.cooldown,
                lastFireTime: -Infinity
            },

            shell: {
                id: "shell",
                name: "Cannon",
                unlocked: false,
                ammo: 0,
                maxAmmo: CONFIG.shell.maxAmmo,
                cooldown: CONFIG.shell.cooldown,
                lastFireTime: -Infinity
            },

            lazer: {
                id: "lazer",
                name: "Lazer",
                unlocked: false,
                ammo: 0,
                maxAmmo: CONFIG.lazer.maxAmmo,
                cooldown: CONFIG.lazer.cooldown,
                lastFireTime: -Infinity
            }
        };

        this.autoAmmo = false;
        this.speedshot = false;
        this.infiniteAmmo = false;
    }

    update(timestamp) {
        if (!this.infiniteAmmo) {
            return;
        }

        this.weapons.bullet.ammo = this.weapons.bullet.maxAmmo;

        if (this.weapons.shell.unlocked) {
            this.weapons.shell.ammo = this.weapons.shell.maxAmmo;
        }

        if (this.weapons.lazer.unlocked) {
            this.weapons.lazer.ammo = this.weapons.lazer.maxAmmo;
        }
    }

    selectWeaponByNumber(numberKey) {
        if (numberKey === "1") {
            this.selectedWeapon = "bullet";
            return;
        }

        if (numberKey === "2" && this.weapons.shell.unlocked) {
            this.selectedWeapon = "shell";
            return;
        }

        if (numberKey === "3" && this.weapons.lazer.unlocked) {
            this.selectedWeapon = "lazer";
        }
    }

    unlockWeapon(type) {
        const weapon = this.weapons[type];

        if (!weapon) {
            return false;
        }

        weapon.unlocked = true;
        weapon.ammo = weapon.maxAmmo;

        this.selectedWeapon = type;

        return true;
    }

    unlockAllWeapons({ fullAmmo = true, select = null } = {}) {
        for (const weapon of Object.values(this.weapons)) {
            weapon.unlocked = true;

            if (fullAmmo) {
                weapon.ammo = weapon.maxAmmo;
            }
        }

        if (select && this.weapons[select]) {
            this.selectedWeapon = select;
        }
    }

    setInfiniteAmmo(enabled) {
        this.infiniteAmmo = Boolean(enabled);

        if (this.infiniteAmmo) {
            this.update(performance.now());
        }
    }

    addAmmo(type, amount) {
        const weapon = this.weapons[type];

        if (!weapon) {
            return false;
        }

        weapon.ammo = Math.min(weapon.maxAmmo, weapon.ammo + amount);
        return true;
    }

    getSelectedWeapon() {
        return this.weapons[this.selectedWeapon];
    }

    canFire(timestamp) {
        const weapon = this.getSelectedWeapon();

        if (!weapon || !weapon.unlocked) {
            return false;
        }

        const cooldown = this.getCurrentCooldown(weapon);

        if (timestamp - weapon.lastFireTime < cooldown) {
            return false;
        }

        if (!this.infiniteAmmo && weapon.ammo <= 0) {
            return false;
        }

        return true;
    }

    consumeFire(timestamp) {
        const weapon = this.getSelectedWeapon();

        if (!weapon) {
            return false;
        }

        weapon.lastFireTime = timestamp;

        if (!this.infiniteAmmo) {
            weapon.ammo--;
        }

        return true;
    }

    getCurrentCooldown(weapon) {
        const multiplier = this.speedshot
            ? CONFIG.autoFire.speedshotMultiplier
            : CONFIG.autoFire.normalMultiplier;

        return weapon.cooldown * multiplier;
    }

    toggleAutoAmmo() {
        this.autoAmmo = !this.autoAmmo;
        return this.autoAmmo;
    }

    toggleSpeedshot() {
        this.speedshot = !this.speedshot;
        return this.speedshot;
    }

    toggleInfiniteAmmo() {
        this.infiniteAmmo = !this.infiniteAmmo;
        return this.infiniteAmmo;
    }
}