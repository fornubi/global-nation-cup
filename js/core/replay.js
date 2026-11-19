// Goal replay recording & playback

// Replay system functions
function recordFrame() {
    // Record current state of ball and all players
    const frame = {
        ball: { x: ball.x, y: ball.y, z: ball.z, vx: ball.vx, vy: ball.vy, vz: ball.vz },
        players: players.map(p => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, angle: p.angle }))
    };
    
    replayFrames.push(frame);
    
    // Keep only last MAX_REPLAY_FRAMES
    if (replayFrames.length > MAX_REPLAY_FRAMES) {
        replayFrames.shift();
    }
}

function startReplay() {
    if (replayFrames.length === 0) {
        resetPositions();
        return;
    }
    
    replayMode = true;
    replayIndex = 0;
    replayRecording = false;
    showMessage('REPLAY - Press R to skip');
}

function updateReplay() {
    if (replayIndex >= replayFrames.length) {
        endReplay();
        return;
    }
    
    // Skip replay if R is pressed
    if (keys['KeyR']) {
        endReplay();
        keys['KeyR'] = false;
        return;
    }
    
    // Restore frame state
    const frame = replayFrames[replayIndex];
    ball.x = frame.ball.x;
    ball.y = frame.ball.y;
    ball.z = frame.ball.z;
    ball.vx = frame.ball.vx;
    ball.vy = frame.ball.vy;
    ball.vz = frame.ball.vz;
    
    players.forEach((p, i) => {
        if (frame.players[i]) {
            p.x = frame.players[i].x;
            p.y = frame.players[i].y;
            p.vx = frame.players[i].vx;
            p.vy = frame.players[i].vy;
            p.angle = frame.players[i].angle;
        }
    });
    
    replayIndex++;
    
    // Update camera
    const targetCamX = ball.x - CANVAS_WIDTH / 2;
    const targetCamY = ball.y - CANVAS_HEIGHT / 2;
    camera.x += (targetCamX - camera.x) * 0.1;
    camera.y += (targetCamY - camera.y) * 0.1;
}

function endReplay() {
    replayMode = false;
    replayIndex = 0;
    replayFrames = [];
    replayRecording = true;
    resetPositions();
}
