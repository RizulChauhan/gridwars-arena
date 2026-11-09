# ⚔️ GridWars Arena

> A fast, tactical, turn-based multiplayer territory conquest game designed for humans and autonomous AI agents to play together in the same match.

Built for Taskmarket Bounty `0x1f269fddd348300f6ece321953cd45f559fcf6ffff82cbf16cccf7dcb5a2de39` on the Tempo Network.

---

## 🎮 Game Rules (in One Paragraph)
GridWars Arena is played on a 6×6 tactical territory grid with 2 to 4 players. Each round, players gain reinforcement armies proportional to their owned territory (minimum 2). On your turn, choose any tile you control with more than 1 army to attack an adjacent neutral or rival tile, or reinforce a friendly position, always leaving at least 1 defender behind. Battles succeed when attacking armies exceed the defender's garrison, capturing the tile and converting surviving forces into the new occupying army. Outmaneuver opponents, defend supply lines, and conquer every cell on the grid to claim total victory in matches lasting under 10 minutes.

---

## 🚀 Quick Start

### 1. Install Dependencies & Run Server
```bash
git clone https://github.com/RizulChauhan/gridwars-arena.git
cd gridwars-arena
npm install
node server.js
```
The game will be live at `http://localhost:3000`.

### 2. Play in Browser
Open `http://localhost:3000` in any modern web browser.
- Click **"New 2P"** or **"New 4P"** to spin up an instant match.
- Click **"Fill with Bots"** to immediately fill empty player seats with heuristic AI bots.
- Click an owned tile (highlighted in your player color) and click an adjacent tile to assault or transfer.
- Click **"End Turn"** when ready.

---

## 🤖 Autonomous Agent API Documentation

Agents interact with GridWars Arena via pure, stateless HTTP REST endpoints with standard JSON payloads.

### 1. Create a Match
- **Endpoint**: `POST /api/match/create`
- **Body**: `{ "numPlayers": 2 }` (2, 3, or 4)
- **Response**:
```json
{
  "ok": true,
  "matchId": "gw_x89f2a",
  "match": { ... }
}
```

### 2. Join a Match
- **Endpoint**: `POST /api/match/:id/join`
- **Body**: `{ "name": "AgentSmith-v1", "isBot": true }`
- **Response**:
```json
{
  "ok": true,
  "playerId": 1,
  "color": "#FF006E",
  "match": { ... }
}
```

### 3. Read Match State
- **Endpoint**: `GET /api/match/:id/state`
- **Response**:
```json
{
  "ok": true,
  "match": {
    "id": "gw_x89f2a",
    "status": "ACTIVE",
    "currentTurn": 1,
    "turnNumber": 4,
    "winner": null,
    "board": [
      { "index": 0, "owner": 0, "armies": 5 },
      { "index": 1, "owner": null, "armies": 2 },
      ...
    ],
    "log": ["Player 0 moved 3 armies from 0 to 1"]
  }
}
```

### 4. Submit Move
- **Endpoint**: `POST /api/match/:id/move`
- **Body**:
```json
{
  "playerId": 1,
  "fromCell": 35,
  "toCell": 29,
  "armies": 4
}
```
- **Rules**:
  - `fromCell` must belong to `playerId` with `armies > 1`.
  - `toCell` must be orthogonal adjacent (`row ± 1` or `col ± 1`).
  - `armies` specifies count to send (defaults to `armies - 1`).

### 5. Fill Empty Seats with Heuristic Bots
- **Endpoint**: `POST /api/match/:id/fill-bots`
- **Body**: `{}`

### 6. End Turn
- **Endpoint**: `POST /api/match/:id/end-turn`
- **Body**: `{ "playerId": 1 }`

### 7. Match Replay & Audit Log
- **Endpoint**: `GET /api/match/:id/replay`
- **Response**:
```json
{
  "ok": true,
  "log": [ ... ],
  "winner": 0,
  "totalTurns": 18
}
```

---

## 🦾 Sample Bot
A complete, plug-and-play autonomous agent bot is included in `sample_bot.js`:
```bash
node sample_bot.js <matchId> [serverUrl]
```
The sample bot polls game state, detects its turn, calculates highest-yield invasion paths against neighboring targets, executes moves, and safely passes the turn.

---

## ⚖️ Strategic Design & Balance
- **No Dominant Strategy**: Aggressive expansion leaves interior tiles vulnerable with 1 defender; turtle strategies forfeit the reinforcement multiplier.
- **Meaningful Decisions**: Every turn presents the choice between perimeter fortification, neutral resource capture, or direct border clash.
- **Zero Friction**: 0 logins, 0 cookies, 0 complex dependencies.
