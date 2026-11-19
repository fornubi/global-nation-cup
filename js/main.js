// Entry point: initialisation, keyboard listeners, debug hooks

// Initialize
async function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    // Load teams from JSON (fall back to built-in data on file://)
    try {
        const response = await fetch('data/teams.json');
        const data = await response.json();
        TEAMS = data.teams;
    } catch (error) {
        console.error('Failed to load teams:', error);
        if (typeof TEAMS_FALLBACK !== 'undefined') {
            TEAMS = TEAMS_FALLBACK.teams;
        }
    }
    createTeamButtons();

    // Event listeners - use e.code for game keys (reliable with shift/caps)
    document.addEventListener('keydown', e => {
        keys[e.code] = true;
        keys[e.key] = true;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
            e.preventDefault();
        }
        if (gameState === 'BREAK' && pendingBreakNext && (e.code === 'Enter' || e.code === 'Space')) {
            continueFromBreak();
        }
        });
    document.addEventListener('keyup', e => {
        keys[e.code] = false;
        keys[e.key] = false;
    });

    // Scale the game to fit the window
    fitGameToWindow();
    window.addEventListener('resize', fitGameToWindow);

    // Clear held keys when window loses focus so they don't get stuck
    window.addEventListener('blur', () => {
        for (const k in keys) keys[k] = false;
    });

    // Gamepad support
    window.addEventListener('gamepadconnected', e => {
        if (gamepadIndex1 === null) {
            gamepadIndex1 = e.gamepad.index;
            gamepadConnected1 = true;
            console.log('Gamepad 1 (HOME) connected:', e.gamepad.id);
        } else if (gamepadIndex2 === null) {
            gamepadIndex2 = e.gamepad.index;
            gamepadConnected2 = true;
            console.log('Gamepad 2 (AWAY) connected:', e.gamepad.id);
        }
    });

    window.addEventListener('gamepaddisconnected', e => {
        if (e.gamepad.index === gamepadIndex1) {
            gamepadIndex1 = null;
            gamepadConnected1 = false;
            console.log('Gamepad 1 (HOME) disconnected');
        } else if (e.gamepad.index === gamepadIndex2) {
            gamepadIndex2 = null;
            gamepadConnected2 = false;
            console.log('Gamepad 2 (AWAY) disconnected');
        }
    });

    render();
}

// Debug/testing hooks
window.debugJumpTo = (period, seconds) => {
    matchPeriod = period;
    gameTime = seconds;
    updateTimer();
    updatePeriodLabel();
};
window.debugStartPenalties = () => {
    startPenalties();
};

// Start
init();
