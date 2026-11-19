// Canvas rendering: field, camera view, goal celebration

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
