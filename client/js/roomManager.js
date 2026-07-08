// client/js/roomManager.js
// Browser ES module — runs only in the host's browser.
// Player IDs = PeerJS peer IDs (strings). Logic mirrors server/roomManager.js.
'use strict';

import { createDeck, dealCards, resolveTrick, canPlayCard, calculateRoundScore }
  from './gameEngine.js';

// Single active room per host
let room = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function getRoom() { return room; }

// ─── Lobby ────────────────────────────────────────────────────────────────────
/**
 * @param {string} hostPeerId
 * @param {string} hostName
 * @param {string} [roomCode]  Optional — caller can supply the code so it matches
 *                             the PeerJS peer ID. Falls back to generateCode().
 */
function createRoom(hostPeerId, hostName, roomCode) {
  room = {
    code:        roomCode || generateCode(),
    host:        hostPeerId,
    players:     [{ id: hostPeerId, name: hostName, teamIndex: 0, seatIndex: 0 }],
    playerCount: 4,          // host can change before start
    state:       'lobby',    // lobby | playing | finished
    game:        null,
    matchScores: { 0: 0, 1: 0 },
    winTarget:   7,
  };
  return room;
}


function joinRoom(peerId, playerName) {
  if (!room)                                   return { error: 'Room not found' };
  if (room.state !== 'lobby')                  return { error: 'Game already started' };
  if (room.players.length >= room.playerCount) return { error: 'Room is full' };
  if (room.players.find(p => p.id === peerId)) return { error: 'Already in room' };

  const seatIndex = room.players.length;
  const teamIndex = seatIndex % 2; // seat 0,2,4 → team 0; seat 1,3,5 → team 1
  room.players.push({ id: peerId, name: playerName, teamIndex, seatIndex });
  return { room };
}

function setPlayerCount(hostPeerId, count) {
  if (!room)                       return { error: 'Room not found' };
  if (room.host !== hostPeerId)    return { error: 'Only host can change settings' };
  if (![4, 6, 8].includes(count)) return { error: 'Player count must be 4, 6, or 8' };
  if (room.state !== 'lobby')      return { error: 'Cannot change settings mid-game' };
  room.playerCount = count;
  return { room };
}

// ─── Game Start ───────────────────────────────────────────────────────────────
function startGame(hostPeerId) {
  if (!room)                  return { error: 'Room not found' };
  if (room.host !== hostPeerId) return { error: 'Only host can start' };
  if (room.players.length !== room.playerCount)
    return { error: `Need ${room.playerCount} players, have ${room.players.length}` };

  const deck        = createDeck(room.playerCount);
  const handsBySeat = dealCards(deck, room.playerCount);

  // Map seat index → peer id; build per-player hand lookup
  const handsById = {};
  room.players.forEach((p, i) => { handsById[p.id] = handsBySeat[i]; });

  const totalTricks = deck.length / room.playerCount;
  const firstTurn   = room.players[0].id;

  room.state = 'playing';
  room.game  = {
    hands:        handsById,    // { peerId → Card[] }
    trick:        [],           // current trick: [{playerId, card, teamIndex}]
    trickHistory: [],
    trump:        null,         // suit string or null (Cut Mode)
    ledSuit:      null,
    currentTurn:  firstTurn,
    tricksWon:    { 0: 0, 1: 0 },
    tensWon:      { 0: 0, 1: 0 },
    mendiCards:   { 0: [], 1: [] }, // actual 10-card objects captured per team
    totalTricks,
  };
  return { room };
}

// ─── Play Card ────────────────────────────────────────────────────────────────
function playCard(peerId, cardId) {
  if (!room)                          return { error: 'Room not found' };
  if (room.state !== 'playing')       return { error: 'No active game' };

  const game = room.game;
  if (game.currentTurn !== peerId)    return { error: 'Not your turn' };

  const player    = room.players.find(p => p.id === peerId);
  const hand      = game.hands[peerId];
  const cardIndex = hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1)               return { error: 'Card not in your hand' };

  const card = hand[cardIndex];

  // Enforce follow-suit
  if (game.trick.length > 0 && !canPlayCard(card, hand, game.ledSuit))
    return { error: 'You must follow the led suit' };

  // Remove card from hand
  hand.splice(cardIndex, 1);

  // First card in trick sets the led suit
  if (game.trick.length === 0) game.ledSuit = card.suit;

  game.trick.push({ playerId: peerId, card, teamIndex: player.teamIndex });

  const playerOrder = room.players.map(p => p.id);

  // ── Trick complete? ──────────────────────────────────────────────────────
  if (game.trick.length === room.playerCount) {
    const { winnerId, newTrump } = resolveTrick(game.trick, game.ledSuit, game.trump);
    if (newTrump && !game.trump) game.trump = newTrump;

    const winnerPlayer = room.players.find(p => p.id === winnerId);
    game.tricksWon[winnerPlayer.teamIndex]++;
    game.trick.forEach(t => {
      if (t.card.rank === '10') {
        game.tensWon[t.teamIndex]++;
        game.mendiCards[t.teamIndex].push({ rank: t.card.rank, suit: t.card.suit });
      }
    });

    const completedTrick = { trick: [...game.trick], winnerId, trump: game.trump };
    game.trickHistory.push(completedTrick);

    // Reset for next trick
    game.trick       = [];
    game.ledSuit     = null;
    game.currentTurn = winnerId;

    // ── Round over? (all hands empty) ──────────────────────────────────
    const allHandsEmpty = room.players.every(p => game.hands[p.id].length === 0);
    if (allHandsEmpty) {
      const { scores, mendikot } = calculateRoundScore(
        game.tricksWon, game.tensWon, game.totalTricks,
      );
      room.matchScores[0] += scores[0];
      room.matchScores[1] += scores[1];
      const matchWinner = room.matchScores[0] >= room.winTarget ? 0
        : room.matchScores[1] >= room.winTarget ? 1
        : null;
      room.state = 'finished';
      return {
        room,
        event: 'roundEnd',
        data: {
          scores, mendikot,
          tricksWon:   { ...game.tricksWon },
          tensWon:     { ...game.tensWon },
          mendiCards:  { 0: [...game.mendiCards[0]], 1: [...game.mendiCards[1]] },
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
        trick:      completedTrick.trick,
        trump:      game.trump,
        tricksWon:  { ...game.tricksWon },
        tensWon:    { ...game.tensWon },
        mendiCards: { 0: [...game.mendiCards[0]], 1: [...game.mendiCards[1]] },
      },
    };
  }

  // ── Trick still in progress — advance turn clockwise ────────────────────
  const idx = playerOrder.indexOf(peerId);
  game.currentTurn = playerOrder[(idx + 1) % room.playerCount];

  return {
    room,
    event: 'cardPlayed',
    data: {
      playerId:    peerId,
      cardId,
      card,
      currentTurn: game.currentTurn,
      trickSoFar:  game.trick,
    },
  };
}

// ─── New Round (same players, re-deal) ────────────────────────────────────────
function startNewRound(hostPeerId) {
  if (!room)                      return { error: 'Room not found' };
  if (room.host !== hostPeerId)   return { error: 'Only host can start next round' };
  if (room.state !== 'finished')  return { error: 'Round is still in progress' };
  room.state = 'lobby';
  return startGame(hostPeerId);
}

// ─── Disconnect Handling ──────────────────────────────────────────────────────
function handleDisconnect(peerId) {
  if (!room) return null;
  const idx = room.players.findIndex(p => p.id === peerId);
  if (idx === -1) return null;
  if (room.state === 'lobby') {
    room.players.splice(idx, 1);
    if (room.players.length === 0) { room = null; return { room: null }; }
    if (room.host === peerId) room.host = room.players[0].id;
  }
  // In playing/finished state: keep player slot (no reconnect handling)
  return { room };
}

export { createRoom, joinRoom, setPlayerCount, startGame, startNewRound, playCard, handleDisconnect, getRoom };
