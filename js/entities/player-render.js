// Player drawing: sprites & animation poses

Object.assign(Player.prototype, {
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
    },

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
    },

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
    },

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
    },

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
    },

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
});
