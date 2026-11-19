// In-game HUD: score, timer, messages, player info boxes

function updateScore() {
    document.getElementById('homeScore').textContent = homeScore;
    document.getElementById('awayScore').textContent = awayScore;
}

function updateTimer() {
    // Scale time to display as 90-minute match (4 real minutes = 90 display minutes)
    const displayMinutes = Math.floor((gameTime / maxTime) * 90);
    const displaySeconds = Math.floor(((gameTime / maxTime) * 90 % 1) * 60);
    const minutes = displayMinutes.toString().padStart(2, '0');
    const seconds = displaySeconds.toString().padStart(2, '0');
    document.getElementById('timer').textContent = `${minutes}:${seconds}`;
}

function showMessage(text) {
    const msg = document.getElementById('message');
    msg.textContent = text;
    msg.classList.add('show');

    if (messageTimer) clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
        msg.classList.remove('show');
    }, 2000);
}

function getRoleName(num) {
    if (num === 1) return 'GOALKEEPER';
    if (num <= 5) return 'DEFENDER';
    if (num <= 9) return 'MIDFIELDER';
    return 'FORWARD';
}

function updatePlayerInfo() {
    const homeBox = document.getElementById('playerInfoHome');
    const awayBox = document.getElementById('playerInfoAway');

    if (gameState !== 'PLAYING') {
        homeBox.style.display = 'none';
        awayBox.style.display = 'none';
        return;
    }

    // HOME: always show controlled puppet
    homeBox.style.display = 'block';
    if (playerControlledPuppet) {
        document.getElementById('homePlayerNum').textContent = `#${playerControlledPuppet.number}`;
        document.getElementById('homePlayerRole').textContent = getRoleName(playerControlledPuppet.number);
        document.getElementById('homePlayerBall').textContent = ball.owner === playerControlledPuppet ? '⚽ BALL' : '';
    }

    // AWAY: show AWAY player who has ball, or hide if none
    const awayWithBall = ball.owner && ball.owner.team === 'AWAY' ? ball.owner : null;
    if (awayWithBall) {
        awayBox.style.display = 'block';
        document.getElementById('awayPlayerNum').textContent = `#${awayWithBall.number}`;
        document.getElementById('awayPlayerRole').textContent = getRoleName(awayWithBall.number);
        document.getElementById('awayPlayerBall').textContent = '⚽ BALL';
    } else {
        awayBox.style.display = 'none';
    }
}
