export class InputManager {
    constructor(settings = null) {
        this.settings = settings;
        this.keys = {};
        this.pressed = {};

        this.mouse = {
            x: 0,
            y: 0,
            leftDown: false,
            leftPressed: false
        };

        this.chatOpen = false;
        this.chatText = "";
        this.submittedCommand = null;

        this.registerEvents();
    }

    registerEvents() {
        window.addEventListener("keydown", (event) => {
            if (this.chatOpen) {
                this.handleChatKeydown(event);
                return;
            }

            const key = event.key.toLowerCase();

            if (this.getActionKeys("chat").includes(key)) {
                this.chatOpen = true;
                this.chatText = "/";
                event.preventDefault();
                return;
            }

            if (!this.keys[key]) {
                this.pressed[key] = true;
            }

            this.keys[key] = true;

            const preventKeys = [
                ...this.getActionKeys("left"),
                ...this.getActionKeys("right"),
                ...this.getActionKeys("jump"),
                "arrowup",
                "arrowdown",
                "arrowleft",
                "arrowright",
                " "
            ];

            if (preventKeys.includes(key)) {
                event.preventDefault();
            }
        });

        window.addEventListener("keyup", (event) => {
            this.keys[event.key.toLowerCase()] = false;
        });

        window.addEventListener("mousedown", (event) => {
            if (event.button === 0) {
                if (!this.mouse.leftDown) {
                    this.mouse.leftPressed = true;
                }

                this.mouse.leftDown = true;
            }
        });

        window.addEventListener("mouseup", (event) => {
            if (event.button === 0) {
                this.mouse.leftDown = false;
            }
        });

        window.addEventListener("mousemove", (event) => {
            this.mouse.x = event.clientX;
            this.mouse.y = event.clientY;
        });
    }

    handleChatKeydown(event) {
        if (event.key === "Escape") {
            this.chatOpen = false;
            this.chatText = "";
            event.preventDefault();
            return;
        }

        if (event.key === "Enter") {
            this.submittedCommand = this.chatText.trim();
            this.chatOpen = false;
            this.chatText = "";
            event.preventDefault();
            return;
        }

        if (event.key === "Backspace") {
            this.chatText = this.chatText.slice(0, -1);

            if (this.chatText.length === 0) {
                this.chatText = "/";
            }

            event.preventDefault();
            return;
        }

        if (event.key.length === 1) {
            this.chatText += event.key;
            event.preventDefault();
        }
    }

    getActionKeys(action) {
        return this.settings?.keybinds?.[action] || [];
    }

    isActionDown(action) {
        return this.isDown(...this.getActionKeys(action));
    }

    wasActionPressed(action) {
        return this.wasPressed(...this.getActionKeys(action));
    }

    consumeCommand() {
        const command = this.submittedCommand;
        this.submittedCommand = null;
        return command;
    }

    isDown(...keys) {
        if (this.chatOpen) {
            return false;
        }

        return keys.some((key) => this.keys[key.toLowerCase()]);
    }

    wasPressed(...keys) {
        if (this.chatOpen) {
            return false;
        }

        return keys.some((key) => this.pressed[key.toLowerCase()]);
    }

    wasLeftMousePressed() {
        return this.mouse.leftPressed;
    }

    endFrame() {
        this.pressed = {};
        this.mouse.leftPressed = false;
    }
}
