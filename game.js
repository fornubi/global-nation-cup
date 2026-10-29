// Game Configuration - REALISTIC FIELD SIZE (TALLER FIELD)
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 700;
const FIELD_MARGIN_X = 50;
const FIELD_MARGIN_Y = 50;
const FIELD_WIDTH = 900;
const FIELD_HEIGHT = 1000;  // Taller field - more space between teams
const GOAL_WIDTH = 140;
const GOAL_DEPTH = 30;

// Camera system
let playerControlledPuppet = null;

// Teams data - loaded from teams.json
let TEAMS = [];
let playerJersey = 'home'; // 'home' or 'away'

// Game state
let canvas, ctx;
let gameState = 'MENU';
let playerTeam = null;
let opponentTeam = null;
let homeScore = 0;
let awayScore = 0;
let gameTime = 0;
let maxTime = 240; // 4 minutes in seconds (2 halves of 2 minutes each)

// Match periods
let matchPeriod = 'FIRST_HALF'; // FIRST_HALF | SECOND_HALF | ET_FIRST | ET_SECOND | PENALTIES
let pendingBreakNext = null;
let breakTimeout = null;
let breakHandled = false;

// Penalty shootout state
let penaltyState = 'IDLE'; // IDLE | AIM | SHOT | RESULT
let penaltyShots = []; // {team, scored}
let penaltyHomeGoals = 0;
let penaltyAwayGoals = 0;
let penaltyKickTeam = 'HOME';
let penaltyAimX = 500;
let penaltyAimTimer = 0;
let penaltyShotX = 500;
let penaltyShotZone = null;
let penaltyKeeperDive = 'CENTER';
let penaltyShotFrame = 0;
let penaltyResultTimer = 0;
let penaltyResultText = '';
let penaltySuddenDeath = false;
let penaltyWinTeam = null;
let lastTime = 0;
let ball = null;
let players = [];
let keys = {};
let camera = { x: FIELD_MARGIN_X + FIELD_WIDTH / 2 - CANVAS_WIDTH / 2, y: FIELD_MARGIN_Y + FIELD_HEIGHT / 2 - CANVAS_HEIGHT / 2 };
let homePlayers = [];
let controlledIndex = 0;
let isSprinting = false;
let messageTimer = null;
let gameInterval = null;
let isScoringGoal = false;
let aiDifficulty = 'MEDIUM'; // PASSIVE, EASY, MEDIUM, HARD
let kickoffActive = false; // Players frozen until ball is kicked
let nextKickoffTeam = 'HOME'; // Team that will kickoff next (switches after goals)
let pressingPlayer = null; // Current player pressing the ball holder (global for debugging)
let pressingTimer = 0; // Timer to alternate pressing player (global for debugging)
let pressingPlayerByTeam = { HOME: null, AWAY: null }; // Per-team pressing players
let pressingTimerByTeam = { HOME: 0, AWAY: 0 }; // Per-team timers
let ballOutActive = false; // Ball is out of bounds
let ballOutType = null; // 'THROW_IN', 'GOAL_KICK', or 'CORNER_KICK'
let ballOutTeam = null; // Team that will take the throw-in/goal kick/corner
let lastTouchTeam = 'HOME'; // Track last team to touch the ball globally
let cornerKickImmunity = 0; // Immunity from goal detection after corner kick

// Goal replay system
let replayMode = false;
let replayFrames = [];
let replayIndex = 0;
let replayRecording = true;
const MAX_REPLAY_FRAMES = 300; // 5 seconds at 60fps

// Game controller support
let gamepadIndex1 = null;
let gamepadIndex2 = null;
let gamepadConnected1 = false;
let gamepadConnected2 = false;

// Separate gamepad input states to avoid conflicts
let gamepad1Input = { up: false, down: false, left: false, right: false, x: false, d: false, a: false, q: false, e: false, r: false };
let gamepad2Input = { up: false, down: false, left: false, right: false, i: false, k: false, j: false, u: false, l: false, r: false };

// Track previous gamepad button states for edge-triggering actions
let gamepadPrev1 = { x: false, d: false, a: false, q: false };
let gamepadPrev2 = { i: false, k: false, j: false, u: false };

// Game mode: 'PvAI' (Player vs AI) or 'PvP' (Player vs Player)
let gameMode = 'PvAI';

// Player classes
class Ball {
    constructor() {
        this.x = FIELD_MARGIN_X + FIELD_WIDTH / 2;
        this.y = FIELD_MARGIN_Y + FIELD_HEIGHT / 2;
        this.vx = 0;
        this.vy = 0;
        this.radius = 10;  // Larger ball for better visibility
        this.z = 0;
        this.vz = 0;
        this.owner = null;
    }

    update() {
        // Physics
        if (!this.owner) {
            this.x += this.vx;
            this.y += this.vy;

            // Z-axis physics (height)
            this.z += this.vz;
            this.vz -= 0.3; // Gravity
            if (this.z < 0) {
                this.z = 0;
                this.vz = -this.vz * 0.5; // Bounce with energy loss
                if (Math.abs(this.vz) < 0.5) this.vz = 0; // Stop bouncing if too slow
            }

            // Friction
            this.vx *= 0.98;
            this.vy *= 0.98;

            // Stop if very slow
            if (Math.abs(this.vx) < 0.1) this.vx = 0;
            if (Math.abs(this.vy) < 0.1) this.vy = 0;
        } else {
            // Ball follows owner with offset
            this.x = this.owner.x + Math.cos(this.owner.angle) * 15;
            this.y = this.owner.y + Math.sin(this.owner.angle) * 15;
            this.vx = 0;
            this.vy = 0;
            this.z = 0;
            this.vz = 0;
        }

        // Decrement corner kick immunity
        if (cornerKickImmunity > 0) cornerKickImmunity--;

        // Field boundaries - check for ball out
        if (this.x < FIELD_MARGIN_X - this.radius || this.x > FIELD_MARGIN_X + FIELD_WIDTH + this.radius ||
            this.y < FIELD_MARGIN_Y - this.radius || this.y > FIELD_MARGIN_Y + FIELD_HEIGHT + this.radius) {
            // Ball is out of bounds
            this.checkBallOut();
        }

        // Goal detection (vertical orientation)
        this.checkGoal();
    }

    checkGoal() {
        const goalLeft = FIELD_MARGIN_X + (FIELD_WIDTH - GOAL_WIDTH) / 2;
        const goalRight = goalLeft + GOAL_WIDTH;
        const goalHeight = 50; // Maximum height for a goal (crossbar height)

        // Skip goal detection if corner kick immunity is active
        if (cornerKickImmunity > 0) return;

        // Top goal (HOME)
        // Ball must be within goal area (x between goal posts, y within goal depth, OUTSIDE field)
        if (this.y < FIELD_MARGIN_Y && this.y > FIELD_MARGIN_Y - GOAL_DEPTH && 
            this.x > goalLeft && this.x < goalRight && !isScoringGoal) {
            // Check if ball is within goal height (above ground but below crossbar)
            if (this.z < goalHeight && this.z >= 0) {
                if (Math.abs(this.vy) > 1 || this.owner) {
                    isScoringGoal = true;
                    scoreGoal('HOME');
                }
            }
        }

        // Bottom goal (AWAY)
        // Ball must be within goal area (x between goal posts, y within goal depth, OUTSIDE field)
        if (this.y > FIELD_MARGIN_Y + FIELD_HEIGHT && this.y < FIELD_MARGIN_Y + FIELD_HEIGHT + GOAL_DEPTH && 
            this.x > goalLeft && this.x < goalRight && !isScoringGoal) {
            // Check if ball is within goal height (above ground but below crossbar)
            if (this.z < goalHeight && this.z >= 0) {
                if (Math.abs(this.vy) > 1 || this.owner) {
                    isScoringGoal = true;
                    scoreGoal('AWAY');
                }
            }
        }
    }

    checkBallOut() {
        if (ballOutActive) return; // Already processing ball out

        const goalLeft = FIELD_MARGIN_X + (FIELD_WIDTH - GOAL_WIDTH) / 2;
        const goalRight = goalLeft + GOAL_WIDTH;
        const goalHeight = 50; // Same as checkGoal

        // Check if ball went through goal area
        const inGoalAreaX = this.x > goalLeft && this.x < goalRight;
        const inGoalAreaYTop = this.y < FIELD_MARGIN_Y && this.y > FIELD_MARGIN_Y - GOAL_DEPTH;
        const inGoalAreaYBottom = this.y > FIELD_MARGIN_Y + FIELD_HEIGHT && this.y < FIELD_MARGIN_Y + FIELD_HEIGHT + GOAL_DEPTH;
        const inGoalHeight = this.z < goalHeight && this.z >= 0;

        // If ball is in goal area AND within goal height, it's a goal (handled by checkGoal)
        // If ball is in goal area BUT above goal height, it's a ball out (corner kick)
        // If ball is outside goal area, it's a ball out (throw-in or corner kick)
        
        // Skip ball out detection only if it's actually a goal
        if ((inGoalAreaYTop || inGoalAreaYBottom) && inGoalAreaX && inGoalHeight) {
            return; // This is a goal, handled by checkGoal
        }

        // Determine out type and which team gets the ball
        // Use global lastTouchTeam to determine who gets the throw-in/corner
        console.log(`Ball out detected: lastTouchTeam=${lastTouchTeam}, ball.x=${this.x.toFixed(0)}, ball.y=${this.y.toFixed(0)}`);
        
        // Determine if it's a corner kick, goal kick, or throw-in
        // Corner kick: ball went out on goal line, last touched by defending team → attacking team gets corner
        // Goal kick: ball went out on goal line, last touched by attacking team → defending team gets goal kick
        // Throw-in: ball went out on sideline (left or right)
        if (this.y < FIELD_MARGIN_Y || this.y > FIELD_MARGIN_Y + FIELD_HEIGHT) {
            // Ball went out on goal line
            const isTopGoalLine = this.y < FIELD_MARGIN_Y;
            // HOME defends BOTTOM goal (HOME GK at y = FIELD_MARGIN_Y + FIELD_HEIGHT - 50)
            // AWAY defends TOP goal (AWAY GK at y = FIELD_MARGIN_Y + 50)
            const defendingTeam = isTopGoalLine ? 'AWAY' : 'HOME'; // Team that defends this goal
            const attackingTeam = isTopGoalLine ? 'HOME' : 'AWAY'; // Team that attacks this goal
            
            if (lastTouchTeam === defendingTeam) {
                // Defending team touched it last → attacking team gets corner kick
                ballOutType = 'CORNER_KICK';
                ballOutTeam = attackingTeam;
            } else {
                // Attacking team touched it last → defending team gets goal kick
                ballOutType = 'GOAL_KICK';
                ballOutTeam = defendingTeam;
            }
        } else {
            // Ball went out on sideline - throw-in
            ballOutType = 'THROW_IN';
            // Opponent of last touch gets throw-in
            ballOutTeam = lastTouchTeam === 'HOME' ? 'AWAY' : 'HOME';
        }
        
        console.log(`Ball out result: type=${ballOutType}, team=${ballOutTeam}, gameMode=${gameMode}`);

        ballOutActive = true;

        // Stop the ball
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;
        this.owner = null;

        // Setup throw-in or corner kick
        setupBallOut();
    }

    kick(vx, vy, power = 1, vz = 0) {
        // Track last touch team before releasing ball
        if (this.owner) {
            lastTouchTeam = this.owner.team;
        }
        
        this.owner = null;
        this.vx = vx * power;
        this.vy = vy * power;
        this.vz = vz;
        
        // Ball in - end ball out state when ball is kicked
        ballOutActive = false;
        ballOutType = null;
        ballOutTeam = null;
    }

    draw(ctx) {
        const x = this.x - camera.x;
        const y = this.y - camera.y;
        const r = this.radius;
        const ballY = y - this.z;

        // Shadow (dynamic based on height)
        const shadowScale = Math.max(0.5, 1 - this.z / 50);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(x, y + 2, r * shadowScale, r * 0.5 * shadowScale, 0, 0, Math.PI * 2);
        ctx.fill();

        // White base ball
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, ballY, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Black pentagons pattern - classic soccer ball
        ctx.fillStyle = '#111';
        const pentSize = r * 0.35;

        // Center pentagon
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
            const px = x + Math.cos(angle) * pentSize;
            const py = ballY + Math.sin(angle) * pentSize;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        // Surrounding pentagons (5 around center)
        const surroundDist = r * 0.65;
        for (let i = 0; i < 5; i++) {
            const baseAngle = (i * 2 * Math.PI / 5) - Math.PI / 2;
            const cx = x + Math.cos(baseAngle) * surroundDist;
            const cy = ballY + Math.sin(baseAngle) * surroundDist;

            ctx.beginPath();
            for (let j = 0; j < 5; j++) {
                const angle = (j * 2 * Math.PI / 5) - Math.PI / 2 + baseAngle * 0.3;
                const px = cx + Math.cos(angle) * (pentSize * 0.7);
                const py = cy + Math.sin(angle) * (pentSize * 0.7);
                if (j === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
        }

        // Highlight for 3D effect
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(x - r * 0.3, ballY - r * 0.3, r * 0.25, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Player {
    constructor(team, isPlayerControlled, x, y, number) {
        this.team = team;
        this.isPlayerControlled = isPlayerControlled;
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.speed = isPlayerControlled ? 2.5 : 2;
        this.sprintSpeed = isPlayerControlled ? 3.6 : 2.8;
        this.angle = 0;
        this.number = number;
        this.hasBall = false;
        this.tackleCooldown = 0;
        this.sliding = false;
        this.slideCooldown = 0;
        this.slideTimer = 0;
        this.state = 'IDLE'; // IDLE, CHASE, DEFEND, ATTACK
        this.startX = x;
        this.startY = y;
        this.actionCooldown = 0;
        this.ballHoldTime = 0; // Track how long AI has held the ball
        this.ballOutImmunity = 0; // Immunity from recapturing ball after kick
    }

    update() {
        if (this.tackleCooldown > 0) this.tackleCooldown--;
        if (this.slideCooldown > 0) this.slideCooldown--;
        if (this.actionCooldown > 0) this.actionCooldown--;
        if (this.ballOutImmunity > 0) this.ballOutImmunity--;

        // Track ball hold time for AI
        if (ball.owner === this && !this.isPlayerControlled) {
            this.ballHoldTime++;
        } else {
            this.ballHoldTime = 0;
        }

        if (this.sliding) {
            this.slideTimer++;
            if (this.slideTimer > 120 || this.slideCooldown > 0) {
                this.sliding = false;
            } else {
                // Slide momentum
                this.vx *= 1.05;
                this.vy *= 1.05;
            }
        }

        // Kickoff mode: player/AI with ball can move, others frozen
        if (kickoffActive) {
            if (ball.owner === this) {
                // Player/AI with ball can move freely during kickoff
                if (this.isPlayerControlled) {
                    this.handleInput();
                } else {
                    // AI with ball during kickoff - just wait a moment then kick
                    if (this.slideCooldown === 0 && this.actionCooldown === 0) {
                        this.aiKickoffKick();
                    }
                }
                // End kickoff if ball holder moves significantly
                if (Math.abs(this.vx) > 0.5 || Math.abs(this.vy) > 0.5) {
                    kickoffActive = false;
                }
            } else {
                // All other players frozen during kickoff
                this.vx = 0;
                this.vy = 0;
            }
        } else {
            if (this.isPlayerControlled) {
                this.handleInput();
            } else {
                this.aiUpdate();
            }
        }

        // Apply velocity
        this.x += this.vx;
        this.y += this.vy;

        // Update angle based on movement (only for AI-controlled players)
        // Player-controlled players have their angle set in handleInput()
        if (!this.isPlayerControlled && (this.vx !== 0 || this.vy !== 0)) {
            this.angle = Math.atan2(this.vy, this.vx);
        }

        // Boundaries - use field height not canvas height
        this.x = Math.max(FIELD_MARGIN_X + 15, Math.min(FIELD_MARGIN_X + FIELD_WIDTH - 15, this.x));
        this.y = Math.max(FIELD_MARGIN_Y + 15, Math.min(FIELD_MARGIN_Y + FIELD_HEIGHT - 15, this.y));

        // Ball interaction
        this.checkBallCollision();
    }

    handleInput() {
        let speed = (keys['ShiftLeft'] || keys['ShiftRight'] || keys['KeyE'] || gamepad1Input.e) ? this.sprintSpeed : this.speed;
        this.vx = 0;
        this.vy = 0;

        // Player 1 (HOME) controls - Arrow keys OR Gamepad 1
        if (this.team === 'HOME' && this.isPlayerControlled) {
            // Keyboard input
            if (keys['ArrowUp'] || gamepad1Input.up) this.vy = -speed;
            if (keys['ArrowDown'] || gamepad1Input.down) this.vy = speed;
            if (keys['ArrowLeft'] || gamepad1Input.left) this.vx = -speed;
            if (keys['ArrowRight'] || gamepad1Input.right) this.vx = speed;

            // Update angle based on INPUT direction (not just velocity)
            // This allows diagonal passing even when standing still
            let inputVx = 0, inputVy = 0;
            if (keys['ArrowUp'] || gamepad1Input.up) inputVy = -1;
            if (keys['ArrowDown'] || gamepad1Input.down) inputVy = 1;
            if (keys['ArrowLeft'] || gamepad1Input.left) inputVx = -1;
            if (keys['ArrowRight'] || gamepad1Input.right) inputVx = 1;
            
            // ALWAYS update angle based on input, not velocity
            if (inputVx !== 0 || inputVy !== 0) {
                this.angle = Math.atan2(inputVy, inputVx);
            }

            // Short pass Z, long pass X, shoot C
            if ((keys['KeyZ'] || gamepad1Input.x) && ball.owner === this) {
                this.shortPass();
                keys['KeyZ'] = false;
                gamepad1Input.x = false;
                if (kickoffActive) kickoffActive = false;
            }
            if (keys['KeyX'] || gamepad1Input.d) {
                if (ball.owner === this) {
                    this.longPass();
                    keys['KeyX'] = false;
                    gamepad1Input.d = false;
                    if (kickoffActive) kickoffActive = false;
                } else if (this.slideCooldown === 0) {
                    this.slide();
                }
            }
            if ((keys['KeyC'] || gamepad1Input.a) && ball.owner === this) {
                this.shoot();
                keys['KeyC'] = false;
                gamepad1Input.a = false;
                if (kickoffActive) kickoffActive = false;
            }
        }
        
        // Player 2 (AWAY) controls - WASD keys OR Gamepad 2 (PvP mode only)
        if (this.team === 'AWAY' && this.isPlayerControlled && gameMode === 'PvP') {
            let speed2 = (keys['KeyL'] || gamepad2Input.l) ? this.sprintSpeed : this.speed;
            
            // Keyboard input
            if (keys['KeyW'] || gamepad2Input.up) this.vy = -speed2;
            if (keys['KeyS'] || gamepad2Input.down) this.vy = speed2;
            if (keys['KeyA'] || gamepad2Input.left) this.vx = -speed2;
            if (keys['KeyD'] || gamepad2Input.right) this.vx = speed2;

            // Update angle based on INPUT direction (not just velocity)
            // This allows diagonal passing even when standing still
            let inputVx = 0, inputVy = 0;
            if (keys['KeyW'] || gamepad2Input.up) inputVy = -1;
            if (keys['KeyS'] || gamepad2Input.down) inputVy = 1;
            if (keys['KeyA'] || gamepad2Input.left) inputVx = -1;
            if (keys['KeyD'] || gamepad2Input.right) inputVx = 1;
            
            // ALWAYS update angle based on input, not velocity
            if (inputVx !== 0 || inputVy !== 0) {
                this.angle = Math.atan2(inputVy, inputVx);
            }

            // Short pass I, long pass K, shoot J
            if ((keys['KeyI'] || gamepad2Input.i) && ball.owner === this) {
                this.shortPass();
                keys['KeyI'] = false;
                gamepad2Input.i = false;
                if (kickoffActive) kickoffActive = false;
            }
            if (keys['KeyK'] || gamepad2Input.k) {
                if (ball.owner === this) {
                    this.longPass();
                    keys['KeyK'] = false;
                    gamepad2Input.k = false;
                    if (kickoffActive) kickoffActive = false;
                } else if (this.slideCooldown === 0) {
                    this.slide();
                }
            }
            if ((keys['KeyJ'] || gamepad2Input.j) && ball.owner === this) {
                this.shoot();
                keys['KeyJ'] = false;
                gamepad2Input.j = false;
                if (kickoffActive) kickoffActive = false;
            }

        }
    }

    aiUpdate() {
        // Skip AI for player-controlled players
        if (this.isPlayerControlled) return;
        
        // In PvP mode, AWAY team players that are NOT player-controlled still use AI
        // Only skip AI for the specific AWAY player that Player 2 is controlling
        
        // Determine game state and role-based behavior
        const gameState = this.getGameState();
        const role = this.getRole();
        
        // AI throw-in/corner kick logic
        if (ball.owner === this && !this.isPlayerControlled && ballOutActive) {
            this.aiBallOutKick();
            return; // Skip normal AI update during ball out
        }
        
        // PRESSING SYSTEM: When opponent has ball, closest player presses (per-team)
        // Only AI team (AWAY) does pressing, human team (HOME) does not
        if (ball.owner && ball.owner.team !== this.team && this.team === 'AWAY') {
            const myTeamPlayers = players.filter(p => p.team === this.team && p.number !== 1); // Exclude GK
            const opponentWithBall = ball.owner;
            
            // Find closest teammate to ball holder
            let closest = null;
            let minDist = Infinity;
            myTeamPlayers.forEach(p => {
                const dist = Math.sqrt((p.x - opponentWithBall.x) ** 2 + (p.y - opponentWithBall.y) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    closest = p;
                }
            });
            
            // Update pressing player every 3 seconds (180 frames) or if pressing player is too far
            pressingTimerByTeam[this.team]++;
            const currentPresser = pressingPlayerByTeam[this.team];
            const shouldSwitchPresser = pressingTimerByTeam[this.team] > 180 || 
                (currentPresser && Math.sqrt((currentPresser.x - opponentWithBall.x) ** 2 + (currentPresser.y - opponentWithBall.y) ** 2) > 250);
            
            if (shouldSwitchPresser && closest) {
                pressingPlayerByTeam[this.team] = closest;
                pressingTimerByTeam[this.team] = 0;
                // Also update global for visual indicator
                pressingPlayer = closest;
            }
        } else if (!ball.owner || ball.owner.team === this.team) {
            // Reset pressing when we have ball or ball is loose
            pressingPlayerByTeam[this.team] = null;
            pressingTimerByTeam[this.team] = 0;
            // Also reset global if this was the global presser
            if (pressingPlayer && pressingPlayer.team === this.team) {
                pressingPlayer = null;
            }
        }
        
        // If this is the pressing player, actively chase ball holder (overrides normal target)
        let target;
        if (pressingPlayerByTeam[this.team] === this && ball.owner && ball.owner.team !== this.team) {
            // Chase ball holder directly for tackling
            target = { x: ball.owner.x, y: ball.owner.y };
            // Add slight randomness to make it feel more natural
            target.x += (Math.random() - 0.5) * 20;
            target.y += (Math.random() - 0.5) * 20;
        } else if (!ball.owner && this.team === 'AWAY') {
            // Ball is loose - closest AWAY player should chase it
            const myTeamPlayers = players.filter(p => p.team === this.team);
            let closest = null;
            let minDist = Infinity;
            myTeamPlayers.forEach(p => {
                const dist = Math.sqrt((p.x - ball.x) ** 2 + (p.y - ball.y) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    closest = p;
                }
            });
            
            if (closest === this) {
                // This is the closest player - chase the ball
                target = { x: ball.x, y: ball.y };
            } else {
                target = this.getSmartTarget(gameState, role);
            }
        } else {
            target = this.getSmartTarget(gameState, role);
        }

        // Difficulty-based AI parameters
        let speedMult, reactDist, trackingMult;
        if (aiDifficulty === 'PASSIVE') {
            speedMult = 0.4; reactDist = 60; trackingMult = 0.08;
        } else if (aiDifficulty === 'EASY') {
            speedMult = 0.65; reactDist = 100; trackingMult = 0.15;
        } else if (aiDifficulty === 'MEDIUM') {
            speedMult = 0.82; reactDist = 130; trackingMult = 0.2;
        } else { // HARD
            speedMult = 0.95; reactDist = 160; trackingMult = 0.25;
        }

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Movement with formation keeping
        if (dist > 8) {
            let speed = ball.owner === this ? this.sprintSpeed * 0.85 * speedMult : this.speed * speedMult;

            // Pressing player gets speed boost to chase ball holder
            if (pressingPlayerByTeam[this.team] === this && ball.owner && ball.owner.team !== this.team) {
                speed *= 1.3; // 30% faster when pressing
            } else {
                // Formation keeping: slower when far from assigned position during defense
                if (gameState === 'DEFEND' && ball.owner?.team !== this.team) {
                    const formationDist = Math.sqrt((this.x - this.startX) ** 2 + (this.y - this.startY) ** 2);
                    if (formationDist > 150) speed *= 0.6; // Stay in formation
                }
            }

            this.vx = (dx / dist) * speed;
            this.vy = (dy / dist) * speed;
            this.angle = Math.atan2(this.vy, this.vx);
        } else {
            this.vx *= 0.8;
            this.vy *= 0.8;
        }

        // Smart AI actions
        if (ball.owner === this && this.actionCooldown === 0) {
            this.makeSmartDecision(role, gameState);
        }
    }

    getRole() {
        if (this.number === 1) return 'GK';
        if (this.number <= 5) return 'DEF';
        if (this.number <= 9) return 'MID';
        return 'FWD';
    }

    getGameState() {
        if (!ball.owner) return 'LOOSE';
        if (ball.owner.team === this.team) return 'ATTACK';

        // Check if opponent is in our half
        const ourGoalY = this.team === 'HOME' ? FIELD_MARGIN_Y + FIELD_HEIGHT : FIELD_MARGIN_Y;
        const ballY = ball.y;
        const ourHalf = this.team === 'HOME'
            ? ballY > FIELD_MARGIN_Y + FIELD_HEIGHT / 2
            : ballY < FIELD_MARGIN_Y + FIELD_HEIGHT / 2;

        return ourHalf ? 'DEFEND' : 'PRESS';
    }

    getSmartTarget(gameState, role) {
        const goalY = this.team === 'HOME' ? FIELD_MARGIN_Y : FIELD_MARGIN_Y + FIELD_HEIGHT;
        const ourGoalY = this.team === 'HOME' ? FIELD_MARGIN_Y + FIELD_HEIGHT : FIELD_MARGIN_Y;

        // ATTACK: Move toward opponent goal with role-based positioning
        if (gameState === 'ATTACK') {
            let target;
            if (role === 'GK') {
                // GK stays near goal but moves up slightly
                target = { x: this.startX, y: ourGoalY + (this.team === 'HOME' ? -100 : 100) };
            } else if (role === 'DEF') {
                // Defenders stay in defensive positions even with ball - pass forward instead of dribbling
                // Stay behind their starting position to maintain defensive shape
                const defensiveY = this.team === 'HOME' ? this.startY - 50 : this.startY + 50;
                target = { x: this.startX, y: defensiveY };
            } else if (role === 'MID') {
                // Midfielders support attack from middle with some randomness
                const attackY = this.team === 'HOME' ? ball.y - 100 : ball.y + 100;
                target = {
                    x: FIELD_MARGIN_X + FIELD_WIDTH / 2 + (this.startX - FIELD_MARGIN_X - FIELD_WIDTH / 2) * 0.5 + (Math.random() - 0.5) * 80,
                    y: attackY + (Math.random() - 0.5) * 40
                };
            } else if (role === 'FWD') {
                // Forwards rush to goal area with more randomness
                const targetY = goalY + (this.team === 'HOME' ? 120 : -120);
                const targetX = ball.x + (Math.random() - 0.5) * 120;
                target = { x: Math.max(FIELD_MARGIN_X + 100, Math.min(FIELD_MARGIN_X + FIELD_WIDTH - 100, targetX)), y: targetY };
            } else {
                target = { x: this.startX, y: this.startY };
            }

            // Obstacle avoidance: if there's an opponent nearby, adjust target to avoid them
            if (role !== 'GK') {
                let avoidX = 0;
                let avoidY = 0;
                players.forEach(p => {
                    if (p.team !== this.team) {
                        const dx = this.x - p.x;
                        const dy = this.y - p.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < 60) {
                            // Push away from nearby opponent
                            const pushStrength = (60 - dist) / 60;
                            avoidX += (dx / dist) * pushStrength * 100;
                            avoidY += (dy / dist) * pushStrength * 100;
                        }
                    }
                });
                target.x += avoidX;
                target.y += avoidY;
            }

            return target;
        }

        // DEFEND: Return to formation positions
        if (gameState === 'DEFEND') {
            if (role === 'GK') return { x: this.startX, y: this.startY };

            // Others defend with priority based on role
            const ballDist = Math.sqrt((ball.x - this.x) ** 2 + (ball.y - this.y) ** 2);

            // Only closest players chase the ball
            if (ballDist < 120 && (role === 'DEF' || (role === 'MID' && ballDist < 80))) {
                return { x: ball.x, y: ball.y };
            }

            // Stay in formation but shift toward ball side
            const shiftX = (ball.x - (FIELD_MARGIN_X + FIELD_WIDTH / 2)) * 0.3;
            return { x: this.startX + shiftX, y: this.startY };
        }

        // PRESS: Defend high up the field
        if (gameState === 'PRESS') {
            const pressY = ball.y + (this.team === 'HOME' ? 80 : -80);
            if (role === 'FWD' || role === 'MID') {
                return { x: ball.x + (this.startX - ball.x) * 0.3, y: pressY };
            }
            return { x: this.startX, y: this.startY };
        }

        // LOOSE: Chase ball if close, otherwise formation
        if (gameState === 'LOOSE') {
            const ballDist = Math.sqrt((ball.x - this.x) ** 2 + (ball.y - this.y) ** 2);
            if (ballDist < 100) return { x: ball.x, y: ball.y };
            return { x: this.startX, y: this.startY };
        }

        return { x: this.startX, y: this.startY };
    }

    makeSmartDecision(role, gameState) {
        const goalY = this.team === 'HOME' ? FIELD_MARGIN_Y : FIELD_MARGIN_Y + FIELD_HEIGHT;
        const goalDist = Math.abs(goalY - this.y);
        const goalX = FIELD_MARGIN_X + FIELD_WIDTH / 2;
        const xDistFromCenter = Math.abs(this.x - goalX);

        // Difficulty-based decision probabilities (INCREASED to ensure AI actually does something)
        let shootProb, passProb;
        if (aiDifficulty === 'PASSIVE') {
            shootProb = 0.40; passProb = 0.35;
        } else if (aiDifficulty === 'EASY') {
            shootProb = 0.55; passProb = 0.45;
        } else if (aiDifficulty === 'MEDIUM') {
            shootProb = 0.70; passProb = 0.55;
        } else { // HARD
            shootProb = 0.85; passProb = 0.65;
        }

        // SHOOTING DECISIONS
        let shouldShoot = false;
        
        // Penalty area bonus: increase shooting probability when close to goal
        const inPenaltyArea = goalDist < 150 && xDistFromCenter < 120;
        const penaltyBonus = inPenaltyArea ? 1.5 : 1.0;

        // FWD: Shoot if in shooting range (relaxed conditions)
        if (role === 'FWD' && goalDist < 300 && xDistFromCenter < 200) {
            shouldShoot = Math.random() < (shootProb * penaltyBonus);
        }
        // MID: Shoot if in good position
        else if (role === 'MID' && goalDist < 250 && xDistFromCenter < 150) {
            shouldShoot = Math.random() < (shootProb * 0.8 * penaltyBonus);
        }
        // DEF: Shoot if close to goal
        else if (role === 'DEF' && goalDist < 180 && xDistFromCenter < 100) {
            shouldShoot = Math.random() < (shootProb * 0.5 * penaltyBonus);
        }

        // GK: Never shoot, always pass
        if (role === 'GK') {
            shouldShoot = false;
        }

        // Check for defenders blocking (simple check)
        let defendersBlocking = 0;
        players.forEach(p => {
            if (p.team !== this.team) {
                const dy = Math.abs(p.y - this.y);
                const dx = Math.abs(p.x - this.x);
                if (dy < 60 && dx < 50) defendersBlocking++; // Tighter check
            }
        });

        // Reduce shooting chance only if heavily blocked (2+ defenders very close)
        if (defendersBlocking >= 2) shouldShoot = false;

        // PASSING DECISIONS
        let shouldPass = false;

        // GK: Always pass immediately - never hold the ball
        if (role === 'GK') {
            shouldPass = true; // 100% chance to pass immediately
        }
        // DEF: Pass very quickly to avoid being pressed
        else if (role === 'DEF') {
            shouldPass = Math.random() < (passProb * 4.0); // Even higher chance for DEF
        }
        // Always consider pass if blocked or not in shooting position
        else if (defendersBlocking > 0 || goalDist > 250) {
            shouldPass = Math.random() < passProb;
        }
        // Pass if opponents are very close (avoid being tackled)
        else if (defendersBlocking > 0) {
            shouldPass = Math.random() < (passProb * 1.5); // Higher chance when blocked
        }
        // FWD with ball far from goal: look for pass
        else if (role === 'FWD' && goalDist > 180) {
            shouldPass = Math.random() < (passProb * 0.8);
        }
        // MID: Pass to maintain possession
        else if (role === 'MID' && Math.random() < (passProb * 0.8)) {
            shouldPass = true;
        }

        // Execute decision
        if (shouldShoot && !shouldPass) {
            this.shoot();
            this.actionCooldown = 45;
        } else if (shouldPass) {
            this.smartPass(role);
            // GK and DEF have shorter cooldown to pass quickly
            this.actionCooldown = (role === 'GK' || role === 'DEF') ? 10 : 55;
        } else if (this.ballHoldTime > (role === 'GK' ? 15 : (role === 'DEF' ? 30 : 60))) {
            // Fallback: if AI has been holding ball too long
            // GK: 15 frames (0.25 seconds), DEF: 30 frames (0.5 seconds), others: 60 frames (1 second)
            // GK always passes, never shoots
            if (role === 'GK') {
                this.smartPass(role);
                this.actionCooldown = 55;
            } else if (goalDist < 250 && xDistFromCenter < 180) {
                this.shoot();
                this.actionCooldown = 45;
            } else {
                this.smartPass(role);
                this.actionCooldown = 55;
            }
        } else {
            this.actionCooldown = 15;
        }
    }

    smartPass(role) {
        if (ball.owner !== this) return;

        // GK: Always kick forward, away from own goal
        if (role === 'GK') {
            // HOME goal is at BOTTOM, so HOME GK kicks UP (toward FIELD_MARGIN_Y, away from bottom)
            // AWAY goal is at TOP, so AWAY GK kicks DOWN (toward FIELD_MARGIN_Y + FIELD_HEIGHT, away from top)
            const targetY = this.team === 'HOME' ? FIELD_MARGIN_Y + 200 : FIELD_MARGIN_Y + FIELD_HEIGHT - 200;
            const targetX = FIELD_MARGIN_X + FIELD_WIDTH / 2 + (Math.random() - 0.5) * 150;
            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const power = 8;
            ball.kick(dx / dist * power, dy / dist * power, 1.5);
            this.hasBall = false;
            this.ballOutImmunity = 30; // Add immunity for GK too
            return;
        }

        // Find best teammate to pass to
        let bestTarget = null;
        let bestScore = -Infinity;

        const goalY = this.team === 'HOME' ? FIELD_MARGIN_Y : FIELD_MARGIN_Y + FIELD_HEIGHT;

        players.forEach(p => {
            if (p.team === this.team && p !== this) {
                const dx = p.x - this.x;
                const dy = p.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 300 && dist > 30) { // Valid pass distance
                    let score = 0;

                    // Prefer forward passes
                    const forwardness = this.team === 'HOME' ? (this.y - p.y) : (p.y - this.y);
                    score += forwardness * 2;

                    // Prefer passes to better positioned players
                    const theirGoalDist = Math.abs(goalY - p.y);
                    score -= theirGoalDist * 0.5;

                    // Prefer less crowded players (check nearby opponents)
                    let nearbyOpponents = 0;
                    players.forEach(opp => {
                        if (opp.team !== this.team) {
                            const oppDist = Math.sqrt((opp.x - p.x) ** 2 + (opp.y - p.y) ** 2);
                            if (oppDist < 60) nearbyOpponents++;
                        }
                    });
                    score -= nearbyOpponents * 50;

                    // Role-based preferences
                    if (role === 'DEF') {
                        // Defenders prefer passing to MID
                        if (p.number >= 6 && p.number <= 9) score += 30;
                    } else if (role === 'MID') {
                        // Midfielders prefer passing to FWD or open MID
                        if (p.number >= 10) score += 40;
                    }

                    // Closer passes are safer
                    score -= dist * 0.3;

                    if (score > bestScore) {
                        bestScore = score;
                        bestTarget = p;
                    }
                }
            }
        });

        if (bestTarget) {
            const dx = bestTarget.x - this.x;
            const dy = bestTarget.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const power = Math.min(10, 5 + dist * 0.02);
            ball.kick(dx / dist * power, dy / dist * power, 1.1);
            this.hasBall = false;
        } else {
            // Fallback: if no valid pass target, just kick forward
            const kickDirection = this.team === 'HOME' ? -Math.PI / 2 : Math.PI / 2;
            this.angle = kickDirection;
            ball.kick(Math.cos(this.angle) * 6, Math.sin(this.angle) * 6, 1.1);
            this.hasBall = false;
        }
    }

    checkBallCollision() {
        const dx = ball.x - this.x;
        const dy = ball.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Need to be closer to get ball (reduced from 20 to 15)
        let collisionDist = 15;
        if (this.sliding) collisionDist = 20; // Better reach when sliding

        if (dist < collisionDist) {
            if (!ball.owner && this.tackleCooldown === 0) {
                // Check if this player has immunity from recapturing ball (just kicked it)
                if (this.ballOutImmunity > 0) {
                    console.log(`checkBallCollision: Player #${this.number} has immunity (${this.ballOutImmunity}), skipping ball pickup`);
                    return;
                }
                // Take possession
                ball.owner = this;
                this.hasBall = true;
                lastTouchTeam = this.team; // Track last team to touch ball
                console.log(`checkBallCollision: Player #${this.number} took ball ownership, lastTouchTeam=${lastTouchTeam}`);
            } else if (ball.owner && ball.owner.team !== this.team && this.tackleCooldown === 0) {
                // Cannot tackle goalkeeper (number 1) when they have the ball
                if (ball.owner.number === 1) return;
                
                // Tackle - enhanced if sliding
                let tackleChance = this.isPlayerControlled ? 0.4 : 0.15;
                if (this.sliding) tackleChance *= 2;
                if (Math.random() < tackleChance) {
                    ball.owner.tackleCooldown = 90;
                    ball.owner = this;
                    this.hasBall = true;
                    this.tackleCooldown = 45;
                    lastTouchTeam = this.team; // Track last team to touch ball
                    console.log(`checkBallCollision: Player #${this.number} tackled ball from #${ball.owner.number}, lastTouchTeam=${lastTouchTeam}`);
                }
            }
        }
    }

    shortPass() {
        if (ball.owner !== this) return;

        // GK should not use shortPass - use smartPass instead
        if (this.number === 1) {
            this.smartPass('GK');
            return;
        }

        // Kick ball in the direction player is facing (short range)
        const passDistance = 80;
        const power = 8; // Increased from 5 to 8
        const dx = Math.cos(this.angle) * passDistance;
        const dy = Math.sin(this.angle) * passDistance;
        
        ball.kick(Math.cos(this.angle) * power, Math.sin(this.angle) * power, 1.1);
        this.hasBall = false;
        
        // Add immunity so player can't immediately recapture ball
        this.ballOutImmunity = 30; // 0.5 second immunity
    }

    longPass() {
        if (ball.owner !== this) return;

        // GK should not use longPass - use smartPass instead
        if (this.number === 1) {
            this.smartPass('GK');
            return;
        }

        // Kick ball in the direction player is facing (long range with lob)
        const passDistance = 200;
        const power = 12; // Increased from 9 to 12
        const lobHeight = 8; // Z-velocity for lob effect
        
        ball.kick(Math.cos(this.angle) * power, Math.sin(this.angle) * power, 1.3, lobHeight);
        this.hasBall = false;
        
        // Add immunity so player can't immediately recapture ball
        this.ballOutImmunity = 30; // 0.5 second immunity
    }

    shoot() {
        if (ball.owner !== this) return;

        // GK should never shoot
        if (this.number === 1) {
            this.smartPass('GK');
            return;
        }

        // Vertical orientation: HOME shoots UP, AWAY shoots DOWN
        const goalX = FIELD_MARGIN_X + FIELD_WIDTH / 2;
        const goalY = this.team === 'HOME' ? FIELD_MARGIN_Y + 30 : FIELD_MARGIN_Y + FIELD_HEIGHT - 30;
        const dx = goalX - this.x + (Math.random() - 0.5) * 60;
        const dy = goalY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const power = Math.min(12, 8 + dist * 0.015);
        const lobHeight = 5; // Slight lob for shots
        
        ball.kick((dx / dist) * power, (dy / dist) * power, 1, lobHeight);
        this.hasBall = false;
        
        // Add immunity so player can't immediately recapture ball
        this.ballOutImmunity = 30; // 0.5 second immunity
    }

    slide() {
        if (this.slideCooldown > 0) return;
        this.sliding = true;
        this.slideTimer = 0;
        this.slideCooldown = 120; // 2 seconds cooldown
        // Boost velocity in current direction
        const slideSpeed = 5;
        this.vx = Math.cos(this.angle) * slideSpeed;
        this.vy = Math.sin(this.angle) * slideSpeed;
    }

    aiKickoffKick() {
        // AI kicks ball forward during kickoff (with small random delay for realism)
        if (ball.owner !== this) return;
        
        // Use a timer to delay kick slightly
        if (!this.kickoffDelay) {
            this.kickoffDelay = Math.floor(Math.random() * 30) + 30; // 0.5-1 second delay
        }
        this.kickoffDelay--;
        if (this.kickoffDelay > 0) return;
        
        // Set angle towards opponent goal
        // HOME shoots UP (negative Y), AWAY shoots DOWN (positive Y)
        const kickDirection = this.team === 'HOME' ? -Math.PI / 2 : Math.PI / 2;
        this.angle = kickDirection;
        
        // Short pass forward to start play
        const power = 4;
        ball.kick(Math.cos(this.angle) * power, Math.sin(this.angle) * power, 1.1);
        this.hasBall = false;
        
        // End kickoff and reset delay
        kickoffActive = false;
        this.kickoffDelay = null;
        this.actionCooldown = 30;
    }

    aiBallOutKick() {
        // AI kicks ball during throw-in, goal kick, or corner kick (with small random delay)
        if (ball.owner !== this) return;
        
        // Use a timer to delay kick slightly
        if (!this.ballOutDelay) {
            this.ballOutDelay = Math.floor(Math.random() * 20) + 20; // 0.3-0.7 second delay
        }
        this.ballOutDelay--;
        if (this.ballOutDelay > 0) return;
        
        // Set angle towards field (away from sideline/goal line)
        let kickDirection;
        if (ballOutType === 'THROW_IN') {
            // Throw-in: kick towards the field
            if (ball.x < FIELD_MARGIN_X + FIELD_WIDTH / 2) {
                // Left sideline - kick right
                kickDirection = 0;
            } else {
                // Right sideline - kick left
                kickDirection = Math.PI;
            }
        } else if (ballOutType === 'GOAL_KICK') {
            // Goal kick: kick towards opponent goal
            if (this.team === 'HOME') {
                // HOME goal kick - kick UP towards AWAY goal (at top)
                kickDirection = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
            } else {
                // AWAY goal kick - kick DOWN towards HOME goal (at bottom)
                kickDirection = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
            }
        } else if (ballOutType === 'CORNER_KICK') {
            // Corner kick: kick towards goal area
            if (ball.y < FIELD_MARGIN_Y + FIELD_HEIGHT / 2) {
                // Top corner - kick down towards goal
                kickDirection = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
            } else {
                // Bottom corner - kick up towards goal
                kickDirection = -Math.PI / 2 + (Math.random() - 0.5) * 0.5;
            }
        }
        
        this.angle = kickDirection;
        
        // Kick with appropriate power
        const power = ballOutType === 'GOAL_KICK' ? 8 : (ballOutType === 'CORNER_KICK' ? 7 : 5);
        ball.kick(Math.cos(this.angle) * power, Math.sin(this.angle) * power, 1.1);
        this.hasBall = false;
        this.ballOutImmunity = 30; // 0.5 second immunity from recapturing ball
        
        // Set corner kick immunity to prevent instant goal detection
        if (ballOutType === 'CORNER_KICK') {
            cornerKickImmunity = 60; // 1 second immunity from goal detection
        }
        
        // End ball out and reset delay
        this.ballOutDelay = null;
        this.actionCooldown = 30;
    }

    // Called from global input
    static switchPlayerGlobal() {
        if (!homePlayers || homePlayers.length === 0) return;

        // Find HOME player closest to ball
        let closestPlayer = null;
        let minDist = Infinity;
        
        homePlayers.forEach(p => {
            const dist = Math.sqrt((p.x - ball.x) ** 2 + (p.y - ball.y) ** 2);
            if (dist < minDist) {
                minDist = dist;
                closestPlayer = p;
            }
        });

        if (closestPlayer && playerControlledPuppet !== closestPlayer) {
            if (playerControlledPuppet) {
                playerControlledPuppet.isPlayerControlled = false;
            }
            playerControlledPuppet = closestPlayer;
            playerControlledPuppet.isPlayerControlled = true;
            playerControlledPuppet.speed = 3.5;
            playerControlledPuppet.sprintSpeed = 5;
        }
    }

    static switchPlayerGlobalAway() {
        if (gameMode !== 'PvP') return;
        
        const awayPlayers = players.filter(p => p.team === 'AWAY');
        if (!awayPlayers || awayPlayers.length === 0) return;

        // Find AWAY player closest to ball
        let closestPlayer = null;
        let minDist = Infinity;
        
        awayPlayers.forEach(p => {
            const dist = Math.sqrt((p.x - ball.x) ** 2 + (p.y - ball.y) ** 2);
            if (dist < minDist) {
                minDist = dist;
                closestPlayer = p;
            }
        });

        if (closestPlayer) {
            // Clear all AWAY player control
            awayPlayers.forEach(p => p.isPlayerControlled = false);
            closestPlayer.isPlayerControlled = true;
            closestPlayer.speed = 3.5;
            closestPlayer.sprintSpeed = 5;
            console.log(`PvP: Player 2 switched to AWAY #${closestPlayer.number} at (${closestPlayer.x.toFixed(0)}, ${closestPlayer.y.toFixed(0)})`);
        }
    }

    draw(ctx) {
        const rawTeam = this.team === 'HOME' ? playerTeam : opponentTeam;
        // Use separate jersey types for home and away teams
        const jerseyType = this.team === 'HOME' ? homeJerseyType : awayJerseyType;
        const teamData = rawTeam ? (jerseyType === 'away' ? rawTeam.away : rawTeam.home) : { primary: '#fff', secondary: '#000' };
        const x = this.x - camera.x;
        const y = this.y - camera.y;

        // Determine direction and action
        const isMoving = Math.abs(this.vx) > 0.5 || Math.abs(this.vy) > 0.5;
        const isShooting = ball.owner === this && (Math.abs(ball.vx) > 1 || Math.abs(ball.vy) > 1);
        const dirX = this.vx;
        const dirY = this.vy;

        // Animation frame (0 or 1 for running)
        const runFrame = Math.floor(Date.now() / 150) % 2;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y + 12, 14, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Save context for potential flipping
        ctx.save();

        // Controlled player indicator
        if (this.isPlayerControlled) {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x, y, 20, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Pressing player indicator (red ring for AI actively pressing)
        if (pressingPlayer === this && ball.owner && ball.owner.team !== this.team) {
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(x, y, 24, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Determine facing direction and draw appropriate sprite
        let facingRight = dirX > 0;
        let facingUp = dirY < 0;
        let isDiagonal = Math.abs(dirX) > 1 && Math.abs(dirY) > 1;
        let isVertical = Math.abs(dirY) > Math.abs(dirX);

        // Flip for left-facing
        if (!facingRight && dirX !== 0) {
            ctx.translate(x * 2, 0);
            ctx.scale(-1, 1);
        }

        // Determine which sprite to draw
        const absAngle = Math.abs(this.angle);
        const isDiagonalRight = absAngle > 0.3 && absAngle < 1.2;

        // Ball indicator (before player, so it doesn't flip)
        if (ball.owner === this) {
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y - 2, 14, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Sliding animation - low crouched pose
        if (this.sliding) {
            this.drawSlidingPose(ctx, x, y, teamData);
            // Draw player based on direction
        } else if (isVertical && !isDiagonal && isMoving) {
            // RUNNING STRAIGHT (UP/DOWN)
            this.drawRunningStraight(ctx, x, y, teamData, runFrame);
        } else if (isDiagonalRight && isMoving) {
            // RUNNING DIAGONAL
            this.drawRunningDiagonal(ctx, x, y, teamData, runFrame);
        } else if (ball.owner === this) {
            // SHOOTING/PASSING pose
            this.drawShootingPose(ctx, x, y, teamData, this.shootDirection);
        } else {
            // IDLE or simple standing
            this.drawIdle(ctx, x, y, teamData);
        }

        ctx.restore();

        // Number indicator (not flipped)
        ctx.fillStyle = teamData.secondary || '#000';
        ctx.font = 'bold 8px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const numOffset = dirX < 0 ? -x + (this.x - camera.x) * 2 : 0; // Adjust for flip
        ctx.fillText(this.number.toString(), x, y - 2);
    }

    drawRunningStraight(ctx, x, y, teamData, frame) {
        const legSwing = frame === 0 ? 6 : -6;

        // Back leg (left)
        ctx.fillStyle = '#fdbcb4';
        ctx.beginPath();
        ctx.ellipse(x - 4, y + 8 + legSwing * 0.5, 3, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Front leg (right) - swinging
        ctx.beginPath();
        ctx.ellipse(x + 4, y + 8 - legSwing, 3, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Shorts
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.roundRect(x - 8, y + 2, 16, 10, 3);
        ctx.fill();
        ctx.strokeStyle = teamData.primary || '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Torso - jersey (light blue from reference)
        ctx.fillStyle = teamData.primary || '#fff';
        ctx.beginPath();
        ctx.roundRect(x - 9, y - 12, 18, 16, 4);
        ctx.fill();
        ctx.strokeStyle = teamData.secondary || '#000';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Arms - running motion
        const armSwing = frame === 0 ? -5 : 5;
        ctx.fillStyle = '#fdbcb4';
        // Left arm
        ctx.beginPath();
        ctx.ellipse(x - 10, y - 6 + armSwing, 3, 7, armSwing * 0.1, 0, Math.PI * 2);
        ctx.fill();
        // Right arm
        ctx.beginPath();
        ctx.ellipse(x + 10, y - 6 - armSwing, 3, 7, -armSwing * 0.1, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.fillStyle = '#fdbcb4';
        ctx.beginPath();
        ctx.arc(x, y - 18, 8, 0, Math.PI * 2);
        ctx.fill();

        // Hair
        ctx.fillStyle = '#4a3728';
        ctx.beginPath();
        ctx.arc(x, y - 20, 8, Math.PI, 0);
        ctx.fill();

        // Dark shorts bottom
        ctx.fillStyle = '#333';
        ctx.fillRect(x - 3, y + 10, 6, 4);
    }

    drawRunningDiagonal(ctx, x, y, teamData, frame) {
        const offset = frame === 0 ? 1 : 0;

        // Legs - diagonal running
        ctx.fillStyle = '#fdbcb4';
        // Back leg
        ctx.beginPath();
        ctx.ellipse(x - 2 + offset * 3, y + 10, 3, 8, -0.3, 0, Math.PI * 2);
        ctx.fill();
        // Front leg
        ctx.beginPath();
        ctx.ellipse(x + 6 - offset * 3, y + 6, 3, 8, 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Shorts - angled
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(x - 6, y + 4);
        ctx.lineTo(x + 10, y + 2);
        ctx.lineTo(x + 8, y + 10);
        ctx.lineTo(x - 4, y + 12);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = teamData.primary || '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Torso - angled forward
        ctx.fillStyle = teamData.primary || '#fff';
        ctx.beginPath();
        ctx.roundRect(x - 6, y - 14, 16, 18, 3);
        ctx.fill();
        ctx.strokeStyle = teamData.secondary || '#000';
        ctx.stroke();

        // Arms - diagonal running pose
        ctx.fillStyle = '#fdbcb4';
        // Back arm
        ctx.beginPath();
        ctx.ellipse(x - 8 + offset * 2, y - 8, 3, 7, -0.5, 0, Math.PI * 2);
        ctx.fill();
        // Front arm
        ctx.beginPath();
        ctx.ellipse(x + 10 - offset * 2, y - 4, 3, 7, 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Head - angled
        ctx.fillStyle = '#fdbcb4';
        ctx.beginPath();
        ctx.arc(x + 2, y - 20, 8, 0, Math.PI * 2);
        ctx.fill();

        // Hair
        ctx.fillStyle = '#4a3728';
        ctx.beginPath();
        ctx.arc(x + 2, y - 22, 8, Math.PI, 0);
        ctx.fill();
    }

    drawShootingPose(ctx, x, y, teamData) {
        // Standing legs
        ctx.fillStyle = '#fdbcb4';
        // Left leg
        ctx.beginPath();
        ctx.ellipse(x - 4, y + 10, 3, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        // Right leg
        ctx.beginPath();
        ctx.ellipse(x + 4, y + 10, 3, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Shorts
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.roundRect(x - 8, y + 4, 16, 10, 3);
        ctx.fill();
        ctx.strokeStyle = teamData.primary || '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Torso
        ctx.fillStyle = teamData.primary || '#fff';
        ctx.beginPath();
        ctx.roundRect(x - 9, y - 12, 18, 18, 4);
        ctx.fill();
        ctx.strokeStyle = teamData.secondary || '#000';
        ctx.stroke();

        // Arms - shooting pose (left arm extended for passing/shooting)
        ctx.fillStyle = '#fdbcb4';
        // Left arm - extended back for kick
        ctx.beginPath();
        ctx.ellipse(x - 14, y - 4, 3, 8, -0.8, 0, Math.PI * 2);
        ctx.fill();
        // Right arm - forward balance
        ctx.beginPath();
        ctx.ellipse(x + 10, y - 6, 3, 7, 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.fillStyle = '#fdbcb4';
        ctx.beginPath();
        ctx.arc(x, y - 20, 8, 0, Math.PI * 2);
        ctx.fill();

        // Hair
        ctx.fillStyle = '#4a3728';
        ctx.beginPath();
        ctx.arc(x, y - 22, 8, Math.PI, 0);
        ctx.fill();

        // Dark shorts bottom
        ctx.fillStyle = '#333';
        ctx.fillRect(x - 3, y + 12, 6, 3);
    }

    drawSlidingPose(ctx, x, y, teamData) {
        // Low crouched slide pose - extended legs in direction of movement
        const slideAngle = this.angle || 0;
        const legLength = 18;
        const legOffsetX = Math.cos(slideAngle) * legLength;
        const legOffsetY = Math.sin(slideAngle) * legLength;

        ctx.fillStyle = '#fdbcb4';
        // Legs extended forward in slide direction
        ctx.beginPath();
        ctx.ellipse(x + legOffsetX - 4, y + legOffsetY + 8, 5, 10, slideAngle, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + legOffsetX + 4, y + legOffsetY + 8, 5, 10, slideAngle, 0, Math.PI * 2);
        ctx.fill();

        // Body low to ground
        ctx.fillStyle = teamData.primary || '#fff';
        ctx.beginPath();
        ctx.roundRect(x - 10, y - 4, 20, 12, 3);
        ctx.fill();
        ctx.strokeStyle = teamData.secondary || '#000';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Arms forward/protective
        ctx.fillStyle = '#fdbcb4';
        ctx.beginPath();
        ctx.ellipse(x - 14, y + 4, 4, 9, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 14, y + 4, 4, 9, 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Head low
        ctx.fillStyle = '#fdbcb4';
        ctx.beginPath();
        ctx.arc(x, y - 10, 7, 0, Math.PI * 2);
        ctx.fill();

        // Hair
        ctx.fillStyle = '#4a3728';
        ctx.beginPath();
        ctx.arc(x, y - 12, 7, Math.PI, 0);
        ctx.fill();

        // Dust trail effect
        ctx.fillStyle = 'rgba(200, 180, 150, 0.4)';
        for (let i = 0; i < 3; i++) {
            const dustX = x - legOffsetX * (0.3 + i * 0.2) + (Math.random() - 0.5) * 8;
            const dustY = y - legOffsetY * (0.3 + i * 0.2) + (Math.random() - 0.5) * 8;
            ctx.beginPath();
            ctx.arc(dustX, dustY + 10, 4 + i * 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawIdle(ctx, x, y, teamData) {
        // Standing pose
        ctx.fillStyle = '#fdbcb4';
        // Left leg
        ctx.beginPath();
        ctx.ellipse(x - 4, y + 10, 3, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        // Right leg
        ctx.beginPath();
        ctx.ellipse(x + 4, y + 10, 3, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Shorts
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.roundRect(x - 8, y + 4, 16, 10, 3);
        ctx.fill();
        ctx.strokeStyle = teamData.primary || '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Torso
        ctx.fillStyle = teamData.primary || '#fff';
        ctx.beginPath();
        ctx.roundRect(x - 9, y - 12, 18, 18, 4);
        ctx.fill();
        ctx.strokeStyle = teamData.secondary || '#000';
        ctx.stroke();

        // Arms - relaxed
        ctx.fillStyle = '#fdbcb4';
        ctx.beginPath();
        ctx.ellipse(x - 10, y - 4, 3, 7, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 10, y - 4, 3, 7, -0.1, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.fillStyle = '#fdbcb4';
        ctx.beginPath();
        ctx.arc(x, y - 20, 8, 0, Math.PI * 2);
        ctx.fill();

        // Hair
        ctx.fillStyle = '#4a3728';
        ctx.beginPath();
        ctx.arc(x, y - 22, 8, Math.PI, 0);
        ctx.fill();
    }
}

// Initialize
async function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    // Load teams from JSON (fall back to built-in data on file://)
    try {
        const response = await fetch('teams.json');
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

// New flow: separate jersey selections
let homeJerseyType = 'home';
let awayJerseyType = 'home';

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

let goalCelebrationTimer = 0;
let goalCelebrationActive = false;
let goalNetAnimation = 0; // Animation for goal net swaying

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

// Expose functions to window for HTML onclick handlers
window.showDifficultySelect = showDifficultySelect;
window.showTeamSelect1 = showTeamSelect1;
window.showTeamSelect2 = showTeamSelect2;
window.showJerseySelect = showJerseySelect;
window.setDifficultyAndNext = setDifficultyAndNext;

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

function render() {
    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw field
    drawField();

    // Draw players
    players.forEach(p => p.draw(ctx));

    // Draw goal celebration effect
    if (goalCelebrationActive) {
        drawGoalCelebration();
        goalCelebrationTimer--;
        if (goalCelebrationTimer <= 0) {
            goalCelebrationActive = false;
        }
    }
    
    // Decrement goal net animation
    if (goalNetAnimation > 0) {
        goalNetAnimation--;
    }

    // Draw ball (on top) - ball is null until a match starts
    if (ball) ball.draw(ctx);
    
    // Draw kickoff indicator
    if (kickoffActive) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(CANVAS_WIDTH/2 - 100, 20, 200, 40);
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.strokeRect(CANVAS_WIDTH/2 - 100, 20, 200, 40);
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('⚽ KICKOFF', CANVAS_WIDTH/2, 45);
        ctx.textAlign = 'left';
    }
}

function drawField() {
    const offsetX = -camera.x;
    const offsetY = -camera.y;

    // Grass
    const grassLight = '#3d7a26';
    const grassDark = '#2d5a1a';

    ctx.fillStyle = grassDark;
    ctx.fillRect(offsetX + FIELD_MARGIN_X, offsetY + FIELD_MARGIN_Y, FIELD_WIDTH, FIELD_HEIGHT);

    // Striped pattern (horizontal stripes for vertical field)
    ctx.fillStyle = grassLight;
    const stripeHeight = FIELD_HEIGHT / 10;
    for (let i = 0; i < 10; i += 2) {
        ctx.fillRect(offsetX + FIELD_MARGIN_X, offsetY + FIELD_MARGIN_Y + i * stripeHeight, FIELD_WIDTH, stripeHeight);
    }

    // Field border
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 4;
    ctx.strokeRect(offsetX + FIELD_MARGIN_X, offsetY + FIELD_MARGIN_Y, FIELD_WIDTH, FIELD_HEIGHT);

    const centerX = FIELD_MARGIN_X + FIELD_WIDTH / 2;
    const centerY = FIELD_MARGIN_Y + FIELD_HEIGHT / 2;

    // Center line (horizontal for vertical field)
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(offsetX + FIELD_MARGIN_X, offsetY + centerY);
    ctx.lineTo(offsetX + FIELD_MARGIN_X + FIELD_WIDTH, offsetY + centerY);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(offsetX + centerX, offsetY + centerY, 80, 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(offsetX + centerX, offsetY + centerY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Goals - VERTICAL orientation
    const goalX = centerX - GOAL_WIDTH / 2;
    const postWidth = 6;
    const crossbarWidth = 6;
    
    // Calculate net sway based on animation
    const netSway = goalNetAnimation > 0 ? Math.sin(goalNetAnimation * 0.2) * 3 : 0;

    // Top goal (AWAY/BOT)
    // Goal net background
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(offsetX + goalX, offsetY + FIELD_MARGIN_Y - GOAL_DEPTH, GOAL_WIDTH, GOAL_DEPTH);
    
    // Goal net pattern (diagonal mesh) with sway animation
    ctx.strokeStyle = 'rgba(200,200,200,0.4)';
    ctx.lineWidth = 1;
    // Vertical lines with sway
    for (let i = 0; i <= GOAL_WIDTH; i += 15) {
        const sway = (i / GOAL_WIDTH) * netSway;
        ctx.beginPath();
        ctx.moveTo(offsetX + goalX + i + sway, offsetY + FIELD_MARGIN_Y - GOAL_DEPTH);
        ctx.lineTo(offsetX + goalX + i + sway * 0.5, offsetY + FIELD_MARGIN_Y);
        ctx.stroke();
    }
    // Horizontal lines
    for (let i = 0; i <= GOAL_DEPTH; i += 15) {
        ctx.beginPath();
        ctx.moveTo(offsetX + goalX, offsetY + FIELD_MARGIN_Y - GOAL_DEPTH + i);
        ctx.lineTo(offsetX + goalX + GOAL_WIDTH, offsetY + FIELD_MARGIN_Y - GOAL_DEPTH + i);
        ctx.stroke();
    }
    // Diagonal lines for mesh effect with sway
    ctx.strokeStyle = 'rgba(200,200,200,0.2)';
    for (let i = -GOAL_DEPTH; i <= GOAL_WIDTH; i += 15) {
        const sway = (i / GOAL_WIDTH) * netSway;
        ctx.beginPath();
        ctx.moveTo(offsetX + goalX + i + sway, offsetY + FIELD_MARGIN_Y - GOAL_DEPTH);
        ctx.lineTo(offsetX + goalX + i + GOAL_DEPTH + sway * 0.5, offsetY + FIELD_MARGIN_Y);
        ctx.stroke();
    }
    
    // Goal posts (left and right)
    ctx.fillStyle = '#fff';
    ctx.fillRect(offsetX + goalX - postWidth/2, offsetY + FIELD_MARGIN_Y - GOAL_DEPTH, postWidth, GOAL_DEPTH + 10);
    ctx.fillRect(offsetX + goalX + GOAL_WIDTH - postWidth/2, offsetY + FIELD_MARGIN_Y - GOAL_DEPTH, postWidth, GOAL_DEPTH + 10);
    
    // Crossbar (top)
    ctx.fillRect(offsetX + goalX - postWidth/2, offsetY + FIELD_MARGIN_Y - GOAL_DEPTH, GOAL_WIDTH + postWidth, crossbarWidth);
    
    // Post highlights for 3D effect
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(offsetX + goalX - postWidth/2 + 1, offsetY + FIELD_MARGIN_Y - GOAL_DEPTH, 2, GOAL_DEPTH + 10);
    ctx.fillRect(offsetX + goalX + GOAL_WIDTH - postWidth/2 + 1, offsetY + FIELD_MARGIN_Y - GOAL_DEPTH, 2, GOAL_DEPTH + 10);
    ctx.fillRect(offsetX + goalX - postWidth/2, offsetY + FIELD_MARGIN_Y - GOAL_DEPTH + 1, GOAL_WIDTH + postWidth, 2);

    // Bottom goal (HOME/Player 1)
    // Goal net background
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(offsetX + goalX, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT, GOAL_WIDTH, GOAL_DEPTH);
    
    // Goal net pattern (diagonal mesh) with sway animation
    ctx.strokeStyle = 'rgba(200,200,200,0.4)';
    ctx.lineWidth = 1;
    // Vertical lines with sway
    for (let i = 0; i <= GOAL_WIDTH; i += 15) {
        const sway = (i / GOAL_WIDTH) * netSway;
        ctx.beginPath();
        ctx.moveTo(offsetX + goalX + i + sway, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT);
        ctx.lineTo(offsetX + goalX + i + sway * 0.5, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT + GOAL_DEPTH);
        ctx.stroke();
    }
    // Horizontal lines
    for (let i = 0; i <= GOAL_DEPTH; i += 15) {
        ctx.beginPath();
        ctx.moveTo(offsetX + goalX, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT + i);
        ctx.lineTo(offsetX + goalX + GOAL_WIDTH, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT + i);
        ctx.stroke();
    }
    // Diagonal lines for mesh effect with sway
    ctx.strokeStyle = 'rgba(200,200,200,0.2)';
    for (let i = -GOAL_DEPTH; i <= GOAL_WIDTH; i += 15) {
        const sway = (i / GOAL_WIDTH) * netSway;
        ctx.beginPath();
        ctx.moveTo(offsetX + goalX + i + sway, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT);
        ctx.lineTo(offsetX + goalX + i + GOAL_DEPTH + sway * 0.5, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT + GOAL_DEPTH);
        ctx.stroke();
    }
    
    // Goal posts (left and right)
    ctx.fillStyle = '#fff';
    ctx.fillRect(offsetX + goalX - postWidth/2, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT - 10, postWidth, GOAL_DEPTH + 10);
    ctx.fillRect(offsetX + goalX + GOAL_WIDTH - postWidth/2, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT - 10, postWidth, GOAL_DEPTH + 10);
    
    // Crossbar (bottom)
    ctx.fillRect(offsetX + goalX - postWidth/2, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT - crossbarWidth, GOAL_WIDTH + postWidth, crossbarWidth);
    
    // Post highlights for 3D effect
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(offsetX + goalX - postWidth/2 + 1, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT - 10, 2, GOAL_DEPTH + 10);
    ctx.fillRect(offsetX + goalX + GOAL_WIDTH - postWidth/2 + 1, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT - 10, 2, GOAL_DEPTH + 10);
    ctx.fillRect(offsetX + goalX - postWidth/2, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT - crossbarWidth + 1, GOAL_WIDTH + postWidth, 2);

    // Goal areas (penalty box)
    const penaltyBoxWidth = 320;
    const penaltyBoxHeight = 120;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;
    // Top penalty box
    ctx.strokeRect(offsetX + centerX - penaltyBoxWidth / 2, offsetY + FIELD_MARGIN_Y, penaltyBoxWidth, penaltyBoxHeight);
    // Bottom penalty box
    ctx.strokeRect(offsetX + centerX - penaltyBoxWidth / 2, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT - penaltyBoxHeight, penaltyBoxWidth, penaltyBoxHeight);

    // Penalty spots
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(offsetX + centerX, offsetY + FIELD_MARGIN_Y + 80, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(offsetX + centerX, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT - 80, 4, 0, Math.PI * 2);
    ctx.fill();

    // Corner arcs
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;
    const cornerRadius = 20;
    // Top-left
    ctx.beginPath();
    ctx.arc(offsetX + FIELD_MARGIN_X, offsetY + FIELD_MARGIN_Y, cornerRadius, 0, Math.PI / 2);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.arc(offsetX + FIELD_MARGIN_X + FIELD_WIDTH, offsetY + FIELD_MARGIN_Y, cornerRadius, Math.PI / 2, Math.PI);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.arc(offsetX + FIELD_MARGIN_X, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT, cornerRadius, -Math.PI / 2, 0);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.arc(offsetX + FIELD_MARGIN_X + FIELD_WIDTH, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT, cornerRadius, Math.PI, -Math.PI / 2);
    ctx.stroke();

    // Stadium ornaments - Advertising boards
    const boardWidth = 60;
    const boardHeight = 15;
    const boardGap = 80;
    const boardColor1 = '#e74c3c';
    const boardColor2 = '#3498db';
    const boardColor3 = '#f39c12';
    const boardColor4 = '#9b59b6';
    const boardOffset = GOAL_DEPTH + 20; // Offset to avoid covering goal
    
    // Top advertising boards
    for (let i = 0; i < Math.floor(FIELD_WIDTH / boardGap); i++) {
        const x = offsetX + FIELD_MARGIN_X + i * boardGap + 20;
        const y = offsetY + FIELD_MARGIN_Y - boardHeight - boardOffset;
        ctx.fillStyle = (i % 2 === 0) ? boardColor1 : boardColor2;
        ctx.fillRect(x, y, boardWidth, boardHeight);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, boardWidth, boardHeight);
    }
    
    // Bottom advertising boards
    for (let i = 0; i < Math.floor(FIELD_WIDTH / boardGap); i++) {
        const x = offsetX + FIELD_MARGIN_X + i * boardGap + 20;
        const y = offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT + boardOffset;
        ctx.fillStyle = (i % 2 === 0) ? boardColor3 : boardColor4;
        ctx.fillRect(x, y, boardWidth, boardHeight);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, boardWidth, boardHeight);
    }
    
    // Left advertising boards
    for (let i = 0; i < Math.floor(FIELD_HEIGHT / boardGap); i++) {
        const x = offsetX + FIELD_MARGIN_X - boardHeight - boardOffset;
        const y = offsetY + FIELD_MARGIN_Y + i * boardGap + 20;
        ctx.fillStyle = (i % 2 === 0) ? boardColor2 : boardColor1;
        ctx.fillRect(x, y, boardHeight, boardWidth);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, boardHeight, boardWidth);
    }
    
    // Right advertising boards
    for (let i = 0; i < Math.floor(FIELD_HEIGHT / boardGap); i++) {
        const x = offsetX + FIELD_MARGIN_X + FIELD_WIDTH + boardOffset;
        const y = offsetY + FIELD_MARGIN_Y + i * boardGap + 20;
        ctx.fillStyle = (i % 2 === 0) ? boardColor4 : boardColor3;
        ctx.fillRect(x, y, boardHeight, boardWidth);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, boardHeight, boardWidth);
    }

    // Stadium stands (bleachers) - Tiered design
    const standWidth = 40;
    const standHeight = 80;
    const standColor1 = '#2c3e50';
    const standColor2 = '#34495e';
    const standOffset = boardOffset + boardHeight + 10; // Offset to avoid covering boards
    const tiers = 3; // Number of tiers
    const tierHeight = 25; // Height of each tier
    const tierDepth = 15; // Depth of each tier
    
    // Get team colors for fans
    const homeColor = playerTeam?.home?.primary || '#e74c3c';
    const awayColor = opponentTeam?.home?.primary || '#3498db';
    const homeSecondary = playerTeam?.home?.secondary || '#c0392b';
    const awaySecondary = opponentTeam?.home?.secondary || '#2980b9';
    const fanColors = [homeColor, awayColor, homeSecondary, awaySecondary, '#f39c12', '#2ecc71', '#9b59b6', '#ecf0f1'];
    
    // Top stands (tiered)
    for (let i = 0; i < Math.floor(FIELD_WIDTH / standWidth); i++) {
        const x = offsetX + FIELD_MARGIN_X + i * standWidth;
        const baseY = offsetY + FIELD_MARGIN_Y - standOffset;
        
        // Draw multiple tiers
        for (let tier = 0; tier < tiers; tier++) {
            const tierY = baseY - tier * (tierHeight + 5);
            const tierWidth = standWidth - tier * 5; // Each tier is smaller
            const tierX = x + tier * 2.5; // Center each tier
            
            // Tier background
            ctx.fillStyle = (i + tier) % 2 === 0 ? standColor1 : standColor2;
            ctx.fillRect(tierX, tierY, tierWidth, tierHeight);
            
            // Tier shadow for depth
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(tierX + tierWidth, tierY + 5, 5, tierHeight - 5);
            
            // Fans in this tier
            for (let j = 0; j < 3; j++) {
                for (let k = 0; k < 2; k++) {
                    const fanX = tierX + 5 + k * (tierWidth - 10);
                    const fanY = tierY + 5 + j * 8;
                    const fanSize = 5 - tier * 0.5; // Larger fans, smaller in higher tiers
                    ctx.fillStyle = fanColors[(i + tier + j + k) % fanColors.length];
                    ctx.beginPath();
                    ctx.arc(fanX, fanY, Math.max(2, fanSize), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }
    
    // Bottom stands (tiered)
    for (let i = 0; i < Math.floor(FIELD_WIDTH / standWidth); i++) {
        const x = offsetX + FIELD_MARGIN_X + i * standWidth;
        const baseY = offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT + standOffset;
        
        // Draw multiple tiers
        for (let tier = 0; tier < tiers; tier++) {
            const tierY = baseY + tier * (tierHeight + 5);
            const tierWidth = standWidth - tier * 5;
            const tierX = x + tier * 2.5;
            
            ctx.fillStyle = (i + tier) % 2 === 0 ? standColor2 : standColor1;
            ctx.fillRect(tierX, tierY, tierWidth, tierHeight);
            
            // Tier shadow
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(tierX + tierWidth, tierY + 5, 5, tierHeight - 5);
            
            // Fans in this tier
            for (let j = 0; j < 3; j++) {
                for (let k = 0; k < 2; k++) {
                    const fanX = tierX + 5 + k * (tierWidth - 10);
                    const fanY = tierY + 5 + j * 8;
                    const fanSize = 5 - tier * 0.5;
                    ctx.fillStyle = fanColors[(i + tier + j + k + 4) % fanColors.length];
                    ctx.beginPath();
                    ctx.arc(fanX, fanY, Math.max(2, fanSize), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }
    
    // Left stands (tiered)
    for (let i = 0; i < Math.floor(FIELD_HEIGHT / standWidth); i++) {
        const y = offsetY + FIELD_MARGIN_Y + i * standWidth;
        const baseX = offsetX + FIELD_MARGIN_X - standOffset;
        
        // Draw multiple tiers
        for (let tier = 0; tier < tiers; tier++) {
            const tierX = baseX - tier * (tierHeight + 5);
            const tierHeight2 = standWidth - tier * 5;
            const tierY = y + tier * 2.5;
            
            ctx.fillStyle = (i + tier) % 2 === 0 ? standColor1 : standColor2;
            ctx.fillRect(tierX, tierY, tierHeight, tierHeight2);
            
            // Tier shadow
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(tierX + 5, tierY + tierHeight2, tierHeight - 5, 5);
            
            // Fans in this tier
            for (let j = 0; j < 3; j++) {
                for (let k = 0; k < 2; k++) {
                    const fanX = tierX + 5 + j * 8;
                    const fanY = tierY + 5 + k * (tierHeight2 - 10);
                    const fanSize = 5 - tier * 0.5;
                    ctx.fillStyle = fanColors[(i + tier + j + k + 2) % fanColors.length];
                    ctx.beginPath();
                    ctx.arc(fanX, fanY, Math.max(2, fanSize), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }
    
    // Right stands (tiered)
    for (let i = 0; i < Math.floor(FIELD_HEIGHT / standWidth); i++) {
        const y = offsetY + FIELD_MARGIN_Y + i * standWidth;
        const baseX = offsetX + FIELD_MARGIN_X + FIELD_WIDTH + standOffset;
        
        // Draw multiple tiers
        for (let tier = 0; tier < tiers; tier++) {
            const tierX = baseX + tier * (tierHeight + 5);
            const tierHeight2 = standWidth - tier * 5;
            const tierY = y + tier * 2.5;
            
            ctx.fillStyle = (i + tier) % 2 === 0 ? standColor2 : standColor1;
            ctx.fillRect(tierX, tierY, tierHeight, tierHeight2);
            
            // Tier shadow
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(tierX + 5, tierY + tierHeight2, tierHeight - 5, 5);
            
            // Fans in this tier
            for (let j = 0; j < 3; j++) {
                for (let k = 0; k < 2; k++) {
                    const fanX = tierX + 5 + j * 8;
                    const fanY = tierY + 5 + k * (tierHeight2 - 10);
                    const fanSize = 5 - tier * 0.5;
                    ctx.fillStyle = fanColors[(i + tier + j + k + 6) % fanColors.length];
                    ctx.beginPath();
                    ctx.arc(fanX, fanY, Math.max(2, fanSize), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    // Stadium lights (floodlights in corners)
    const lightSize = 30;
    const lightPoleHeight = 60;
    const lightPositions = [
        { x: FIELD_MARGIN_X - 30, y: FIELD_MARGIN_Y - 30 },
        { x: FIELD_MARGIN_X + FIELD_WIDTH + 30, y: FIELD_MARGIN_Y - 30 },
        { x: FIELD_MARGIN_X - 30, y: FIELD_MARGIN_Y + FIELD_HEIGHT + 30 },
        { x: FIELD_MARGIN_X + FIELD_WIDTH + 30, y: FIELD_MARGIN_Y + FIELD_HEIGHT + 30 }
    ];
    
    lightPositions.forEach(pos => {
        // Light pole
        ctx.fillStyle = '#7f8c8d';
        ctx.fillRect(offsetX + pos.x - 3, offsetY + pos.y, 6, lightPoleHeight);
        
        // Light fixture
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(offsetX + pos.x, offsetY + pos.y, lightSize / 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Light glow effect
        ctx.fillStyle = 'rgba(241, 196, 15, 0.3)';
        ctx.beginPath();
        ctx.arc(offsetX + pos.x, offsetY + pos.y, lightSize, 0, Math.PI * 2);
        ctx.fill();
    });

    // Direction indicators
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('▲ AWAY ▲', offsetX + centerX, offsetY + FIELD_MARGIN_Y + 40);
    ctx.fillText('▼ HOME ▼', offsetX + centerX, offsetY + FIELD_MARGIN_Y + FIELD_HEIGHT - 30);
}

function drawGoalCelebration() {
    const centerX = FIELD_MARGIN_X + FIELD_WIDTH / 2;
    const centerY = FIELD_MARGIN_Y + FIELD_HEIGHT / 2;
    const offsetX = -camera.x;
    const offsetY = -camera.y;

    // Confetti particles
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
    for (let i = 0; i < 50; i++) {
        const angle = (i / 50) * Math.PI * 2 + goalCelebrationTimer * 0.1;
        const radius = 50 + (goalCelebrationTimer % 30) * 3;
        const x = offsetX + centerX + Math.cos(angle) * radius;
        const y = offsetY + centerY + Math.sin(angle) * radius;
        const size = 3 + Math.sin(goalCelebrationTimer * 0.5 + i) * 2;

        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }

    // Flash effect
    ctx.fillStyle = `rgba(255, 255, 255, ${goalCelebrationTimer / 180})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // GOAL text
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText('GOAL!!!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.fillText('GOAL!!!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.textAlign = 'left';
}

// Start
init();
