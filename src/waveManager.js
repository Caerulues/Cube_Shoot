import { Enemy } from "./enemy.js";

export class WaveManager {
    constructor(canvas, terrain) {
        this.canvas = canvas;
        this.terrain = terrain;

        this.wave = 0;

        this.enemiesToSpawn = 0;
        this.spawnedInWave = 0;
        this.currentWaveTotal = 0;

        this.spawnDelay = 900;
        this.lastSpawnTime = 0;

        this.inBreak = true;

        this.breakDuration = 10000;
        this.breakEndTime = 8000;

        this.bossEvery = 5;
    }

    get isBossWave() {
        return this.wave > 0 && this.wave % this.bossEvery === 0;
    }

    update(timestamp, enemies) {
        if (this.inBreak) {
            if (timestamp >= this.breakEndTime) {
                this.startNextWave(timestamp);
            }

            return;
        }

        if (this.spawnedInWave >= this.enemiesToSpawn) {
            if (enemies.length === 0) {
                this.inBreak = true;
                this.breakEndTime = timestamp + this.breakDuration;
            }

            return;
        }

        if (timestamp - this.lastSpawnTime >= this.spawnDelay) {
            enemies.push(this.createEnemyForCurrentWave());
            this.spawnedInWave++;
            this.lastSpawnTime = timestamp;
        }
    }

    startNextWave(timestamp) {
        this.wave++;
        this.inBreak = false;
        this.spawnedInWave = 0;

        if (this.isBossWave) {
            this.enemiesToSpawn = 1;
            this.spawnDelay = 1200;
        } else {
            this.enemiesToSpawn = 4 + this.wave * 2;
            this.spawnDelay = Math.max(280, 900 - this.wave * 45);
        }

        this.currentWaveTotal = this.enemiesToSpawn;
        this.lastSpawnTime = timestamp - this.spawnDelay;
    }

    createEnemyForCurrentWave() {
        if (this.isBossWave) {
            const bossSpawn = this.terrain.getRandomSpawnPoint("boss");
            return Enemy.createBoss(bossSpawn, this.wave);
        }

        const normalSpawn = this.terrain.getRandomSpawnPoint("normal");
        return Enemy.createNormal(normalSpawn, this.wave);
    }

    getBreakSecondsLeft(timestamp) {
        if (!this.inBreak) {
            return 0;
        }

        return Math.max(0, Math.ceil((this.breakEndTime - timestamp) / 1000));
    }

    getRemainingEnemyCount(activeEnemies) {
        const unspawned = Math.max(0, this.enemiesToSpawn - this.spawnedInWave);
        return activeEnemies.length + unspawned;
    }

    getTotalEnemyCount() {
        return this.currentWaveTotal;
    }

    getStatusText() {
        if (this.inBreak) {
            return "Preparing";
        }

        if (this.isBossWave) {
            return `Boss Wave ${this.wave}`;
        }

        return `Wave ${this.wave}`;
    }
}