// Match flow: start, periods, kickoff, set pieces, goals, full time

function startGame() {
    gameState = 'PLAYING';
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('difficultySelect').classList.add('hidden');
    document.getElementById('teamSelect1').classList.add('hidden');
    document.getElementById('teamSelect2').classList.add('hidden');
    document.getElementById('jerseySelect').classList.add('hidden');
    document.getElementById('gameOver').classList.add('hidden');

    // Reset scores and kickoff team
    homeScore = 0;
    awayScore = 0;
    gameTime = 0;
    nextKickoffTeam = 'HOME'; // HOME always kicks off first

    // Reset period/penalty state
    matchPeriod = 'FIRST_HALF';
    pendingBreakNext = null;
    breakHandled = false;
    if (breakTimeout) { clearTimeout(breakTimeout); breakTimeout = null; }
    resetPenaltyState();
    document.getElementById('periodBreak').classList.add('hidden');
    document.getElementById('penaltyOverlay').classList.add('hidden');
    updatePeriodLabel();

    // Update UI
    document.getElementById('homeTeam').textContent = playerTeam.code;
    document.getElementById('awayTeam').textContent = opponentTeam.code;
    updateScore();

    // Create ball at exact center
    ball = new Ball();
    ball.x = FIELD_MARGIN_X + FIELD_WIDTH / 2;
    ball.y = FIELD_MARGIN_Y + FIELD_HEIGHT / 2;
    ball.vx = 0;
    ball.vy = 0;
    ball.owner = null;

    // Reset camera to center
    camera.x = FIELD_MARGIN_X + FIELD_WIDTH / 2 - CANVAS_WIDTH / 2;
    camera.y = FIELD_MARGIN_Y + FIELD_HEIGHT / 2 - CANVAS_HEIGHT / 2;

    // Create players
    players = [];
    createPlayers();

    // Populate homePlayers
    homePlayers = players.filter(p => p.team === 'HOME');
    
    // Clear all player control states first
    players.forEach(p => {
        p.isPlayerControlled = false;
    });
    
    // KICKOFF: Set up based on nextKickoffTeam (this will set the controlled puppet)
    setupKickoff();

    // Start game loop
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(() => {
        if (gameState === 'PLAYING') {
            // Clock stops at the period end while a goal/replay/restart finishes
            if (gameTime < getPeriodEnd()) gameTime++;
            updateTimer();
            checkPeriodEnd();
        }
    }, 1000);

    lastTime = performance.now();
    gameLoop();
}

// ===== Match period helpers =====
function updatePeriodLabel() {
    const el = document.getElementById('periodLabel');
    if (!el) return;
    const labels = {
        FIRST_HALF: '1ST HALF',
        SECOND_HALF: '2ND HALF',
        ET_FIRST: 'EXTRA TIME 1',
        ET_SECOND: 'EXTRA TIME 2',
        PENALTIES: 'PENALTIES'
    };
    el.textContent = labels[matchPeriod] || '';
}

function getPeriodEnd() {
    const ends = { FIRST_HALF: 120, SECOND_HALF: 240, ET_FIRST: 280, ET_SECOND: 320 };
    return ends[matchPeriod] ?? Infinity;
}

function checkPeriodEnd() {
    if (isScoringGoal || replayMode || ballOutActive || goalCelebrationActive) return;
    if (gameTime < getPeriodEnd()) return;
    showPeriodBreak();
}

function showPeriodBreak() {
    if (gameState === 'BREAK') return;
    gameState = 'BREAK';
    document.getElementById('playerInfoHome').style.display = 'none';
    document.getElementById('playerInfoAway').style.display = 'none';

    let title, next;
    if (matchPeriod === 'FIRST_HALF') { title = 'HALF TIME'; next = 'SECOND_HALF'; }
    else if (matchPeriod === 'SECOND_HALF') {
        if (homeScore !== awayScore) { endGame(); return; }
        title = 'FULL TIME - EXTRA TIME'; next = 'ET_FIRST';
    } else if (matchPeriod === 'ET_FIRST') { title = 'EXTRA TIME - HALF TIME'; next = 'ET_SECOND'; }
    else {
        if (homeScore !== awayScore) { endGame(); return; }
        title = 'PENALTY SHOOTOUT'; next = 'PENALTIES';
    }

    pendingBreakNext = next;
    breakHandled = false;
    document.getElementById('periodBreakTitle').textContent = title;
    const scoreEl = document.getElementById('periodBreakScore');
    scoreEl.textContent = `${playerTeam.code} ${homeScore} - ${awayScore} ${opponentTeam.code}`;
    document.getElementById('periodBreak').classList.remove('hidden');

    if (breakTimeout) clearTimeout(breakTimeout);
    breakTimeout = setTimeout(() => continueFromBreak(), 6000);
}

function continueFromBreak() {
    if (breakHandled) return;
    breakHandled = true;
    if (breakTimeout) { clearTimeout(breakTimeout); breakTimeout = null; }
    const next = pendingBreakNext;
    document.getElementById('periodBreak').classList.add('hidden');

    if (next === 'PENALTIES') { startPenalties(); return; }

    matchPeriod = next;
    nextKickoffTeam = (next === 'SECOND_HALF' || next === 'ET_SECOND') ? 'AWAY' : 'HOME';
    gameState = 'PLAYING';
    replayFrames = [];
    setupKickoff();
    updatePeriodLabel();
    lastTime = performance.now();
    gameLoop();
}
window.continueFromBreak = continueFromBreak;

function createPlayers() {
    // Formation 4-4-2 - 11 vs 11 players
    // HOME team at BOTTOM, AWAY team at TOP
    // SPREAD OUT for taller field (FIELD_HEIGHT = 1000)
    const centerX = FIELD_MARGIN_X + FIELD_WIDTH / 2;
    const homeGK_Y = FIELD_MARGIN_Y + FIELD_HEIGHT - 60;  // Near bottom
    const awayGK_Y = FIELD_MARGIN_Y + 60;  // Near top

    // More spread out formations
    const centerCircleY = FIELD_MARGIN_Y + FIELD_HEIGHT / 2;
    const formations = {
        HOME: [  // Bottom team
            // GK near bottom goal
            { x: centerX, y: FIELD_MARGIN_Y + FIELD_HEIGHT - 50, num: 1 },
            // DEF line ~100px up from GK
            { x: centerX - 180, y: FIELD_MARGIN_Y + FIELD_HEIGHT - 150, num: 2 },
            { x: centerX - 60, y: FIELD_MARGIN_Y + FIELD_HEIGHT - 130, num: 3 },
            { x: centerX + 60, y: FIELD_MARGIN_Y + FIELD_HEIGHT - 130, num: 4 },
            { x: centerX + 180, y: FIELD_MARGIN_Y + FIELD_HEIGHT - 150, num: 5 },
            // MID spread across midfield (BELOW center line for HOME team)
            { x: centerX - 200, y: centerCircleY + 150, num: 6 },
            { x: centerX - 80, y: centerCircleY + 130, num: 7 },
            { x: centerX + 80, y: centerCircleY + 130, num: 8 },
            { x: centerX + 200, y: centerCircleY + 150, num: 9 },
            // FWD near center circle (BELOW center line for HOME team)
            { x: centerX - 120, y: centerCircleY + 80, num: 10 },
            { x: centerX + 120, y: centerCircleY + 80, num: 11 }
        ],
        AWAY: [  // Top team (flipped)
            // GK near top goal
            { x: centerX, y: FIELD_MARGIN_Y + 50, num: 1 },
            // DEF line ~100px down from GK
            { x: centerX - 180, y: FIELD_MARGIN_Y + 150, num: 2 },
            { x: centerX - 60, y: FIELD_MARGIN_Y + 130, num: 3 },
            { x: centerX + 60, y: FIELD_MARGIN_Y + 130, num: 4 },
            { x: centerX + 180, y: FIELD_MARGIN_Y + 150, num: 5 },
            // MID across midfield (ABOVE center line for AWAY team)
            { x: centerX - 200, y: centerCircleY - 150, num: 6 },
            { x: centerX - 80, y: centerCircleY - 130, num: 7 },
            { x: centerX + 80, y: centerCircleY - 130, num: 8 },
            { x: centerX + 200, y: centerCircleY - 150, num: 9 },
            // FWD near center circle (ABOVE center line for AWAY team)
            { x: centerX - 120, y: centerCircleY - 80, num: 10 },
            { x: centerX + 120, y: centerCircleY - 80, num: 11 }
        ]
    };

    // Create home team (player) - at BOTTOM
    // Initially no one is controlled - will be set during kickoff
    formations.HOME.forEach((pos, i) => {
        const player = new Player('HOME', false, pos.x, pos.y, pos.num);
        players.push(player);
    });

    // Create away team (AI) - at TOP
    formations.AWAY.forEach((pos, i) => {
        players.push(new Player('AWAY', false, pos.x, pos.y, pos.num));
    });
}

// DISABLED - manual switching only now
function switchControlToBallHolder() {
    // No auto switch
}

function scoreGoal(scoringTeam) {
    if (scoringTeam === 'HOME') {
        homeScore++;
    } else {
        awayScore++;
    }
    updateScore();

    // Show message
    showMessage(`${scoringTeam === 'HOME' ? 'HOME' : 'AWAY'} GOAL!`);
    
    // Start goal celebration
    goalCelebrationActive = true;
    goalCelebrationTimer = 90; // 1.5 seconds at 60fps
    goalNetAnimation = 60; // 1 second of net animation

    // The team that CONCEDED the goal should kick off next
    nextKickoffTeam = scoringTeam === 'HOME' ? 'AWAY' : 'HOME';

    // Start replay after short delay
    setTimeout(() => {
        startReplay();
    }, 500);
}

function resetPositions() {
    isScoringGoal = false;
    // nextKickoffTeam is already set in scoreGoal to the team that conceded
    setupKickoff();
}

function setupBallOut() {
    // Clear ALL player states
    players.forEach(p => {
        p.hasBall = false;
        p.isPlayerControlled = false;
        p.vx = 0;
        p.vy = 0;
        p.sliding = false;
        p.slideTimer = 0;
    });

    // Reset playerControlledPuppet
    playerControlledPuppet = null;

    // Position ball based on out type
    if (ballOutType === 'THROW_IN') {
        // Ball went out on sideline - place ball at sideline
        if (ball.x < FIELD_MARGIN_X) {
            // Left sideline - place ball inside field
            ball.x = FIELD_MARGIN_X + 10;
        } else if (ball.x > FIELD_MARGIN_X + FIELD_WIDTH) {
            // Right sideline - place ball inside field
            ball.x = FIELD_MARGIN_X + FIELD_WIDTH - 10;
        }
        // Keep Y position where it went out
        ball.y = Math.max(FIELD_MARGIN_Y + 10, Math.min(FIELD_MARGIN_Y + FIELD_HEIGHT - 10, ball.y));
    } else if (ballOutType === 'GOAL_KICK') {
        // Ball went out on goal line - place in front of the goal of the team taking the goal kick
        // HOME goal is at BOTTOM (FIELD_MARGIN_Y + FIELD_HEIGHT - 50)
        // AWAY goal is at TOP (FIELD_MARGIN_Y + 50)
        if (ballOutTeam === 'HOME') {
            // HOME goal kick - place ball in front of HOME goal (bottom)
            ball.y = FIELD_MARGIN_Y + FIELD_HEIGHT - 70;
            ball.x = FIELD_MARGIN_X + FIELD_WIDTH / 2;
        } else {
            // AWAY goal kick - place ball in front of AWAY goal (top)
            ball.y = FIELD_MARGIN_Y + 70;
            ball.x = FIELD_MARGIN_X + FIELD_WIDTH / 2;
        }
    } else if (ballOutType === 'CORNER_KICK') {
        // Ball went out on goal line - place at corner based on which team is taking the corner
        // HOME attacks AWAY goal (TOP), AWAY attacks HOME goal (BOTTOM)
        if (ballOutTeam === 'HOME') {
            // HOME taking corner kick - place at top corner (attacking AWAY goal at TOP)
            ball.y = FIELD_MARGIN_Y + 10;
            ball.x = ball.x < FIELD_MARGIN_X + FIELD_WIDTH / 2 ? FIELD_MARGIN_X + 10 : FIELD_MARGIN_X + FIELD_WIDTH - 10;
        } else {
            // AWAY taking corner kick - place at bottom corner (attacking HOME goal at BOTTOM)
            ball.y = FIELD_MARGIN_Y + FIELD_HEIGHT - 10;
            ball.x = ball.x < FIELD_MARGIN_X + FIELD_WIDTH / 2 ? FIELD_MARGIN_X + 10 : FIELD_MARGIN_X + FIELD_WIDTH - 10;
        }
    }

    ball.vx = 0;
    ball.vy = 0;
    ball.z = 0;
    ball.vz = 0;

    // Find a player from the ballOutTeam to take the throw-in/goal kick/corner
    // For goal kick, MUST use goalkeeper (number 1)
    let closestPlayer = null;
    if (ballOutType === 'GOAL_KICK') {
        // MUST use goalkeeper for goal kick
        closestPlayer = players.find(p => p.team === ballOutTeam && p.number === 1);
        if (!closestPlayer) {
            console.error(`Goalkeeper not found for ${ballOutTeam} team during goal kick!`);
        }
    }
    
    // If no goalkeeper found or not goal kick, find closest player
    if (!closestPlayer) {
        let minDist = Infinity;
        players.filter(p => p.team === ballOutTeam).forEach(p => {
            const dist = Math.sqrt((p.x - ball.x) ** 2 + (p.y - ball.y) ** 2);
            if (dist < minDist) {
                minDist = dist;
                closestPlayer = p;
            }
        });
    }

    if (closestPlayer) {
        // Position player at ball location
        closestPlayer.x = ball.x;
        closestPlayer.y = ball.y;
        ball.owner = closestPlayer;
        closestPlayer.hasBall = true;

        // For throw-in, position player slightly outside the sideline to throw in
        if (ballOutType === 'THROW_IN') {
            if (ball.x < FIELD_MARGIN_X + FIELD_WIDTH / 2) {
                // Left sideline - position player to the left of ball
                closestPlayer.x = ball.x - 15;
            } else {
                // Right sideline - position player to the right of ball
                closestPlayer.x = ball.x + 15;
            }
        }

        // Player control based on game mode
        if (gameMode === 'PvP') {
            // PvP mode: Player controls the team taking the throw-in/goal kick/corner
            if (ballOutTeam === 'HOME') {
                playerControlledPuppet = closestPlayer;
                playerControlledPuppet.isPlayerControlled = true;
                playerControlledPuppet.speed = 2.5;
                playerControlledPuppet.sprintSpeed = 3.6;
            } else {
                // AWAY takes the kick - player controls the AWAY player
                playerControlledPuppet = closestPlayer;
                playerControlledPuppet.isPlayerControlled = true;
                playerControlledPuppet.speed = 2.5;
                playerControlledPuppet.sprintSpeed = 3.6;
            }
        } else {
            // PvAI mode: Player always controls HOME team
            if (ballOutTeam === 'HOME') {
                playerControlledPuppet = closestPlayer;
                playerControlledPuppet.isPlayerControlled = true;
                playerControlledPuppet.speed = 2.5;
                playerControlledPuppet.sprintSpeed = 3.6;
            } else {
                // AWAY takes goal kick/throw-in/corner - player controls closest HOME player
                const homePlayer = players.filter(p => p.team === 'HOME').reduce((closest, p) => {
                    const dist = Math.sqrt((p.x - ball.x) ** 2 + (p.y - ball.y) ** 2);
                    return dist < Math.sqrt((closest.x - ball.x) ** 2 + (closest.y - ball.y) ** 2) ? p : closest;
                });
                if (homePlayer) {
                    playerControlledPuppet = homePlayer;
                    playerControlledPuppet.isPlayerControlled = true;
                    playerControlledPuppet.speed = 2.5;
                    playerControlledPuppet.sprintSpeed = 3.6;
                }
            }
        }
    }

    // Position other players - simple formation around ball
    players.forEach(p => {
        if (p !== closestPlayer) {
            // Move players away from ball
            const dx = p.x - ball.x;
            const dy = p.y - ball.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 100) {
                const pushDist = 100 - dist;
                p.x += (dx / dist) * pushDist;
                p.y += (dy / dist) * pushDist;
            }
        }
    });

    // Don't set ballOutActive to false here - it will be set to false when ball is kicked
}

function setupKickoff() {
    const centerX = FIELD_MARGIN_X + FIELD_WIDTH / 2;
    const centerY = FIELD_MARGIN_Y + FIELD_HEIGHT / 2;
    
    // Reset ball position
    ball.x = centerX;
    ball.y = centerY;
    ball.vx = 0;
    ball.vy = 0;
    ball.z = 0;
    
    // Reset pressing system
    pressingPlayer = null;
    pressingTimer = 0;
    pressingPlayerByTeam = { HOME: null, AWAY: null };
    pressingTimerByTeam = { HOME: 0, AWAY: 0 };
    
    // Clear ALL player states (ball ownership AND control)
    players.forEach(p => {
        p.hasBall = false;
        p.isPlayerControlled = false; // CRITICAL: Clear all control flags
        p.vx = 0;
        p.vy = 0;
        p.sliding = false;
        p.slideTimer = 0;
    });
    
    // Reset playerControlledPuppet
    playerControlledPuppet = null;
    
    // Find kickoff player (#10) based on nextKickoffTeam
    const kickoffPlayer = players.find(p => p.team === nextKickoffTeam && p.number === 10);
    
    if (kickoffPlayer) {
        kickoffPlayer.x = ball.x;
        kickoffPlayer.y = ball.y;
        ball.owner = kickoffPlayer;
        kickoffPlayer.hasBall = true;
        
        // Player controls based on game mode
        if (gameMode === 'PvP') {
            // PvP mode: Both teams are player-controlled
            if (nextKickoffTeam === 'HOME') {
                // HOME kicks off - Player 1 controls ball holder (#10)
                playerControlledPuppet = kickoffPlayer;
                playerControlledPuppet.isPlayerControlled = true;
                playerControlledPuppet.speed = 3.5;
                playerControlledPuppet.sprintSpeed = 5;
                
                // Player 2 controls closest AWAY player
                Player.switchPlayerGlobalAway();
                console.log('PvP: HOME kickoff - Player 1 controls HOME #10, Player 2 controls closest AWAY');
            } else {
                // AWAY kicks off - Player 2 controls ball holder (#10)
                kickoffPlayer.isPlayerControlled = true;
                kickoffPlayer.speed = 3.5;
                kickoffPlayer.sprintSpeed = 5;
                
                // Player 1 controls closest HOME player
                const homePlayer10 = players.find(p => p.team === 'HOME' && p.number === 10);
                if (homePlayer10) {
                    playerControlledPuppet = homePlayer10;
                    playerControlledPuppet.isPlayerControlled = true;
                    playerControlledPuppet.speed = 3.5;
                    playerControlledPuppet.sprintSpeed = 5;
                }
                console.log('PvP: AWAY kickoff - Player 2 controls AWAY #10, Player 1 controls HOME #10');
            }
        } else {
            // PvAI mode: Only HOME team is player-controlled
            if (nextKickoffTeam === 'HOME') {
                // HOME kicks off - player controls ball holder (#10)
                playerControlledPuppet = kickoffPlayer;
                playerControlledPuppet.isPlayerControlled = true;
                playerControlledPuppet.speed = 3.5;
                playerControlledPuppet.sprintSpeed = 5;
            } else {
                // AWAY kicks off - player controls HOME #10, AI controls ball holder (AWAY #10)
                const homePlayer10 = players.find(p => p.team === 'HOME' && p.number === 10);
                if (homePlayer10) {
                    playerControlledPuppet = homePlayer10;
                    playerControlledPuppet.isPlayerControlled = true;
                    playerControlledPuppet.speed = 3.5;
                    playerControlledPuppet.sprintSpeed = 5;
                }
                // kickoffPlayer (AWAY #10) stays isPlayerControlled = false (controlled by AI)
            }
        }
    }
    
    // Position all other players based on who kicks off
    const homeKickoffPositions = [
        { num: 1, x: centerX, y: FIELD_MARGIN_Y + FIELD_HEIGHT - 50 },
        { num: 2, x: centerX - 180, y: centerY + 200 },
        { num: 3, x: centerX - 60, y: centerY + 180 },
        { num: 4, x: centerX + 60, y: centerY + 180 },
        { num: 5, x: centerX + 180, y: centerY + 200 },
        { num: 6, x: centerX - 200, y: centerY + 80 },
        { num: 7, x: centerX - 80, y: centerY + 60 },
        { num: 8, x: centerX + 80, y: centerY + 60 },
        { num: 9, x: centerX + 200, y: centerY + 80 },
        { num: 10, x: centerX - 120, y: centerY + 100 },  // HOME #10 position (when not kicking off)
        { num: 11, x: centerX + 120, y: centerY + 100 }
    ];
    
    const awayKickoffPositions = [
        { num: 1, x: centerX, y: FIELD_MARGIN_Y + 50 },
        { num: 2, x: centerX - 180, y: centerY - 200 },
        { num: 3, x: centerX - 60, y: centerY - 180 },
        { num: 4, x: centerX + 60, y: centerY - 180 },
        { num: 5, x: centerX + 180, y: centerY - 200 },
        { num: 6, x: centerX - 200, y: centerY - 80 },
        { num: 7, x: centerX - 80, y: centerY - 60 },
        { num: 8, x: centerX + 80, y: centerY - 60 },
        { num: 9, x: centerX + 200, y: centerY - 80 },
        { num: 10, x: centerX - 120, y: centerY - 100 },  // AWAY #10 position (when not kicking off)
        { num: 11, x: centerX + 120, y: centerY - 100 }
    ];
    
    // Position HOME players (skip #10 if HOME kicks off since he's at center with ball)
    homeKickoffPositions.forEach(pos => {
        const p = players.find(pl => pl.team === 'HOME' && pl.number === pos.num);
        if (!p) return;
        
        // Skip the kickoff player (#10) - he's already positioned at center
        if (p === kickoffPlayer) return;
        
        // Position all other HOME players at their kickoff positions
        p.x = pos.x;
        p.y = pos.y;
    });
    
    // Position AWAY players (skip #10 if AWAY kicks off since he's at center with ball)
    awayKickoffPositions.forEach(pos => {
        const p = players.find(pl => pl.team === 'AWAY' && pl.number === pos.num);
        if (!p) return;
        
        // Skip the kickoff player (#10) - he's already positioned at center
        if (p === kickoffPlayer) return;
        
        // Position all other AWAY players at their kickoff positions
        p.x = pos.x;
        p.y = pos.y;
    });
    
    // Activate kickoff mode
    kickoffActive = true;
    const kickingTeamName = nextKickoffTeam === 'HOME' ? playerTeam?.code : opponentTeam?.code;
    // showMessage(`${kickingTeamName} KICKOFF! Press X/D/A to start`);
}

function endGame() {
    gameState = 'GAMEOVER';
    clearInterval(gameInterval);
    document.getElementById('playerInfoHome').style.display = 'none';
    document.getElementById('playerInfoAway').style.display = 'none';
    if (breakTimeout) { clearTimeout(breakTimeout); breakTimeout = null; }
    document.getElementById('periodBreak').classList.add('hidden');
    document.getElementById('penaltyOverlay').classList.add('hidden');
    document.getElementById('periodLabel').textContent = 'FULL TIME';

    const resultTitle = document.getElementById('resultTitle');
    const finalScore = document.getElementById('finalScore');

    const decidedByPenalties = matchPeriod === 'PENALTIES';
    const decidedInExtraTime = !decidedByPenalties && (matchPeriod === 'ET_FIRST' || matchPeriod === 'ET_SECOND');

    let homeWins;
    if (decidedByPenalties) {
        homeWins = penaltyWinTeam === 'HOME';
    } else {
        homeWins = homeScore > awayScore;
    }

    if (homeWins) {
        resultTitle.textContent = 'VICTORY!';
        resultTitle.style.color = '#00ff00';
    } else if (homeScore < awayScore || decidedByPenalties) {
        resultTitle.textContent = 'DEFEAT';
        resultTitle.style.color = '#ff0000';
    } else {
        resultTitle.textContent = 'DRAW';
        resultTitle.style.color = '#ffd700';
    }

    if (decidedByPenalties) {
        finalScore.textContent = '';
        const scoreLine = document.createElement('div');
        scoreLine.textContent = `${homeScore} - ${awayScore} (AET)`;
        const penLine = document.createElement('div');
        penLine.textContent = `PENALTIES: ${penaltyHomeGoals} - ${penaltyAwayGoals}`;
        penLine.style.fontSize = '1.1rem';
        penLine.style.color = '#ffd700';
        finalScore.appendChild(scoreLine);
        finalScore.appendChild(penLine);
    } else {
        finalScore.textContent = `${homeScore} - ${awayScore}${decidedInExtraTime ? ' (AET)' : ''}`;
    }
    document.getElementById('gameOver').classList.remove('hidden');
}

function resetGame() {
    // Reset selections and go to menu
    homeJerseyType = 'home';
    awayJerseyType = 'home';
    playerTeam = null;
    opponentTeam = null;
    showMenu();
}
