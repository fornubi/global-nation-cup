// Player entity: core state, human input, ball contact & actions.
// AI behaviour lives in player-ai.js, drawing in player-render.js.

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
}
