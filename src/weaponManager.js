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
                regenInterval: CONFIG.bullet.regenInterval,
                lastRegenTime: 0,
                cooldown: CONFIG.bullet.cooldown,
                lastFireTime: -Infinity
            },

            shell: {
                id: "shell",
                name: "Cannon",
                unlocked: false,
                ammo: 0,
                maxAmmo: CONFIG.shell.maxAmmo,
                regenInterval: CONFIG.shell.regenInterval,
                lastRegenTime: 0,
                cooldown: CONFIG.shell.cooldown,
                lastFireTime: -Infinity
            }
        };

        this.autoAmmo = true;
        this.speedshot = false;
        this.infiniteAmmo = false;
    }

    update(timestamp) {
        this.regenerateAmmo(timestamp);
    }

    regenerateAmmo(timestamp) {
        if (this.infiniteAmmo) {
            this.weapons.bullet.ammo = this.weapons.bullet.maxAmmo;

            if (this.weapons.shell.unlocked) {
                this.weapons.shell.ammo = this.weapons.shell.maxAmmo;
            }

            return;
        }

        for (const weapon of Object.values(this.weapons)) {
            if (!weapon.unlocked) {
                continue;
            }

            if (weapon.ammo >= weapon.maxAmmo) {
                continue;
            }

            if (timestamp - weapon.lastRegenTime >= weapon.regenInterval) {
                weapon.ammo++;
                weapon.lastRegenTime = timestamp;
            }
        }
    }

    selectWeaponByNumber(numberKey) {
        if (numberKey === "1") {
            this.selectedWeapon = "bullet";
            return;
        }

        if (numberKey === "2" && this.weapons.shell.unlocked) {
            this.selectedWeapon = "shell";
        }
    }

    unlockWeapon(type) {
        const weapon = this.weapons[type];

        if (!weapon) {
            return false;
        }

        weapon.unlocked = true;

        if (weapon.ammo <= 0) {
            weapon.ammo = Math.ceil(weapon.maxAmmo / 2);
        }

        this.selectedWeapon = type;

        return true;
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