'use strict';

const {
  createDeck,
  dealCards,
  resolveTrick,
  canPlayCard,
  calculateRoundScore,
} = require('./gameEngine');

// In-memory store: roomCode → GameRoom
const rooms = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRoom(code) {
  return rooms.get(code) || null;
}

// ─── Lobby ────────────────────────────────────────────────────────────────────
function createRoom(hostSocketId, hostName) {
  let code;
  do { code = generateCode(); } while (rooms.has(code));

  const room = {
    code,
    host: hostSocketId,
    players: [{
      id: hostSocketId,
      name: hostName,
      teamIndex: 0,
      seatIndex: 0,
    }],
    playerCount: 4,          // default; host can change before start
    state: 'lobby',           // lobby | playing | finished
    game: null,
    matchScores: { 0: 0, 1: 0 },
    winTarget: 7,
  };

  rooms.set(code, room);
  return room;
}

function joinRoom(code, socketId, playerName) {
  const room = rooms.get(code);
  if (!room)                                    return { error: 'Room not found' };
  if (room.state !== 'lobby')                   return { error: 'Game already started' };
  if (room.players.length >= room.playerCount)  return { error: 'Room is full' };
  if (room.players.find(p => p.id === socketId)) return { error: 'Already in room' };

  const seatIndex = room.players.length;
  const teamIndex = seatIndex % 2; // alternate: seat 0,2,4 → team 0; seat 1,3,5 → team 1

  room.players.push({ id: socketId, name: playerName, teamIndex, seatIndex });
  return { room };
}

function setPlayerCount(code, hostSocketId, count) {
  const room = rooms.get(code);
  if (!room)                          return { error: 'Room not found' };
  if (room.host !== hostSocketId)     return { error: 'Only host can change settings' };
  if (![4, 6, 8].includes(count))     return { error: 'Player count must be 4, 6, or 8' };
  if (room.state !== 'lobby')         return { error: 'Cannot change settings mid-game' };

  room.playerCount = count;
  return { room };
}

// ─── Game Start ───────────────────────────────────────────────────────────────
function startGame(code, hostSocketId) {
  const room = rooms.get(code);
  if (!room)                              return { error: 'Room not found' };
  if (room.host !== hostSocketId)         return { error: 'Only host can start' };
  if (room.players.length !== room.playerCount) {
    return { error: `Need ${room.playerCount} players, have ${room.players.length}` };
  }

  const deck = createDeck(room.playerCount);
  const handsBySeat = dealCards(deck, room.playerCount);

  // Map seat index → socket id; build per-player hand lookup
  const handsById = {};
  room.players.forEach((p, i) => {
    handsById[p.id] = handsBySeat[i];
  });

  const totalTricks = deck.length / room.playerCount;
  // First player to lead is seat index 0 (simplified; classic rule = right of dealer)
  const firstTurn = room.players[0].id;

  room.state = 'playing';
  room.game = {
    hands: handsById,           // { socketId → Card[] }
    trick: [],                  // current trick: [{playerId, card}]
    trickHistory: [],           // completed tricks
    trump: null,                // suit string or null (Cut Mode)
    ledSuit: null,              // suit of first card in current trick
    currentTurn: firstTurn,
    tricksWon: { 0: 0, 1: 0 }, // keyed by teamIndex
    tensWon: { 0: 0, 1: 0 },
    totalTricks,
  };

  return { room };
}

// ─── Play Card ────────────────────────────────────────────────────────────────
function playCard(code, socketId, cardId) {
  const room = rooms.get(code);
  if (!room)                          return { error: 'Room not found' };
  if (room.state !== 'playing')       return { error: 'No active game' };

  const game = room.game;
  if (game.currentTurn !== socketId)  return { error: 'Not your turn' };

  const player = room.players.find(p => p.id === socketId);
  const hand = game.hands[socketId];
  const cardIndex = hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1)               return { error: 'Card not in your hand' };

  const card = hand[cardIndex];

  // Enforce follow-suit
  if (game.trick.length > 0 && !canPlayCard(card, hand, game.ledSuit)) {
    return { error: 'You must follow the led suit' };
  }

  // Remove card from hand
  hand.splice(cardIndex, 1);

  // First card in trick sets the led suit
  if (game.trick.length === 0) game.ledSuit = card.suit;

  game.trick.push({ playerId: socketId, card, teamIndex: player.teamIndex });

  const playerOrder = room.players.map(p => p.id);

  // ── Trick complete? ──────────────────────────────────────────────────────
  if (game.trick.length === room.playerCount) {
    const { winnerId, newTrump } = resolveTrick(game.trick, game.ledSuit, game.trump);
    if (newTrump && !game.trump) game.trump = newTrump;

    const winnerPlayer = room.players.find(p => p.id === winnerId);
    game.tricksWon[winnerPlayer.teamIndex]++;

    // Count 10s in this trick
    game.trick.forEach(t => {
      if (t.card.rank === '10') game.tensWon[t.teamIndex]++;
    });

    const completedTrick = {
      trick: [...game.trick],
      winnerId,
      trump: game.trump,
    };
    game.trickHistory.push(completedTrick);

    // Reset for next trick
    game.trick = [];
    game.ledSuit = null;
    game.currentTurn = winnerId;

    // ── Round over? (all hands empty) ──────────────────────────────────
    const allHandsEmpty = room.players.every(p => game.hands[p.id].length === 0);
    if (allHandsEmpty) {
      const { scores, mendikot } = calculateRoundScore(
        game.tricksWon,
        game.tensWon,
        game.totalTricks,
      );

      room.matchScores[0] += scores[0];
      room.matchScores[1] += scores[1];

      const matchWinner = room.matchScores[0] >= room.winTarget ? 0
        : room.matchScores[1] >= room.winTarget ? 1
        : null;

      // Reset game state to lobby for another round (host must restart)
      room.state = 'finished';

      return {
        room,
        event: 'roundEnd',
        data: {
          scores,
          mendikot,
          tricksWon: { ...game.tricksWon },
          tensWon: { ...game.tensWon },
          matchScores: { ...room.matchScores },
          matchWinner,
        },
      };
    }

    return {
      room,
      event: 'trickEnd',
      data: {
        winnerId,
        trick: completedTrick.trick,
        trump: game.trump,
        tricksWon: { ...game.tricksWon },
        tensWon: { ...game.tensWon },
      },
    };
  }

  // ── Trick still in progress — advance turn clockwise ────────────────────
  const currentIndex = playerOrder.indexOf(socketId);
  game.currentTurn = playerOrder[(currentIndex + 1) % room.playerCount];

  return {
    room,
    event: 'cardPlayed',
    data: {
      playerId: socketId,
      cardId,
      card,
      currentTurn: game.currentTurn,
      trickSoFar: game.trick,
    },
  };
}

// ─── New Round (same players) ─────────────────────────────────────────────────
function startNewRound(code, hostSocketId) {
  const room = rooms.get(code);
  if (!room)                      return { error: 'Room not found' };
  if (room.host !== hostSocketId) return { error: 'Only host can start next round' };
  if (room.state !== 'finished')  return { error: 'Round is still in progress' };

  // Re-use same players, re-deal
  room.state = 'lobby';
  return startGame(code, hostSocketId);
}

// ─── Disconnect Handling ──────────────────────────────────────────────────────
function handleDisconnect(socketId) {
  for (const [code, room] of rooms.entries()) {
    const playerIndex = room.players.findIndex(p => p.id === socketId);
    if (playerIndex !== -1) {
      if (room.state === 'lobby') {
        room.players.splice(playerIndex, 1);
        if (room.players.length === 0) {
          rooms.delete(code);
          return { code, room: null };
        }
        if (room.host === socketId) room.host = room.players[0].id;
      }
      // In playing/finished state: keep player slot (reconnect handling would go here)
      return { code, room };
    }
  }
  return null;
}

module.exports = {
  createRoom,
  joinRoom,
  setPlayerCount,
  startGame,
  startNewRound,
  playCard,
  handleDisconnect,
  getRoom,
};
