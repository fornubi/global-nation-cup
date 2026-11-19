// Menu & match setup screens (mode, difficulty, team, jersey selection)

// Shrink the whole container (canvas + HTML overlays) uniformly on small screens
function fitGameToWindow() {
    const container = document.getElementById('gameContainer');
    const border = 8; // 4px border on each side
    container.style.zoom = 1;
    const top = container.getBoundingClientRect().top + window.scrollY;
    const scaleX = (window.innerWidth - 32) / (canvas.width + border);
    const scaleY = (window.innerHeight - top - 16) / (canvas.height + border);
    const scale = Math.max(0.3, Math.min(1, scaleX, scaleY));
    container.style.zoom = scale;
}

function createTeamButtons() {
    // Legacy function - create for teamGrid1 if exists
    const teamGrid1 = document.getElementById('teamGrid1');
    if (teamGrid1) createTeamGrid(teamGrid1, 1);
}

function createTeamGrid(gridElement, step) {
    gridElement.innerHTML = '';

    TEAMS.forEach(team => {
        const btn = document.createElement('button');
        btn.className = 'btn team-btn';
        btn.style.cssText = `
                display:flex;
                flex-direction:column;
                align-items:center;
                justify-content:center;
                gap:8px;
                padding:12px 8px;
                width:110px;
                height:110px;
                box-sizing:border-box;
            `;

        // Use home jersey colors for button styling
        btn.style.background = team.home.primary;
        btn.style.color = team.home.secondary;

        const flagUrl = `https://flagicons.lipis.dev/flags/4x3/${team.flag.toLowerCase()}.svg`;
        btn.innerHTML = `
                <img src="${flagUrl}" alt="${team.code}" style="width:40px;height:30px;object-fit:cover;border-radius:3px;box-shadow:0 2px 4px rgba(0,0,0,0.3);">
                <span style="font-weight:bold;font-size:1rem;">${team.code}</span>
                <span style="font-size:0.7rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;">${team.name}</span>
            `;

        if (step === 1) {
            btn.onclick = () => selectPlayerTeam(team);
        } else {
            btn.onclick = () => selectOpponentTeam(team);
        }
        gridElement.appendChild(btn);
    });
}

function setJerseyType(type) {
    // Legacy - not used in new flow
    playerJersey = type;
}
window.setJerseyType = setJerseyType;

function showMenu() {
    gameState = 'MENU';
    document.getElementById('menu').classList.remove('hidden');
    document.getElementById('gameModeSelect').classList.add('hidden');
    document.getElementById('difficultySelect').classList.add('hidden');
    document.getElementById('teamSelect1').classList.add('hidden');
    document.getElementById('teamSelect2').classList.add('hidden');
    document.getElementById('jerseySelect').classList.add('hidden');
    document.getElementById('gameOver').classList.add('hidden');
    document.getElementById('periodBreak').classList.add('hidden');
    document.getElementById('penaltyOverlay').classList.add('hidden');
    if (breakTimeout) { clearTimeout(breakTimeout); breakTimeout = null; }
}

function showDifficultySelect() {
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('difficultySelect').classList.remove('hidden');
    document.getElementById('teamSelect1').classList.add('hidden');
    document.getElementById('teamSelect2').classList.add('hidden');
    document.getElementById('jerseySelect').classList.add('hidden');
}

function showGameModeSelect() {
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('gameModeSelect').classList.remove('hidden');
    document.getElementById('difficultySelect').classList.add('hidden');
    document.getElementById('teamSelect1').classList.add('hidden');
    document.getElementById('teamSelect2').classList.add('hidden');
    document.getElementById('jerseySelect').classList.add('hidden');
}

function setGameMode(mode) {
    gameMode = mode;
    document.getElementById('gameModeSelect').classList.add('hidden');
    if (mode === 'PvAI') {
        showDifficultySelect();
    } else {
        // Skip difficulty for PvP, go straight to team selection
        showTeamSelect1();
    }
}

function setDifficultyAndNext(diff) {
    aiDifficulty = diff;
    showTeamSelect1();
}

function showTeamSelect1() {
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('difficultySelect').classList.add('hidden');
    document.getElementById('teamSelect1').classList.remove('hidden');
    document.getElementById('teamSelect2').classList.add('hidden');
    document.getElementById('jerseySelect').classList.add('hidden');
    
    // Create team grid for step 1
    const teamGrid1 = document.getElementById('teamGrid1');
    if (teamGrid1) createTeamGrid(teamGrid1, 1);
}

function selectPlayerTeam(team) {
    playerTeam = team;
    showTeamSelect2();
}

function showTeamSelect2() {
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('difficultySelect').classList.add('hidden');
    document.getElementById('teamSelect1').classList.add('hidden');
    document.getElementById('teamSelect2').classList.remove('hidden');
    document.getElementById('jerseySelect').classList.add('hidden');
    
    // Create team grid for step 2 (exclude player team)
    const teamGrid2 = document.getElementById('teamGrid2');
    if (teamGrid2) {
        teamGrid2.innerHTML = '';
        TEAMS.forEach(team => {
            if (team.code !== playerTeam.code) {
                const btn = document.createElement('button');
                btn.className = 'btn team-btn';
                btn.style.cssText = `
                        display:flex;
                        flex-direction:column;
                        align-items:center;
                        justify-content:center;
                        gap:8px;
                        padding:12px 8px;
                        width:110px;
                        height:110px;
                        box-sizing:border-box;
                    `;
                btn.style.background = team.home.primary;
                btn.style.color = team.home.secondary;

                const flagUrl = `https://flagicons.lipis.dev/flags/4x3/${team.flag.toLowerCase()}.svg`;
                btn.innerHTML = `
                        <img src="${flagUrl}" alt="${team.code}" style="width:40px;height:30px;object-fit:cover;border-radius:3px;box-shadow:0 2px 4px rgba(0,0,0,0.3);">
                        <span style="font-weight:bold;font-size:1rem;">${team.code}</span>
                        <span style="font-size:0.7rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;">${team.name}</span>
                    `;
                btn.onclick = () => selectOpponentTeam(team);
                teamGrid2.appendChild(btn);
            }
        });
    }
}

function selectOpponentTeam(team) {
    opponentTeam = team;
    showJerseySelect();
}

function showJerseySelect() {
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('difficultySelect').classList.add('hidden');
    document.getElementById('teamSelect1').classList.add('hidden');
    document.getElementById('teamSelect2').classList.add('hidden');
    document.getElementById('jerseySelect').classList.remove('hidden');
    
    // Update team names
    document.getElementById('homeTeamName').textContent = playerTeam.name;
    document.getElementById('awayTeamName').textContent = opponentTeam.name;
    
    // Update jersey button styles
    updateJerseyButtons();
}

function setHomeJersey(type) {
    homeJerseyType = type;
    updateJerseyButtons();
}
window.setHomeJersey = setHomeJersey;

function setAwayJersey(type) {
    awayJerseyType = type;
    updateJerseyButtons();
}
window.setAwayJersey = setAwayJersey;

function updateJerseyButtons() {
    // Home team buttons
    const homeBtnHome = document.getElementById('homeJerseyHome');
    const homeBtnAway = document.getElementById('homeJerseyAway');
    if (homeBtnHome && homeBtnAway && playerTeam) {
        homeBtnHome.style.background = homeJerseyType === 'home' ? playerTeam.home.primary : '#1a1a1a';
        homeBtnHome.style.color = homeJerseyType === 'home' ? playerTeam.home.secondary : '#aaa';
        homeBtnAway.style.background = homeJerseyType === 'away' ? playerTeam.away.primary : '#1a1a1a';
        homeBtnAway.style.color = homeJerseyType === 'away' ? playerTeam.away.secondary : '#aaa';
    }
    
    // Away team buttons
    const awayBtnHome = document.getElementById('awayJerseyHome');
    const awayBtnAway = document.getElementById('awayJerseyAway');
    if (awayBtnHome && awayBtnAway && opponentTeam) {
        awayBtnHome.style.background = awayJerseyType === 'home' ? opponentTeam.home.primary : '#1a1a1a';
        awayBtnHome.style.color = awayJerseyType === 'home' ? opponentTeam.home.secondary : '#aaa';
        awayBtnAway.style.background = awayJerseyType === 'away' ? opponentTeam.away.primary : '#1a1a1a';
        awayBtnAway.style.color = awayJerseyType === 'away' ? opponentTeam.away.secondary : '#aaa';
    }
}

function startGameFromSetup() {
    // Set the jersey types for game
    playerJersey = homeJerseyType; // Used in player rendering
    startGame();
}
window.startGameFromSetup = startGameFromSetup;

function showControls() {
    const panel = document.getElementById('controlsPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// Legacy function - not used in new flow
function selectTeam(team) {
    playerTeam = team;
    opponentTeam = TEAMS[Math.floor(Math.random() * TEAMS.length)];
    startGame();
}

function setDifficulty(diff) {
    aiDifficulty = diff;
    // Update button styles
    document.getElementById('diffPassive').style.background = diff === 'PASSIVE' ? 'linear-gradient(180deg,#ffd700 0%,#cc9900 100%)' : 'linear-gradient(180deg,#c41e3a 0%,#8b0000 100%)';
    document.getElementById('diffPassive').style.borderColor = diff === 'PASSIVE' ? '#fff' : '#ffd700';
    document.getElementById('diffEasy').style.background = diff === 'EASY' ? 'linear-gradient(180deg,#ffd700 0%,#cc9900 100%)' : 'linear-gradient(180deg,#c41e3a 0%,#8b0000 100%)';
    document.getElementById('diffEasy').style.borderColor = diff === 'EASY' ? '#fff' : '#ffd700';
    document.getElementById('diffMedium').style.background = diff === 'MEDIUM' ? 'linear-gradient(180deg,#ffd700 0%,#cc9900 100%)' : 'linear-gradient(180deg,#c41e3a 0%,#8b0000 100%)';
    document.getElementById('diffMedium').style.borderColor = diff === 'MEDIUM' ? '#fff' : '#ffd700';
    document.getElementById('diffHard').style.background = diff === 'HARD' ? 'linear-gradient(180deg,#ffd700 0%,#cc9900 100%)' : 'linear-gradient(180deg,#c41e3a 0%,#8b0000 100%)';
    document.getElementById('diffHard').style.borderColor = diff === 'HARD' ? '#fff' : '#ffd700';
}

// Expose functions to window for HTML onclick handlers
window.showDifficultySelect = showDifficultySelect;
window.showTeamSelect1 = showTeamSelect1;
window.showTeamSelect2 = showTeamSelect2;
window.showJerseySelect = showJerseySelect;
window.setDifficultyAndNext = setDifficultyAndNext;
