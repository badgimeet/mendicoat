'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const {
  createRoom,
  joinRoom,
  setPlayerCount,
  startGame,
  startNewRound,
  playCard,
  handleDisconnect,
  getRoom,
} = require('./roomManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../client')));

// Catch-all: serve index.html for any unknown route (Express 5 syntax)
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// ─── Utilities ────────────────────────────────────────────────────────────────
/** Strip private hand data from room before broadcasting to all players */
function publicRoom(room) {
  return {
    code: room.code,
    host: room.host,
    playerCount: room.playerCount,
    players: room.players,
    state: room.state,
    matchScores: room.matchScores,
    winTarget: room.winTarget,
  };
}

/** Build the team name map {0: 'Team A', 1: 'Team B'} from player names */
function buildTeamNames(players) {
  const names = { 0: [], 1: [] };
  players.forEach(p => names[p.teamIndex].push(p.name));
  return {
    0: names[0].join(' & ') || 'Team A',
    1: names[1].join(' & ') || 'Team B',
  };
}

// ─── Socket Events ────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);

  // ── Create Room ─────────────────────────────────────────────────────────
  socket.on('createRoom', ({ name }, cb) => {
    if (!name || !name.trim()) return cb({ error: 'Name is required' });
    const room = createRoom(socket.id, name.trim());
    socket.join(room.code);
    console.log(`[Room] Created: ${room.code} by "${name}"`);
    cb({ code: room.code, room: publicRoom(room) });
  });

  // ── Join Room ───────────────────────────────────────────────────────────
  socket.on('joinRoom', ({ code, name }, cb) => {
    if (!name || !name.trim()) return cb({ error: 'Name is required' });
    const result = joinRoom(code.toUpperCase(), socket.id, name.trim());
    if (result.error) return cb({ error: result.error });

    socket.join(result.room.code);
    // Broadcast updated player list to everyone in the room
    io.to(result.room.code).emit('lobbyUpdate', {
      players: result.room.players,
      playerCount: result.room.playerCount,
      host: result.room.host,
    });
    cb({ room: publicRoom(result.room) });
  });

  // ── Set Player Count (host only) ────────────────────────────────────────
  socket.on('setPlayerCount', ({ code, count }, cb) => {
    const result = setPlayerCount(code, socket.id, count);
    if (result.error) return cb({ error: result.error });

    io.to(code).emit('lobbyUpdate', {
      players: result.room.players,
      playerCount: result.room.playerCount,
      host: result.room.host,
    });
    cb({ ok: true });
  });

  // ── Start Game (host only) ──────────────────────────────────────────────
  socket.on('startGame', ({ code }, cb) => {
    const result = startGame(code, socket.id);
    if (result.error) return cb({ error: result.error });

    const room = result.room;
    const teamNames = buildTeamNames(room.players);

    // Send each player their private hand + shared game info
    room.players.forEach(p => {
      io.to(p.id).emit('gameStart', {
        hand: room.game.hands[p.id],
        players: room.players,
        teamNames,
        currentTurn: room.game.currentTurn,
        trump: null,
        myId: p.id,
        seatIndex: p.seatIndex,
        teamIndex: p.teamIndex,
        totalTricks: room.game.totalTricks,
        matchScores: room.matchScores,
        winTarget: room.winTarget,
      });
    });

    cb({ ok: true });
  });

  // ── Start New Round (host only) ─────────────────────────────────────────
  socket.on('startNewRound', ({ code }, cb) => {
    const result = startNewRound(code, socket.id);
    if (result.error) return cb({ error: result.error });

    const room = result.room;
    const teamNames = buildTeamNames(room.players);

    room.players.forEach(p => {
      io.to(p.id).emit('gameStart', {
        hand: room.game.hands[p.id],
        players: room.players,
        teamNames,
        currentTurn: room.game.currentTurn,
        trump: null,
        myId: p.id,
        seatIndex: p.seatIndex,
        teamIndex: p.teamIndex,
        totalTricks: room.game.totalTricks,
        matchScores: room.matchScores,
        winTarget: room.winTarget,
      });
    });

    cb({ ok: true });
  });

  // ── Play Card ───────────────────────────────────────────────────────────
  socket.on('playCard', ({ code, cardId }, cb) => {
    const result = playCard(code, socket.id, cardId);
    if (result.error) return cb({ error: result.error });

    const room = result.room;

    if (result.event === 'cardPlayed') {
      io.to(code).emit('cardPlayed', result.data);
      // Send updated private hand to the player who played
      io.to(socket.id).emit('handUpdate', { hand: room.game.hands[socket.id] });

    } else if (result.event === 'trickEnd') {
      // Send hand updates to everyone since trick is over
      room.players.forEach(p => {
        io.to(p.id).emit('handUpdate', { hand: room.game.hands[p.id] });
      });
      io.to(code).emit('trickEnd', result.data);

    } else if (result.event === 'roundEnd') {
      const teamNames = buildTeamNames(room.players);
      io.to(code).emit('roundEnd', { ...result.data, teamNames });

      if (result.data.matchWinner !== null) {
        io.to(code).emit('matchOver', {
          winner: result.data.matchWinner,
          matchScores: result.data.matchScores,
          teamNames,
        });
      }
    }

    cb({ ok: true });
  });

  // ── Disconnect ──────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id} disconnected`);
    const result = handleDisconnect(socket.id);
    if (result && result.room) {
      io.to(result.code).emit('playerLeft', {
        players: result.room.players,
        host: result.room.host,
      });
    }
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🃏 Mendicoat server running → http://localhost:${PORT}`);
});

module.exports = { app, server }; // for testing
