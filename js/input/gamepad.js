// Gamepad (controller) input

// Gamepad handling
function handleGamepad() {
    // Handle Controller 1 (HOME team)
    if (gamepadConnected1 && gamepadIndex1 !== null) {
        const gamepad = navigator.getGamepads()[gamepadIndex1];
        if (gamepad) {
            handleGamepadInput(gamepad, 'HOME');
        }
    }

    // Handle Controller 2 (AWAY team) - only in PvP mode
    if (gameMode === 'PvP' && gamepadConnected2 && gamepadIndex2 !== null) {
        const gamepad = navigator.getGamepads()[gamepadIndex2];
        if (gamepad) {
            handleGamepadInput(gamepad, 'AWAY');
        }
    }
}

function handleGamepadInput(gamepad, team) {
    // Deadzone for analog sticks
    const deadzone = 0.2;

    // Left stick for movement
    const leftStickX = gamepad.axes[0];
    const leftStickY = gamepad.axes[1];

    if (team === 'HOME') {
        // Map left stick to gamepad1Input for HOME
        if (Math.abs(leftStickX) > deadzone) {
            if (leftStickX > 0) {
                gamepad1Input.right = true;
                gamepad1Input.left = false;
            } else {
                gamepad1Input.left = true;
                gamepad1Input.right = false;
            }
        } else {
            gamepad1Input.left = false;
            gamepad1Input.right = false;
        }

        if (Math.abs(leftStickY) > deadzone) {
            if (leftStickY > 0) {
                gamepad1Input.down = true;
                gamepad1Input.up = false;
            } else {
                gamepad1Input.up = true;
                gamepad1Input.down = false;
            }
        } else {
            gamepad1Input.up = false;
            gamepad1Input.down = false;
        }

        // Button mapping for HOME (action buttons edge-triggered)
        const p1b0 = gamepad.buttons[0]?.pressed ?? false;
        const p1b1 = gamepad.buttons[1]?.pressed ?? false;
        const p1b2 = gamepad.buttons[2]?.pressed ?? false;
        const p1b3 = gamepad.buttons[3]?.pressed ?? false;
        gamepad1Input.x = p1b0 && !gamepadPrev1.x;
        gamepad1Input.d = p1b1 && !gamepadPrev1.d;
        gamepad1Input.a = p1b2 && !gamepadPrev1.a;
        gamepad1Input.q = p1b3 && !gamepadPrev1.q;
        gamepadPrev1.x = p1b0;
        gamepadPrev1.d = p1b1;
        gamepadPrev1.a = p1b2;
        gamepadPrev1.q = p1b3;
        // Sprint stays level-triggered (held)
        gamepad1Input.e = gamepad.buttons[4]?.pressed ?? false;
        gamepad1Input.r = gamepad.buttons[9]?.pressed ?? false;
    } else {
        // Map left stick to gamepad2Input for AWAY (PvP mode)
        if (Math.abs(leftStickX) > deadzone) {
            if (leftStickX > 0) {
                gamepad2Input.right = true;
                gamepad2Input.left = false;
            } else {
                gamepad2Input.left = true;
                gamepad2Input.right = false;
            }
        } else {
            gamepad2Input.left = false;
            gamepad2Input.right = false;
        }

        if (Math.abs(leftStickY) > deadzone) {
            if (leftStickY > 0) {
                gamepad2Input.down = true;
                gamepad2Input.up = false;
            } else {
                gamepad2Input.up = true;
                gamepad2Input.down = false;
            }
        } else {
            gamepad2Input.up = false;
            gamepad2Input.down = false;
        }

        // Button mapping for AWAY (PvP mode) - action buttons edge-triggered
        const p2b0 = gamepad.buttons[0]?.pressed ?? false;
        const p2b1 = gamepad.buttons[1]?.pressed ?? false;
        const p2b2 = gamepad.buttons[2]?.pressed ?? false;
        const p2b3 = gamepad.buttons[3]?.pressed ?? false;
        gamepad2Input.i = p2b0 && !gamepadPrev2.i;
        gamepad2Input.k = p2b1 && !gamepadPrev2.k;
        gamepad2Input.j = p2b2 && !gamepadPrev2.j;
        gamepad2Input.u = p2b3 && !gamepadPrev2.u;
        gamepadPrev2.i = p2b0;
        gamepadPrev2.k = p2b1;
        gamepadPrev2.j = p2b2;
        gamepadPrev2.u = p2b3;
        // Sprint stays level-triggered (held)
        gamepad2Input.l = gamepad.buttons[4]?.pressed ?? false;
        gamepad2Input.r = gamepad.buttons[9]?.pressed ?? false;
    }
}
