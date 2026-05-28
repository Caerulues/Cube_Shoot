export const defaultMap = {
            season: "spring",
            worldWidth: 3400,
            worldHeight: 1300,
            voidY: 1180,

            playerStart: {
                x: 180,
                y: 430
            },

            playerSpawnPoints: [
                { id: "mp_spawn_upper_left", x: 180, y: 430, enabled: true },
                { id: "mp_spawn_upper_center", x: 940, y: 390, enabled: true },
                { id: "mp_spawn_upper_right", x: 1860, y: 430, enabled: true },
                { id: "mp_spawn_middle_left", x: 520, y: 650, enabled: true },
                { id: "mp_spawn_middle_center", x: 1280, y: 690, enabled: true },
                { id: "mp_spawn_bottom_center", x: 1560, y: 940, enabled: true }
            ],

            terrainBlocks: [
                // 上层主岛
                {
                    id: "upper_left_main",
                    x: 120,
                    y: 430,
                    width: 520,
                    height: 90,
                    type: "grass"
                },
                {
                    id: "upper_center_main",
                    x: 820,
                    y: 390,
                    width: 620,
                    height: 110,
                    type: "grass"
                },
                {
                    id: "upper_right_main",
                    x: 1720,
                    y: 430,
                    width: 620,
                    height: 90,
                    type: "grass"
                },

                // 上层小浮岛
                {
                    id: "upper_small_1",
                    x: 650,
                    y: 300,
                    width: 180,
                    height: 35,
                    type: "stone_brick"
                },
                {
                    id: "upper_small_2",
                    x: 1480,
                    y: 290,
                    width: 190,
                    height: 35,
                    type: "stone_brick"
                },
                {
                    id: "upper_small_3",
                    x: 2380,
                    y: 320,
                    width: 220,
                    height: 35,
                    type: "stone_brick"
                },

                // 中层平台，玩家可以往下活动
                {
                    id: "middle_left",
                    x: 420,
                    y: 650,
                    width: 480,
                    height: 80,
                    type: "grass"
                },
                {
                    id: "middle_center",
                    x: 1120,
                    y: 690,
                    width: 560,
                    height: 85,
                    type: "grass"
                },
                {
                    id: "middle_right",
                    x: 1940,
                    y: 660,
                    width: 520,
                    height: 80,
                    type: "grass"
                },

                // 中层小浮岛
                {
                    id: "middle_small_1",
                    x: 920,
                    y: 560,
                    width: 150,
                    height: 30,
                    type: "solid_dark"
                },
                {
                    id: "middle_small_2",
                    x: 1690,
                    y: 550,
                    width: 150,
                    height: 30,
                    type: "solid_dark"
                },

                // 下层区域
                {
                    id: "lower_left",
                    x: 180,
                    y: 880,
                    width: 560,
                    height: 90,
                    type: "stone_brick"
                },
                {
                    id: "lower_center",
                    x: 1030,
                    y: 930,
                    width: 680,
                    height: 95,
                    type: "stone_brick"
                },
                {
                    id: "lower_right",
                    x: 2180,
                    y: 890,
                    width: 620,
                    height: 90,
                    type: "end_stone_dark"
                },

                // 最下方少量安全落点，下面再掉才进入虚空
                {
                    id: "bottom_safe_1",
                    x: 780,
                    y: 1080,
                    width: 260,
                    height: 35,
                    type: "solid_dark"
                },
                {
                    id: "bottom_safe_2",
                    x: 1740,
                    y: 1070,
                    width: 280,
                    height: 35,
                    type: "solid_dark"
                }
            ],

            spawnPoints: [
                {
                    id: "spawn_upper_left",
                    x: 460,
                    y: 430,
                    type: "normal",
                    enabled: true
                },
                {
                    id: "spawn_upper_center",
                    x: 1180,
                    y: 390,
                    type: "normal",
                    enabled: true
                },
                {
                    id: "spawn_upper_right",
                    x: 2060,
                    y: 430,
                    type: "normal",
                    enabled: true
                },
                {
                    id: "spawn_middle_left",
                    x: 650,
                    y: 650,
                    type: "normal",
                    enabled: true
                },
                {
                    id: "spawn_middle_center",
                    x: 1420,
                    y: 690,
                    type: "normal",
                    enabled: true
                },
                {
                    id: "spawn_middle_right",
                    x: 2240,
                    y: 660,
                    type: "normal",
                    enabled: true
                },
                {
                    id: "spawn_boss_upper_center",
                    x: 1180,
                    y: 390,
                    type: "boss",
                    enabled: true
                }
            ],

            backgroundObjects: [
                { id: "bg_cloud_1", type: "cloud", x: 250, y: 260, scale: 1.15, alpha: 0.82 },
                { id: "bg_cloud_2", type: "cloud", x: 1420, y: 225, scale: 0.9, alpha: 0.72 },
                { id: "bg_fence_1", type: "fence", x: 2460, y: 430, width: 160, height: 250, postGap: 42, alpha: 0.55 },
                { id: "bg_lantern_1", type: "lantern", x: 2870, y: 430, alpha: 0.95 },
                { id: "bg_dripstone_1", type: "dripstone", x: 670, y: 520, width: 36, height: 115, alpha: 0.45 },
                { id: "bg_dripstone_2", type: "dripstone", x: 1710, y: 500, width: 34, height: 105, alpha: 0.42 }
            ],

            pickups: [
                {
                    id: "pickup_shell_weapon_1",
                    x: 1480,
                    y: 250,
                    width: 28,
                    height: 28,
                    type: "weapon",
                    weapon: "shell",
                    enabled: true
                },
                {
                    id: "pickup_shell_ammo_1",
                    x: 920,
                    y: 530,
                    width: 24,
                    height: 24,
                    type: "ammo",
                    weapon: "shell",
                    amount: 4,
                    enabled: true
                },
                {
                    id: "pickup_bullet_ammo_1",
                    x: 2060,
                    y: 620,
                    width: 24,
                    height: 24,
                    type: "ammo",
                    weapon: "bullet",
                    amount: 30,
                    enabled: true
                },
                {
                    id: "pickup_health_1",
                    x: 650,
                    y: 260,
                    width: 28,
                    height: 28,
                    type: "health",
                    amount: 25,
                    enabled: true
                },
                {
                    id: "pickup_health_2",
                    x: 2320,
                    y: 850,
                    width: 28,
                    height: 28,
                    type: "health",
                    amount: 25,
                    enabled: true
                }
            ]
        };
