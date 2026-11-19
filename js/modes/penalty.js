// Penalty shootout mode

// ===== Penalty shootout =====
function resetPenaltyState() {
    penaltyState = 'IDLE';
    penaltyShots = [];
    penaltyHomeGoals = 0;
    penaltyAwayGoals = 0;
    penaltyKickTeam = 'HOME';
    penaltyAimX = 500;
    penaltyAimTimer = 0;
    penaltyShotX = 500;
    penaltyShotZone = null;
    penaltyKeeperDive = 'CENTER';
    penaltyShotFrame = 0;
    penaltyResultTimer = 0;
    penaltyResultText = '';
    penaltySuddenDeath = false;
    penaltyWinTeam = null;
}

function startPenalties() {
    matchPeriod = 'PENALTIES';
    resetPenaltyState();
    updatePeriodLabel();
    clearInterval(gameInterval);
    gameState = 'PENALTIES';
    document.getElementById('playerInfoHome').style.display = 'none';
    document.getElementById('playerInfoAway').style.display = 'none';
    document.getElementById('penaltyOverlay').classList.remove('hidden');
    // camera fixed so the top goal (world y=50) is visible near top
    camera.x = 0;
    camera.y = -80;
    buildPenaltyBoard();
    beginNextPenaltyKick();
    requestAnimationFrame(penaltyLoop);
}
window.startPenalties = startPenalties;

function buildPenaltyBoard() {
    document.getElementById('penHomeCode').textContent = playerTeam.code;
    document.getElementById('penAwayCode').textContent = opponentTeam.code;
    renderPenaltyCircles();
}

function renderPenaltyCircles() {
    const hEl = document.getElementById('penHomeCircles');
    const aEl = document.getElementById('penAwayCircles');
    while (hEl.firstChild) hEl.removeChild(hEl.firstChild);
    while (aEl.firstChild) aEl.removeChild(aEl.firstChild);
    const homeShots = penaltyShots.filter(s => s.team === 'HOME');
    const awayShots = penaltyShots.filter(s => s.team === 'AWAY');
    const total = Math.max(homeShots.length, awayShots.length, 5);
    for (let i = 0; i < total; i++) {
        const c = document.createElement('div'); c.className = 'pen-circle';
        if (i < homeShots.length) c.classList.add(homeShots[i].scored ? 'scored' : 'missed');
        hEl.appendChild(c);
        const c2 = document.createElement('div'); c2.className = 'pen-circle';
        if (i < awayShots.length) c2.classList.add(awayShots[i].scored ? 'scored' : 'missed');
        aEl.appendChild(c2);
    }
}

function beginNextPenaltyKick() {
    penaltyKickTeam = penaltyShots.length % 2 === 0 ? 'HOME' : 'AWAY';
    if (penaltyShots.length >= 10) penaltySuddenDeath = true;
    penaltyState = 'AIM';
    penaltyAimTimer = (penaltyKickTeam === 'AWAY' && gameMode !== 'PvP') ? 120 : 300;
    penaltyAimX = 500;
    penaltyShotZone = null;
    penaltyKeeperDive = 'CENTER';
    penaltyShotFrame = 0;

    if (penaltyKickTeam === 'AWAY' && gameMode !== 'PvP') {
        penaltyAimX = aiChooseShotX();
    }
    updatePenaltyMsg();
}

function aiChooseShotX() {
    const missProb = aiDifficulty === 'PASSIVE' ? 0.30 : aiDifficulty === 'EASY' ? 0.20 : aiDifficulty === 'MEDIUM' ? 0.12 : 0.06;
    if (Math.random() < missProb) {
        return Math.random() < 0.5 ? 400 + Math.random() * 30 : 570 + Math.random() * 30;
    }
    return 430 + Math.random() * 140;
}

function zoneFromX(x) {
    if (x < 430 || x > 570) return 'WIDE';
    if (x < 476.67) return 'LEFT';
    if (x > 523.33) return 'RIGHT';
    return 'CENTER';
}

function takePenaltyShot() {
    // Consume the shoot keys so a held key doesn't fire the next kick
    keys['KeyC'] = false;
    keys['KeyJ'] = false;
    penaltyState = 'SHOT';
    penaltyShotX = penaltyAimX;
    penaltyShotZone = zoneFromX(penaltyShotX);
    const defendTeam = penaltyKickTeam === 'HOME' ? 'AWAY' : 'HOME';
    penaltyKeeperDive = getKeeperDive(defendTeam);
    penaltyResultText = computePenaltyResult();
    penaltyShotFrame = 0;
}

function getKeeperDive(defendTeam) {
    if (defendTeam === 'HOME') {
        if (keys['ArrowLeft']) return 'LEFT';
        if (keys['ArrowRight']) return 'RIGHT';
        return 'CENTER';
    }
    if (gameMode === 'PvP') {
        if (keys['KeyA']) return 'LEFT';
        if (keys['KeyD']) return 'RIGHT';
        return 'CENTER';
    }
    // AI keeper
    const zone = penaltyShotZone;
    const correctProb = aiDifficulty === 'PASSIVE' ? 0.20 : aiDifficulty === 'EASY' ? 0.33 : aiDifficulty === 'MEDIUM' ? 0.40 : 0.50;
    if (zone === 'WIDE') {
        const zones = ['LEFT', 'CENTER', 'RIGHT'];
        return zones[Math.floor(Math.random() * 3)];
    }
    if (Math.random() < correctProb) return zone;
    const other = ['LEFT', 'CENTER', 'RIGHT'].filter(z => z !== zone);
    return other[Math.floor(Math.random() * other.length)];
}

function computePenaltyResult() {
    const x = penaltyShotX;
    const left = 430, right = 570;
    if (x < left || x > right) return 'MISSED!';
    if (penaltyKeeperDive === penaltyShotZone) {
        const outerThresh = 35;
        const nearPost = (x - left) < outerThresh || (right - x) < outerThresh;
        if (nearPost) return Math.random() < 0.5 ? 'GOAL!' : 'SAVED!';
        return 'SAVED!';
    }
    return 'GOAL!';
}

function updatePenalty() {
    if (penaltyState === 'AIM') {
        penaltyAimTimer--;
        if (penaltyKickTeam === 'HOME') {
            if (keys['ArrowLeft']) penaltyAimX -= 2.5;
            if (keys['ArrowRight']) penaltyAimX += 2.5;
        } else if (gameMode === 'PvP') {
            if (keys['KeyA']) penaltyAimX -= 2.5;
            if (keys['KeyD']) penaltyAimX += 2.5;
        }
        penaltyAimX = Math.max(400, Math.min(600, penaltyAimX));
        const shootPressed = (penaltyKickTeam === 'HOME' && keys['KeyC']) ||
                             (penaltyKickTeam === 'AWAY' && gameMode === 'PvP' && keys['KeyJ']);
        if (shootPressed || penaltyAimTimer <= 0) takePenaltyShot();
    } else if (penaltyState === 'SHOT') {
        penaltyShotFrame++;
        if (penaltyShotFrame >= 36) { penaltyState = 'RESULT'; penaltyResultTimer = 90; }
    } else if (penaltyState === 'RESULT') {
        penaltyResultTimer--;
        if (penaltyResultTimer <= 0) applyPenaltyResult();
    }
}

function applyPenaltyResult() {
    const scored = penaltyResultText === 'GOAL!';
    penaltyShots.push({ team: penaltyKickTeam, scored });
    if (scored) {
        if (penaltyKickTeam === 'HOME') penaltyHomeGoals++; else penaltyAwayGoals++;
    }
    renderPenaltyCircles();

    const winner = penaltyWinner();
    if (winner) { endPenalties(winner); return; }
    beginNextPenaltyKick();
}

function penaltyWinner() {
    const homeTaken = penaltyShots.filter(s => s.team === 'HOME').length;
    const awayTaken = penaltyShots.filter(s => s.team === 'AWAY').length;
    if (!penaltySuddenDeath) {
        if (homeTaken >= 5 && awayTaken >= 5) {
            if (penaltyHomeGoals !== penaltyAwayGoals) {
                return penaltyHomeGoals > penaltyAwayGoals ? 'HOME' : 'AWAY';
            }
            penaltySuddenDeath = true;
            return null;
        }
        if (penaltyHomeGoals > penaltyAwayGoals + (5 - awayTaken)) return 'HOME';
        if (penaltyAwayGoals > penaltyHomeGoals + (5 - homeTaken)) return 'AWAY';
        return null;
    }
    if (penaltyShots.length % 2 === 0 && penaltyHomeGoals !== penaltyAwayGoals) {
        return penaltyHomeGoals > penaltyAwayGoals ? 'HOME' : 'AWAY';
    }
    return null;
}

function endPenalties(winner) {
    penaltyWinTeam = winner;
    endGame();
}

function updatePenaltyMsg() {
    const msg = document.getElementById('penaltyMsg');
    if (penaltyKickTeam === 'HOME') msg.textContent = 'HOME: ←/→ aim, C shoot';
    else if (gameMode === 'PvP') msg.textContent = 'AWAY: A/D aim, J shoot';
    else msg.textContent = 'AWAY shoots - HOME keeper: hold ←/→ to dive';
}

function renderPenalty() {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawField();

    const sx = wx => wx - camera.x;
    const sy = wy => wy - camera.y;

    const goalLineY = 50;
    const spotY = 130; // matches the penalty spot drawn by drawField()

    drawPenaltyPlayer(500, spotY + 42, penaltyKickTeam); // kicker stands behind the ball

    let keeperX = 500;
    if (penaltyState === 'SHOT' || penaltyState === 'RESULT') {
        const t = Math.min(1, penaltyShotFrame / 36);
        const targetX = penaltyKeeperDive === 'LEFT' ? 435 :
                        penaltyKeeperDive === 'RIGHT' ? 565 : 500;
        keeperX = 500 + (targetX - 500) * t;
    }
    const defendTeam = penaltyKickTeam === 'HOME' ? 'AWAY' : 'HOME';
    drawPenaltyPlayer(keeperX, goalLineY + 6, defendTeam);

    let ballX = 500, ballY = spotY;
    if (penaltyState === 'SHOT') {
        const t = Math.min(1, penaltyShotFrame / 36);
        ballX = 500 + (penaltyShotX - 500) * t;
        ballY = spotY + (goalLineY - spotY) * t - Math.sin(t * Math.PI) * 40;
    } else if (penaltyState === 'RESULT') {
        ballX = penaltyShotX; ballY = goalLineY;
    }
    drawPenaltyBall(ballX, ballY);

    if (penaltyState === 'AIM') {
        ctx.fillStyle = 'rgba(255,255,0,0.8)';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx(penaltyAimX), sy(goalLineY - 10));
        ctx.lineTo(sx(penaltyAimX) + 10, sy(goalLineY + 4));
        ctx.lineTo(sx(penaltyAimX) - 10, sy(goalLineY + 4));
        ctx.closePath();
        ctx.fill(); ctx.stroke();
    }

    if (penaltyState === 'RESULT') {
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 56px Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 5;
        ctx.strokeText(penaltyResultText, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
        ctx.fillText(penaltyResultText, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
        ctx.textAlign = 'left';
    }
}

function jerseyFor(side) {
    const t = side === 'HOME' ? playerTeam : opponentTeam;
    const type = side === 'HOME' ? homeJerseyType : awayJerseyType;
    return t ? (type === 'away' ? t.away : t.home) : { primary: '#fff', secondary: '#000' };
}

function drawPenaltyPlayer(x, y, side) {
    const td = jerseyFor(side);
    const px = x - camera.x, py = y - camera.y;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(px, py + 12, 14, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fdbcb4';
    ctx.beginPath(); ctx.ellipse(px - 5, py + 9, 3, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(px + 5, py + 9, 3, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.roundRect(px - 8, py + 3, 16, 10, 3); ctx.fill();
    ctx.strokeStyle = td.primary; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = td.primary;
    ctx.beginPath(); ctx.roundRect(px - 9, py - 12, 18, 18, 4); ctx.fill();
    ctx.strokeStyle = td.secondary; ctx.stroke();
    ctx.fillStyle = '#fdbcb4';
    ctx.beginPath(); ctx.arc(px, py - 20, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a3728';
    ctx.beginPath(); ctx.arc(px, py - 22, 8, Math.PI, 0); ctx.fill();
}

function drawPenaltyBall(x, y) {
    const px = x - camera.x, py = y - camera.y;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(px, py + 8, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#666'; ctx.lineWidth = 1; ctx.stroke();
}

function penaltyLoop() {
    if (gameState !== 'PENALTIES') return;
    updatePenalty();
    renderPenalty();
    requestAnimationFrame(penaltyLoop);
}
