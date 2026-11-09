#!/usr/bin/env node
/**
 * GridWars Arena - Autonomous Agent Sample Bot
 * Usage: node sample_bot.js [matchId] [serverUrl]
 */

const matchId = process.argv[2] || 'gw_demo';
const serverUrl = process.argv[3] || 'http://localhost:3000';

const GRID_SIZE = 6;

function getAdjacent(index) {
  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const adj = [];
  if (row > 0) adj.push(index - GRID_SIZE);
  if (row < GRID_SIZE - 1) adj.push(index + GRID_SIZE);
  if (col > 0) adj.push(index - 1);
  if (col < GRID_SIZE - 1) adj.push(index + 1);
  return adj;
}

async function run() {
  console.log(`🤖 Agent Bot joining Match [${matchId}] at ${serverUrl}...`);

  // 1. Join match
  let joinRes = await fetch(`${serverUrl}/api/match/${matchId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'AlphaTactician-AI', isBot: true })
  });
  let joinData = await joinRes.json();
  
  let myId;
  if (joinData.ok) {
    myId = joinData.playerId;
    console.log(`✅ Joined as Player ${myId} (Color: ${joinData.color})`);
  } else {
    console.log(`⚠️ Join error or spectating: ${joinData.error}`);
    myId = 1; // Default
  }

  // 2. Play loop
  while (true) {
    await new Promise((r) => setTimeout(r, 1500));

    try {
      const stateRes = await fetch(`${serverUrl}/api/match/${matchId}/state`);
      const stateData = await stateRes.json();
      if (!stateData.ok) break;

      const match = stateData.match;
      if (match.status !== 'ACTIVE') {
        console.log(`🏁 Match finished! Winner: Player ${match.winner}`);
        break;
      }

      if (match.currentTurn === myId) {
        console.log(`🎯 Turn ${match.turnNumber} - Executing strategic moves...`);

        // Find tiles we own with > 1 army
        const owned = match.board.filter((c) => c.owner === myId && c.armies > 1);
        owned.sort((a, b) => b.armies - a.armies);

        let moved = false;
        for (const src of owned) {
          const adj = getAdjacent(src.index);
          const neighbors = adj.map((idx) => match.board[idx]);

          // Priority 1: Conquerable enemy/neutral tiles
          const enemies = neighbors.filter((n) => n.owner !== myId);
          enemies.sort((a, b) => a.armies - b.armies);

          for (const target of enemies) {
            if (src.armies - 1 > target.armies) {
              console.log(`⚔️ Attacking cell ${target.index} (${target.armies} armies) from ${src.index} (${src.armies} armies)`);
              await fetch(`${serverUrl}/api/match/${matchId}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  playerId: myId,
                  fromCell: src.index,
                  toCell: target.index,
                  armies: src.armies - 1
                })
              });
              moved = true;
              break;
            }
          }
          if (moved) break;
        }

        // End Turn
        console.log(`⏭️ Ending turn for Player ${myId}`);
        await fetch(`${serverUrl}/api/match/${matchId}/end-turn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: myId })
        });
      }
    } catch (err) {
      console.error('Bot loop tick error:', err.message);
    }
  }
}

run();
