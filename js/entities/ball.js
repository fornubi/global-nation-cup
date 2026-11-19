// Ball entity: physics, goal / out-of-bounds detection, drawing

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
