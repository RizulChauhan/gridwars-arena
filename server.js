const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory active matches
const matches = {};

const GRID_SIZE = 6;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const PLAYER_COLORS = ['#3A86FF', '#FF006E', '#06D6A0', '#FFBE0B'];

function getAdjacentCells(index) {
  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const adj = [];
  if (row > 0) adj.push(index - GRID_SIZE);
  if (row < GRID_SIZE - 1) adj.push(index + GRID_SIZE);
  if (col > 0) adj.push(index - 1);
  if (col < GRID_SIZE - 1) adj.push(index + 1);
  return adj;
}

function createInitialBoard(numPlayers) {
  const board = [];
  for (let i = 0; i < TOTAL_CELLS; i++) {
    board.push({
      index: i,
      owner: null,
      armies: Math.floor(Math.random() * 2) + 1, // Neutral garrison 1-2
    });
  }

  // Assign starting bases at corners
  const starts = [0, TOTAL_CELLS - 1, GRID_SIZE - 1, TOTAL_CELLS - GRID_SIZE];
  for (let p = 0; p < numPlayers; p++) {
    const idx = starts[p];
    board[idx].owner = p;
    board[idx].armies = 5;
  }
  return board;
}

function calculateReinforcements(board, playerId) {
  const ownedCount = board.filter((c) => c.owner === playerId).length;
  return Math.max(2, Math.floor(ownedCount / 3));
}

// Bot Decision Maker
function executeBotTurn(match) {
  const botId = match.currentTurn;
  const botTiles = match.board.filter((c) => c.owner === botId && c.armies > 1);
  
  if (botTiles.length > 0) {
    // Pick tile with highest armies
    botTiles.sort((a, b) => b.armies - a.armies);
    const source = botTiles[0];
    const neighbors = getAdjacentCells(source.index).map((idx) => match.board[idx]);
    
    // Prioritize attacking weakest enemy/neutral neighbor
    const targets = neighbors.filter((n) => n.owner !== botId);
    targets.sort((a, b) => a.armies - b.armies);

    if (targets.length > 0 && source.armies > targets[0].armies) {
      const target = targets[0];
      const attackingArmies = source.armies - 1;
      
      if (attackingArmies > target.armies) {
        // Conquer
        source.armies = 1;
        target.owner = botId;
        target.armies = attackingArmies - target.armies;
        match.log.push(`Bot ${botId} conquered Cell ${target.index} from Cell ${source.index}`);
      } else {
        // Battle attrition
        target.armies -= attackingArmies;
        source.armies = 1;
        match.log.push(`Bot ${botId} skirmished Cell ${target.index} (-${attackingArmies} armies)`);
      }
    }
  }

  // Advance turn
  advanceTurn(match);
}

function advanceTurn(match) {
  let nextPlayer = (match.currentTurn + 1) % match.players.length;
  let iterations = 0;
  
  // Check if player is alive
  while (iterations < match.players.length) {
    const hasTerritory = match.board.some((c) => c.owner === nextPlayer);
    if (hasTerritory) {
      break;
    }
    nextPlayer = (nextPlayer + 1) % match.players.length;
    iterations++;
  }

  match.currentTurn = nextPlayer;
  match.turnNumber++;

  // Add reinforcements
  const bonus = calculateReinforcements(match.board, nextPlayer);
  const homeBases = match.board.filter((c) => c.owner === nextPlayer);
  if (homeBases.length > 0) {
    homeBases[0].armies += bonus;
    match.log.push(`Player ${nextPlayer} received +${bonus} reinforcements.`);
  }

  // Check victory
  const owners = new Set(match.board.map((c) => c.owner).filter((o) => o !== null));
  if (owners.size === 1) {
    match.winner = Array.from(owners)[0];
    match.status = 'COMPLETED';
    match.log.push(`Match over! Player ${match.winner} conquered the grid!`);
  }

  // If next player is bot and game ongoing, execute bot turn
  if (match.status === 'ACTIVE' && match.players[nextPlayer].isBot) {
    setTimeout(() => executeBotTurn(match), 800);
  }
}

// ----------------------------------------------------------------------------
// API Endpoints
// ----------------------------------------------------------------------------

// Create Match
app.post('/api/match/create', (req, res) => {
  const numPlayers = Math.min(4, Math.max(2, req.body.numPlayers || 2));
  const matchId = 'gw_' + Math.random().toString(36).substring(2, 8);

  const players = [];
  for (let i = 0; i < numPlayers; i++) {
    players.push({
      id: i,
      name: i === 0 ? 'Player 1 (Human)' : `Seat ${i + 1}`,
      color: PLAYER_COLORS[i],
      isBot: false,
      isJoined: i === 0,
    });
  }

  matches[matchId] = {
    id: matchId,
    status: 'ACTIVE',
    players,
    board: createInitialBoard(numPlayers),
    currentTurn: 0,
    turnNumber: 1,
    winner: null,
    log: [`Match ${matchId} initialized with ${numPlayers} players.`],
    createdAt: new Date().toISOString(),
  };

  res.json({ ok: true, matchId, match: matches[matchId] });
});

// Get Match State
app.get('/api/match/:id/state', (req, res) => {
  const match = matches[req.params.id];
  if (!match) return res.status(404).json({ ok: false, error: 'Match not found' });
  res.json({ ok: true, match });
});

// Join Match
app.post('/api/match/:id/join', (req, res) => {
  const match = matches[req.params.id];
  if (!match) return res.status(404).json({ ok: false, error: 'Match not found' });

  const openSeat = match.players.find((p) => !p.isJoined && !p.isBot);
  if (!openSeat) return res.status(400).json({ ok: false, error: 'Match is full' });

  openSeat.name = req.body.name || `Agent ${openSeat.id}`;
  openSeat.isJoined = true;
  openSeat.isBot = Boolean(req.body.isBot);
  match.log.push(`${openSeat.name} joined as Player ${openSeat.id}`);

  res.json({ ok: true, playerId: openSeat.id, color: openSeat.color, match });
});

// Fill Open Seats with Bots
app.post('/api/match/:id/fill-bots', (req, res) => {
  const match = matches[req.params.id];
  if (!match) return res.status(404).json({ ok: false, error: 'Match not found' });

  match.players.forEach((p) => {
    if (!p.isJoined) {
      p.name = `CyberBot ${p.id}`;
      p.isJoined = true;
      p.isBot = true;
      match.log.push(`Bot ${p.id} filled empty seat.`);
    }
  });

  if (match.players[match.currentTurn].isBot) {
    executeBotTurn(match);
  }

  res.json({ ok: true, match });
});

// Submit Move (Tactical Attack or Transfer)
app.post('/api/match/:id/move', (req, res) => {
  const match = matches[req.params.id];
  if (!match) return res.status(404).json({ ok: false, error: 'Match not found' });
  if (match.status !== 'ACTIVE') return res.status(400).json({ ok: false, error: 'Game over' });

  const { playerId, fromCell, toCell, armies } = req.body;
  if (match.currentTurn !== Number(playerId)) {
    return res.status(400).json({ ok: false, error: 'Not your turn' });
  }

  const src = match.board[fromCell];
  const dst = match.board[toCell];

  if (!src || !dst) return res.status(400).json({ ok: false, error: 'Invalid cell index' });
  if (src.owner !== Number(playerId)) return res.status(400).json({ ok: false, error: 'You do not own source cell' });
  if (src.armies <= 1) return res.status(400).json({ ok: false, error: 'Source must have at least 2 armies' });

  const adj = getAdjacentCells(fromCell);
  if (!adj.includes(toCell)) return res.status(400).json({ ok: false, error: 'Target cell is not adjacent' });

  const moveArmies = Math.min(src.armies - 1, Math.max(1, armies || src.armies - 1));

  if (dst.owner === Number(playerId)) {
    // Friendly transfer
    src.armies -= moveArmies;
    dst.armies += moveArmies;
    match.log.push(`Player ${playerId} moved ${moveArmies} armies from ${fromCell} to ${toCell}`);
  } else {
    // Battle
    if (moveArmies > dst.armies) {
      // Attacker wins
      src.armies -= moveArmies;
      dst.owner = Number(playerId);
      dst.armies = moveArmies - dst.armies;
      match.log.push(`Player ${playerId} captured Cell ${toCell}! (Remaining: ${dst.armies})`);
    } else {
      // Defender holds
      dst.armies -= moveArmies;
      src.armies -= moveArmies;
      match.log.push(`Player ${playerId} assaulted Cell ${toCell} but defender held.`);
    }
  }

  res.json({ ok: true, match });
});

// End Turn
app.post('/api/match/:id/end-turn', (req, res) => {
  const match = matches[req.params.id];
  if (!match) return res.status(404).json({ ok: false, error: 'Match not found' });
  if (match.currentTurn !== Number(req.body.playerId)) {
    return res.status(400).json({ ok: false, error: 'Not your turn' });
  }

  advanceTurn(match);
  res.json({ ok: true, match });
});

// Action Replay Log
app.get('/api/match/:id/replay', (req, res) => {
  const match = matches[req.params.id];
  if (!match) return res.status(404).json({ ok: false, error: 'Match not found' });
  res.json({ ok: true, log: match.log, winner: match.winner, totalTurns: match.turnNumber });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`GridWars Arena running on http://0.0.0.0:${PORT}`);
});
