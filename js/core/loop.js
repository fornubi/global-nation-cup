// Main game loop & per-frame update

function gameLoop() {
    if (gameState !== 'PLAYING') return;

    update();
    render();
    updatePlayerInfo();

    requestAnimationFrame(gameLoop);
}

function update() {
    // Handle gamepad input
    handleGamepad();

    // Replay mode - skip normal update
    if (replayMode) {
        updateReplay();
        return;
    }

    // Record frame for replay (only during normal gameplay)
    if (replayRecording && !kickoffActive && !ballOutActive) {
        recordFrame();
    }

    // Global input processing
    if ((keys['KeyQ'] || gamepad1Input.q) && gameState === 'PLAYING') {
        if (!ball.owner || ball.owner.team !== 'HOME') {
            Player.switchPlayerGlobal();
            // showMessage(`Player #${homePlayers[controlledIndex].number}`);
        } else {
            // showMessage("Can't switch with ball!");
        }
        keys['KeyQ'] = false;
        gamepad1Input.q = false;
        keys['KeyQ'] = false;  // debounce
    }

    // Player 2 switch (PvP mode only)
    if ((keys['KeyU'] || gamepad2Input.u) && gameState === 'PLAYING' && gameMode === 'PvP') {
        if (!ball.owner || ball.owner.team !== 'AWAY') {
            Player.switchPlayerGlobalAway();
        }
        keys['KeyU'] = false;
        gamepad2Input.u = false;
    }

    // Update ball
    ball.update();

    // Update players
    players.forEach(p => p.update());

    // Update camera to follow ball
    const targetCamX = ball.x - CANVAS_WIDTH / 2;
    const targetCamY = ball.y - CANVAS_HEIGHT / 2;

    // Smooth camera follow
    camera.x += (targetCamX - camera.x) * 0.1;
    camera.y += (targetCamY - camera.y) * 0.1;

    // Clamp camera to field bounds (only clamp if field is larger than canvas)
    const minCamX = Math.min(FIELD_MARGIN_X, FIELD_MARGIN_X + FIELD_WIDTH - CANVAS_WIDTH);
    const maxCamX = Math.max(FIELD_MARGIN_X, FIELD_MARGIN_X + FIELD_WIDTH - CANVAS_WIDTH);
    camera.x = Math.max(minCamX, Math.min(maxCamX, camera.x));

    // For Y axis, only clamp if field is taller than canvas
    if (FIELD_HEIGHT > CANVAS_HEIGHT) {
        const minCamY = Math.min(FIELD_MARGIN_Y, FIELD_MARGIN_Y + FIELD_HEIGHT - CANVAS_HEIGHT);
        const maxCamY = Math.max(FIELD_MARGIN_Y, FIELD_MARGIN_Y + FIELD_HEIGHT - CANVAS_HEIGHT);
        camera.y = Math.max(minCamY, Math.min(maxCamY, camera.y));
    }

    // Auto-switch control to HOME player who touches ball (disabled during kickoff)
    if (!kickoffActive && ball.owner && ball.owner.team === 'HOME' && (!playerControlledPuppet || playerControlledPuppet !== ball.owner)) {
        // Deactivate current
        if (playerControlledPuppet) {
            playerControlledPuppet.isPlayerControlled = false;
        }
        // Activate ball holder
        playerControlledPuppet = ball.owner;
        playerControlledPuppet.isPlayerControlled = true;
        playerControlledPuppet.speed = 3.5;
        playerControlledPuppet.sprintSpeed = 5;
        // showMessage(`Ball holder #${ball.owner.number}`);
    }

    // Auto-switch control to AWAY player who touches ball in PvP mode (disabled during kickoff)
    if (gameMode === 'PvP' && !kickoffActive && ball.owner && ball.owner.team === 'AWAY') {
        const awayPlayers = players.filter(p => p.team === 'AWAY');
        const currentAwayControlled = awayPlayers.find(p => p.isPlayerControlled);
        
        if (!currentAwayControlled || currentAwayControlled !== ball.owner) {
            // Deactivate current AWAY controlled player
            if (currentAwayControlled) {
                currentAwayControlled.isPlayerControlled = false;
            }
            // Activate ball holder
            ball.owner.isPlayerControlled = true;
            ball.owner.speed = 3.5;
            ball.owner.sprintSpeed = 5;
            console.log(`PvP: Auto-switch to AWAY #${ball.owner.number} (ball holder)`);
        }
    }
}
