// Global mutable game state shared across all modules

// Camera system
let playerControlledPuppet = null;

// Teams data - loaded from data/teams.json
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

// New flow: separate jersey selections
let homeJerseyType = 'home';
let awayJerseyType = 'home';

// Goal celebration
let goalCelebrationTimer = 0;
let goalCelebrationActive = false;
let goalNetAnimation = 0; // Animation for goal net swaying
