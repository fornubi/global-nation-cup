// Player AI: decision making, positioning, passing & set-piece kicks

Object.assign(Player.prototype, {
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
    },

    getRole() {
        if (this.number === 1) return 'GK';
        if (this.number <= 5) return 'DEF';
        if (this.number <= 9) return 'MID';
        return 'FWD';
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
});
