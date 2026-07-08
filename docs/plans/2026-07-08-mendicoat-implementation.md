# Mendicoat Card Game — Implementation Plan

> **For Antigravity:** REQUIRED SUB-SKILL: Load executing-plans to implement this plan task-by-task.

**Goal:** Build a real-time multiplayer Mendicoat card game with a Node.js/Socket.io backend and a stunning monochrome Vanilla JS frontend.

**Architecture:** Pure in-memory game state on the server; all state changes are broadcast as Socket.io events. The frontend is a single-page app (no routing library) that swaps visible screens based on socket events and user actions. No database for v1.

**Tech Stack:** Node.js 18+, Express 4, Socket.io 4, Vanilla HTML5/CSS3/ES6+, Google Fonts (Inter).

**Path Convention:** All server code lives in `server/`, all client code lives in `client/`. Tests live in `server/tests/`.

---

## Task 1: Project Scaffold & Git Init

**Files:**
- Create: `package.json`
- Create: `server/index.js` (empty placeholder)
- Create: `client/index.html` (empty placeholder)
- Create: `.gitignore`

**Step 1: Init npm project**
```bash
cd /Users/sachinbadgi/meet/code/Mendicoat
npm init -y
```
Expected: `package.json` created with default fields.

**Step 2: Install dependencies**
```bash
npm install express socket.io
npm install --save-dev nodemon jest
```
Expected: `node_modules/` created, `package.json` updated with deps.

**Step 3: Update package.json scripts**

Edit `package.json` to add:
```json
{
  "main": "server/index.js",
  "scripts": {
    "start": "node server/index.js",
    "dev": "nodemon server/index.js",
    "test": "jest --testPathPattern=server/tests"
  }
}
```

**Step 4: Create `.gitignore`**
```
node_modules/
*.log
.DS_Store
```

**Step 5: Create folder structure**
```bash
mkdir -p server/tests client/css client/js
touch server/index.js server/gameEngine.js server/roomManager.js
touch client/index.html client/css/style.css
touch client/js/app.js client/js/socket.js client/js/ui.js
```

**Step 6: Git init and first commit**
```bash
git init
git add .
git commit -m "chore: scaffold project structure"
```

---

## Task 2: Game Engine — Deck, Dealing, Card Model

**Files:**
- Create: `server/gameEngine.js`
- Create: `server/tests/gameEngine.deck.test.js`

**Step 1: Write failing tests**

`server/tests/gameEngine.deck.test.js`:
```js
const { createDeck, dealCards } = require('../gameEngine');

describe('createDeck', () => {
  test('returns 52 cards for 4 players', () => {
    const deck = createDeck(4);
    expect(deck).toHaveLength(52);
  });

  test('returns 48 cards for 6 players (2s removed)', () => {
    const deck = createDeck(6);
    expect(deck).toHaveLength(48);
    expect(deck.filter(c => c.rank === '2')).toHaveLength(0);
  });

  test('returns 48 cards for 8 players (2s removed)', () => {
    const deck = createDeck(8);
    expect(deck).toHaveLength(48);
    expect(deck.filter(c => c.rank === '2')).toHaveLength(0);
  });

  test('each card has suit, rank, value, id fields', () => {
    const deck = createDeck(4);
    const card = deck[0];
    expect(card).toHaveProperty('suit');
    expect(card).toHaveProperty('rank');
    expect(card).toHaveProperty('value');  // numeric 2-14
    expect(card).toHaveProperty('id');     // e.g. "AS", "10H"
  });
});

describe('dealCards', () => {
  test('deals 13 cards to each of 4 players', () => {
    const deck = createDeck(4);
    const hands = dealCards(deck, 4);
    expect(Object.keys(hands)).toHaveLength(4);
    Object.values(hands).forEach(hand => expect(hand).toHaveLength(13));
  });

  test('deals 8 cards to each of 6 players', () => {
    const deck = createDeck(6);
    const hands = dealCards(deck, 6);
    Object.values(hands).forEach(hand => expect(hand).toHaveLength(8));
  });

  test('deals 6 cards to each of 8 players', () => {
    const deck = createDeck(8);
    const hands = dealCards(deck, 8);
    Object.values(hands).forEach(hand => expect(hand).toHaveLength(6));
  });
});
```

**Step 2: Run test to verify it fails**
```bash
npm test -- --testPathPattern=gameEngine.deck
```
Expected: FAIL — `createDeck is not a function`

**Step 3: Implement `createDeck` and `dealCards` in `server/gameEngine.js`**
```js
const SUITS = ['S', 'H', 'D', 'C']; // Spades, Hearts, Diamonds, Clubs
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VALUES = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,
                      '9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };

function createDeck(playerCount) {
  let cards = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ id: `${rank}${suit}`, rank, suit, value: RANK_VALUES[rank] });
    }
  }
  // Remove 2s for 6 or 8 player games
  if (playerCount === 6 || playerCount === 8) {
    cards = cards.filter(c => c.rank !== '2');
  }
  return shuffle(cards);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function dealCards(deck, playerCount) {
  const cardsPerPlayer = deck.length / playerCount;
  const hands = {};
  for (let i = 0; i < playerCount; i++) {
    hands[i] = deck.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer);
  }
  return hands;
}

module.exports = { createDeck, dealCards };
```

**Step 4: Run test to verify it passes**
```bash
npm test -- --testPathPattern=gameEngine.deck
```
Expected: PASS — all 7 tests green.

**Step 5: Commit**
```bash
git add server/gameEngine.js server/tests/gameEngine.deck.test.js
git commit -m "feat: implement deck creation and card dealing"
```

---

## Task 3: Game Engine — Trick Logic & Trump Resolution

**Files:**
- Modify: `server/gameEngine.js`
- Create: `server/tests/gameEngine.trick.test.js`

**Step 1: Write failing tests**

`server/tests/gameEngine.trick.test.js`:
```js
const { resolveTrick, canPlayCard } = require('../gameEngine');

describe('resolveTrick', () => {
  test('highest led-suit card wins when no trump played', () => {
    const trick = [
      { playerId: 0, card: { suit: 'H', rank: 'K', value: 13 } },
      { playerId: 1, card: { suit: 'H', rank: 'A', value: 14 } },
      { playerId: 2, card: { suit: 'S', rank: 'A', value: 14 } }, // off-suit, no trump yet
      { playerId: 3, card: { suit: 'H', rank: '9', value: 9  } },
    ];
    const result = resolveTrick(trick, 'H', null); // ledSuit='H', trump=null
    expect(result.winnerId).toBe(1); // AH wins
  });

  test('trump card beats led-suit cards', () => {
    const trick = [
      { playerId: 0, card: { suit: 'H', rank: 'A', value: 14 } },
      { playerId: 1, card: { suit: 'S', rank: '3', value: 3  } }, // trump=S
      { playerId: 2, card: { suit: 'H', rank: 'K', value: 13 } },
      { playerId: 3, card: { suit: 'H', rank: 'Q', value: 12 } },
    ];
    const result = resolveTrick(trick, 'H', 'S');
    expect(result.winnerId).toBe(1); // 3S (trump) beats AH
  });

  test('highest trump wins when multiple trumps played', () => {
    const trick = [
      { playerId: 0, card: { suit: 'H', rank: 'A', value: 14 } },
      { playerId: 1, card: { suit: 'S', rank: '3', value: 3  } },
      { playerId: 2, card: { suit: 'S', rank: 'K', value: 13 } }, // higher trump
      { playerId: 3, card: { suit: 'H', rank: 'Q', value: 12 } },
    ];
    const result = resolveTrick(trick, 'H', 'S');
    expect(result.winnerId).toBe(2); // KS beats 3S
  });

  test('detects trump from first off-suit card when no trump set yet', () => {
    const trick = [
      { playerId: 0, card: { suit: 'H', rank: 'A', value: 14 } },
      { playerId: 1, card: { suit: 'H', rank: '9', value: 9  } },
      { playerId: 2, card: { suit: 'D', rank: '5', value: 5  } }, // first off-suit → trump = D
      { playerId: 3, card: { suit: 'D', rank: 'K', value: 13 } }, // higher trump
    ];
    const result = resolveTrick(trick, 'H', null);
    expect(result.newTrump).toBe('D');
    expect(result.winnerId).toBe(3); // KD beats 5D as highest trump
  });
});

describe('canPlayCard', () => {
  test('must follow suit if player has led suit', () => {
    const hand = [
      { suit: 'H', rank: 'K' }, { suit: 'S', rank: 'A' }
    ];
    expect(canPlayCard({ suit: 'S', rank: 'A' }, hand, 'H')).toBe(false);
    expect(canPlayCard({ suit: 'H', rank: 'K' }, hand, 'H')).toBe(true);
  });

  test('can play any card if player has no led suit', () => {
    const hand = [{ suit: 'D', rank: '5' }, { suit: 'S', rank: '7' }];
    expect(canPlayCard({ suit: 'D', rank: '5' }, hand, 'H')).toBe(true);
    expect(canPlayCard({ suit: 'S', rank: '7' }, hand, 'H')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**
```bash
npm test -- --testPathPattern=gameEngine.trick
```
Expected: FAIL — `resolveTrick is not a function`

**Step 3: Implement trick logic in `server/gameEngine.js`**

Append to `server/gameEngine.js`:
```js
function resolveTrick(trick, ledSuit, trump) {
  let newTrump = trump;

  // Detect trump from first off-suit card if none set
  if (!trump) {
    const offSuit = trick.find(t => t.card.suit !== ledSuit);
    if (offSuit) newTrump = offSuit.card.suit;
  }

  // Determine winner
  let winner = trick[0];
  for (let i = 1; i < trick.length; i++) {
    const challenger = trick[i];
    if (isBetter(challenger.card, winner.card, ledSuit, newTrump)) {
      winner = challenger;
    }
  }

  return { winnerId: winner.playerId, newTrump };
}

function isBetter(challenger, current, ledSuit, trump) {
  const cIsTrump = trump && challenger.suit === trump;
  const wIsTrump = trump && current.suit === trump;

  if (cIsTrump && !wIsTrump) return true;
  if (!cIsTrump && wIsTrump) return false;
  // Both trump or both non-trump: compare values, but off-suit non-trump never beats
  if (!cIsTrump && challenger.suit !== ledSuit) return false;
  if (!wIsTrump && current.suit !== ledSuit) return true;
  return challenger.value > current.value;
}

function canPlayCard(card, hand, ledSuit) {
  const hasLedSuit = hand.some(c => c.suit === ledSuit);
  if (!hasLedSuit) return true;
  return card.suit === ledSuit;
}

module.exports = { createDeck, dealCards, resolveTrick, canPlayCard };
```

**Step 4: Run test to verify it passes**
```bash
npm test -- --testPathPattern=gameEngine.trick
```
Expected: PASS — all 6 tests green.

**Step 5: Commit**
```bash
git add server/gameEngine.js server/tests/gameEngine.trick.test.js
git commit -m "feat: implement trick resolution and play validation"
```

---

## Task 4: Game Engine — Scoring

**Files:**
- Modify: `server/gameEngine.js`
- Create: `server/tests/gameEngine.scoring.test.js`

**Step 1: Write failing tests**

`server/tests/gameEngine.scoring.test.js`:
```js
const { calculateRoundScore } = require('../gameEngine');

describe('calculateRoundScore', () => {
  // tricksWon: { 0: n, 1: n } — team 0 and team 1 trick counts
  // tensWon: { 0: n, 1: n } — team 0 and team 1 ten counts

  test('team with 7+ tricks gets 1 point', () => {
    const result = calculateRoundScore({ 0: 8, 1: 5 }, { 0: 2, 1: 2 }, 13);
    expect(result.scores[0]).toBe(1);
    expect(result.scores[1]).toBe(0);
  });

  test('mendikot (all 4 tens) gives 2 points', () => {
    const result = calculateRoundScore({ 0: 10, 1: 3 }, { 0: 4, 1: 0 }, 13);
    expect(result.scores[0]).toBe(2);
    expect(result.scores[1]).toBe(0);
    expect(result.mendikot).toBe(true);
  });

  test('exactly 6 tricks threshold means other team wins', () => {
    const result = calculateRoundScore({ 0: 6, 1: 7 }, { 0: 2, 1: 2 }, 13);
    expect(result.scores[0]).toBe(0);
    expect(result.scores[1]).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**
```bash
npm test -- --testPathPattern=gameEngine.scoring
```
Expected: FAIL

**Step 3: Implement scoring in `server/gameEngine.js`**

Append to `server/gameEngine.js`:
```js
function calculateRoundScore(tricksWon, tensWon, totalTricks) {
  const threshold = Math.ceil(totalTricks / 2) + (totalTricks % 2 === 0 ? 1 : 0);
  // For 13 tricks: need 7. For 8: need 5. For 6: need 4.
  const half = Math.floor(totalTricks / 2) + 1;
  const scores = { 0: 0, 1: 0 };
  let mendikot = false;

  if (tensWon[0] === 4) {
    scores[0] = 2;
    mendikot = true;
  } else if (tensWon[1] === 4) {
    scores[1] = 2;
    mendikot = true;
  } else if (tricksWon[0] >= half) {
    scores[0] = 1;
  } else if (tricksWon[1] >= half) {
    scores[1] = 1;
  }

  return { scores, mendikot };
}

module.exports = { createDeck, dealCards, resolveTrick, canPlayCard, calculateRoundScore };
```

**Step 4: Run all tests**
```bash
npm test
```
Expected: PASS — all tests green.

**Step 5: Commit**
```bash
git add server/gameEngine.js server/tests/gameEngine.scoring.test.js
git commit -m "feat: implement round scoring and mendikot detection"
```

---

## Task 5: Room Manager

**Files:**
- Create: `server/roomManager.js`

No unit tests for this module (Socket.io integration testing is done manually); logic is straightforward CRUD on a Map.

**Step 1: Implement `server/roomManager.js`**
```js
const { createDeck, dealCards, resolveTrick, canPlayCard, calculateRoundScore } = require('./gameEngine');

const rooms = new Map(); // roomCode → GameRoom

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createRoom(hostSocketId, hostName) {
  let code;
  do { code = generateCode(); } while (rooms.has(code));

  const room = {
    code,
    host: hostSocketId,
    players: [{ id: hostSocketId, name: hostName, teamIndex: 0, seatIndex: 0 }],
    playerCount: 4,  // default
    teams: [[], []],
    state: 'lobby',  // lobby | playing | finished
    game: null,
    matchScores: { 0: 0, 1: 0 },
    winTarget: 7,
  };
  rooms.set(code, room);
  return room;
}

function joinRoom(code, socketId, playerName) {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };
  if (room.state !== 'lobby') return { error: 'Game already started' };
  if (room.players.length >= room.playerCount) return { error: 'Room is full' };
  if (room.players.find(p => p.id === socketId)) return { error: 'Already in room' };

  const seatIndex = room.players.length;
  const teamIndex = seatIndex % 2; // alternate teams: 0,1,0,1,...
  room.players.push({ id: socketId, name: playerName, teamIndex, seatIndex });
  return { room };
}

function setPlayerCount(code, hostSocketId, count) {
  const room = rooms.get(code);
  if (!room || room.host !== hostSocketId) return { error: 'Not host' };
  if (![4, 6, 8].includes(count)) return { error: 'Invalid player count' };
  room.playerCount = count;
  return { room };
}

function startGame(code, hostSocketId) {
  const room = rooms.get(code);
  if (!room || room.host !== hostSocketId) return { error: 'Not host' };
  if (room.players.length !== room.playerCount) return { error: 'Not enough players' };

  const deck = createDeck(room.playerCount);
  const hands = dealCards(deck, room.playerCount);

  // Map seat indices to socket IDs
  const playerOrder = room.players.map(p => p.id);
  const handsById = {};
  playerOrder.forEach((pid, i) => { handsById[pid] = hands[i]; });

  room.state = 'playing';
  room.game = {
    hands: handsById,
    trick: [],             // current trick: [{playerId, card}]
    trickHistory: [],      // completed tricks
    trump: null,           // suit string or null
    ledSuit: null,
    currentTurn: playerOrder[0], // player to dealer's right (index 0 for simplicity)
    tricksWon: { 0: 0, 1: 0 },  // by team index
    tensWon: { 0: 0, 1: 0 },
    totalTricks: deck.length / room.playerCount === 13 ? 13 :
                 deck.length / room.playerCount === 8  ? 8  : 6,
    round: 1,
  };
  return { room };
}

function playCard(code, socketId, cardId) {
  const room = rooms.get(code);
  if (!room || room.state !== 'playing') return { error: 'No active game' };

  const game = room.game;
  if (game.currentTurn !== socketId) return { error: 'Not your turn' };

  const player = room.players.find(p => p.id === socketId);
  const hand = game.hands[socketId];
  const cardIndex = hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) return { error: 'Card not in hand' };

  const card = hand[cardIndex];
  const ledSuit = game.ledSuit || card.suit;

  if (game.trick.length > 0 && !canPlayCard(card, hand, game.ledSuit)) {
    return { error: 'Must follow suit' };
  }

  // Remove card from hand
  hand.splice(cardIndex, 1);

  // Set led suit on first card
  if (game.trick.length === 0) game.ledSuit = card.suit;

  game.trick.push({ playerId: socketId, card, teamIndex: player.teamIndex });

  const playerOrder = room.players.map(p => p.id);

  // Check if trick is complete
  if (game.trick.length === room.playerCount) {
    const { winnerId, newTrump } = resolveTrick(game.trick, game.ledSuit, game.trump);
    if (newTrump && !game.trump) game.trump = newTrump;

    const winnerPlayer = room.players.find(p => p.id === winnerId);
    game.tricksWon[winnerPlayer.teamIndex]++;

    // Count 10s
    game.trick.forEach(t => {
      if (t.card.rank === '10') game.tensWon[t.teamIndex]++;
    });

    game.trickHistory.push({ trick: [...game.trick], winnerId });
    game.trick = [];
    game.ledSuit = null;
    game.currentTurn = winnerId;

    // Check if round over (all cards played)
    const allHandsEmpty = room.players.every(p => game.hands[p.id].length === 0);
    if (allHandsEmpty) {
      const { scores, mendikot } = calculateRoundScore(
        game.tricksWon, game.tensWon, game.totalTricks
      );
      room.matchScores[0] += scores[0];
      room.matchScores[1] += scores[1];

      const winner = room.matchScores[0] >= room.winTarget ? 0
                   : room.matchScores[1] >= room.winTarget ? 1 : null;

      return { room, event: 'roundEnd', data: { scores, mendikot, matchScores: room.matchScores, matchWinner: winner } };
    }

    return { room, event: 'trickEnd', data: { winnerId, trick: game.trickHistory.at(-1).trick, trump: game.trump } };
  }

  // Advance turn (clockwise)
  const currentIndex = playerOrder.indexOf(socketId);
  game.currentTurn = playerOrder[(currentIndex + 1) % room.playerCount];

  return { room, event: 'cardPlayed', data: { playerId: socketId, cardId, currentTurn: game.currentTurn } };
}

function handleDisconnect(socketId) {
  for (const [code, room] of rooms.entries()) {
    const playerIndex = room.players.findIndex(p => p.id === socketId);
    if (playerIndex !== -1) {
      if (room.state === 'lobby') {
        room.players.splice(playerIndex, 1);
        if (room.players.length === 0) rooms.delete(code);
        else if (room.host === socketId) room.host = room.players[0].id;
      }
      return { code, room };
    }
  }
  return null;
}

function getRoom(code) { return rooms.get(code) || null; }

module.exports = { createRoom, joinRoom, setPlayerCount, startGame, playCard, handleDisconnect, getRoom };
```

**Step 2: Commit**
```bash
git add server/roomManager.js
git commit -m "feat: implement room manager with full game lifecycle"
```

---

## Task 6: Server Entry Point (Express + Socket.io)

**Files:**
- Modify: `server/index.js`

**Step 1: Implement `server/index.js`**
```js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const {
  createRoom, joinRoom, setPlayerCount,
  startGame, playCard, handleDisconnect, getRoom
} = require('./roomManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static client files
app.use(express.static(path.join(__dirname, '../client')));

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  socket.on('createRoom', ({ name }, cb) => {
    const room = createRoom(socket.id, name);
    socket.join(room.code);
    cb({ code: room.code, room: sanitizeRoom(room, socket.id) });
    console.log(`[Room] Created: ${room.code} by ${name}`);
  });

  socket.on('joinRoom', ({ code, name }, cb) => {
    const result = joinRoom(code.toUpperCase(), socket.id, name);
    if (result.error) return cb({ error: result.error });
    socket.join(code.toUpperCase());
    const room = result.room;
    // Notify all in room of new player list
    io.to(room.code).emit('lobbyUpdate', { players: room.players, playerCount: room.playerCount });
    cb({ room: sanitizeRoom(room, socket.id) });
  });

  socket.on('setPlayerCount', ({ code, count }, cb) => {
    const result = setPlayerCount(code, socket.id, count);
    if (result.error) return cb({ error: result.error });
    io.to(code).emit('lobbyUpdate', { players: result.room.players, playerCount: count });
    cb({ ok: true });
  });

  socket.on('startGame', ({ code }, cb) => {
    const result = startGame(code, socket.id);
    if (result.error) return cb({ error: result.error });
    const room = result.room;
    // Send each player their private hand
    room.players.forEach(p => {
      io.to(p.id).emit('gameStart', {
        hand: room.game.hands[p.id],
        players: room.players,
        currentTurn: room.game.currentTurn,
        trump: null,
        seatIndex: p.seatIndex,
        teamIndex: p.teamIndex,
      });
    });
    cb({ ok: true });
  });

  socket.on('playCard', ({ code, cardId }, cb) => {
    const result = playCard(code, socket.id, cardId);
    if (result.error) return cb({ error: result.error });

    const room = result.room;

    if (result.event === 'cardPlayed') {
      io.to(code).emit('cardPlayed', result.data);
    } else if (result.event === 'trickEnd') {
      io.to(code).emit('trickEnd', result.data);
      // Send updated hand to the player who just played
      io.to(socket.id).emit('handUpdate', { hand: room.game.hands[socket.id] });
    } else if (result.event === 'roundEnd') {
      io.to(code).emit('roundEnd', result.data);
      if (result.data.matchWinner !== null) {
        io.to(code).emit('matchOver', { winner: result.data.matchWinner, matchScores: result.data.matchScores });
      }
    }
    // Always send hand update after playing
    io.to(socket.id).emit('handUpdate', { hand: room.game.hands[socket.id] });
    cb({ ok: true });
  });

  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    const result = handleDisconnect(socket.id);
    if (result) {
      io.to(result.code).emit('playerLeft', { players: result.room.players });
    }
  });
});

// Sanitize room: don't send other players' hands
function sanitizeRoom(room, mySocketId) {
  return {
    code: room.code,
    host: room.host,
    playerCount: room.playerCount,
    players: room.players,
    state: room.state,
    matchScores: room.matchScores,
  };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🃏 Mendicoat server running on http://localhost:${PORT}`));
```

**Step 2: Start and verify**
```bash
npm run dev
```
Expected: `🃏 Mendicoat server running on http://localhost:3000` — no crash.

**Step 3: Commit**
```bash
git add server/index.js
git commit -m "feat: implement express + socket.io server with all game events"
```

---

## Task 7: Client HTML Shell

**Files:**
- Modify: `client/index.html`

**Step 1: Write `client/index.html`**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mendicoat — Classic Card Game</title>
  <meta name="description" content="Play Mendicoat online with friends. The classic Indian trick-taking card game, beautifully redesigned." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>

  <!-- SCREEN: Lobby -->
  <div id="screen-lobby" class="screen active">
    <div class="lobby-bg">
      <div class="card-deco card-deco-1">♠</div>
      <div class="card-deco card-deco-2">♥</div>
      <div class="card-deco card-deco-3">♦</div>
      <div class="card-deco card-deco-4">♣</div>
    </div>
    <div class="lobby-container">
      <div class="logo">
        <div class="logo-suit">♠</div>
        <h1>Mendicoat</h1>
        <p class="tagline">The Classic Indian Card Game</p>
      </div>
      <div class="glass-panel lobby-panel">
        <div class="tab-row">
          <button id="btn-tab-create" class="tab-btn active" onclick="App.switchTab('create')">Create Room</button>
          <button id="btn-tab-join" class="tab-btn" onclick="App.switchTab('join')">Join Room</button>
        </div>
        <div id="tab-create" class="tab-content active">
          <label for="input-create-name">Your Name</label>
          <input id="input-create-name" type="text" placeholder="Enter your name" maxlength="20" />
          <button id="btn-create" class="btn-primary" onclick="App.createRoom()">Create Room</button>
        </div>
        <div id="tab-join" class="tab-content">
          <label for="input-join-name">Your Name</label>
          <input id="input-join-name" type="text" placeholder="Enter your name" maxlength="20" />
          <label for="input-join-code">Room Code</label>
          <input id="input-join-code" type="text" placeholder="6-letter code" maxlength="6" style="text-transform:uppercase" />
          <button id="btn-join" class="btn-primary" onclick="App.joinRoom()">Join Room</button>
        </div>
        <div id="lobby-error" class="error-msg hidden"></div>
      </div>
    </div>
  </div>

  <!-- SCREEN: Waiting Room -->
  <div id="screen-waiting" class="screen">
    <div class="waiting-container">
      <div class="glass-panel waiting-panel">
        <div class="room-header">
          <div>
            <h2>Waiting Room</h2>
            <p class="room-code-label">Room Code: <span id="display-room-code" class="room-code"></span></p>
          </div>
          <button class="btn-icon" onclick="App.copyCode()" title="Copy code">📋</button>
        </div>

        <div id="host-controls" class="host-controls hidden">
          <label>Players</label>
          <div class="player-count-selector">
            <button class="count-btn active" data-count="4" onclick="App.setPlayerCount(4)">4</button>
            <button class="count-btn" data-count="6" onclick="App.setPlayerCount(6)">6</button>
            <button class="count-btn" data-count="8" onclick="App.setPlayerCount(8)">8</button>
          </div>
        </div>

        <div id="player-slots" class="player-slots"></div>

        <div id="waiting-status" class="waiting-status">Waiting for players...</div>

        <button id="btn-start" class="btn-primary hidden" onclick="App.startGame()">Start Game ▶</button>
      </div>
    </div>
  </div>

  <!-- SCREEN: Game Table -->
  <div id="screen-game" class="screen">
    <div class="game-hud">
      <div class="hud-left">
        <span class="hud-label">Round</span>
        <span id="hud-round" class="hud-value">1</span>
      </div>
      <div class="hud-center">
        <span class="hud-label">Trump</span>
        <span id="hud-trump" class="hud-value">—</span>
      </div>
      <div class="hud-right glass-panel-sm">
        <div class="score-row">
          <span id="score-team0-label" class="team-label t0">Team A</span>
          <span id="score-team0" class="score-num">0</span>
        </div>
        <div class="score-divider">vs</div>
        <div class="score-row">
          <span id="score-team1-label" class="team-label t1">Team B</span>
          <span id="score-team1" class="score-num">0</span>
        </div>
      </div>
    </div>

    <div class="table-area">
      <!-- Opponent player positions injected by ui.js -->
      <div id="opponents-area" class="opponents-area"></div>

      <!-- Center trick area -->
      <div class="table-surface">
        <div id="trick-area" class="trick-area"></div>
        <div id="trick-info" class="trick-info"></div>
      </div>
    </div>

    <!-- My hand -->
    <div class="my-area">
      <div id="turn-indicator" class="turn-indicator hidden">Your Turn!</div>
      <div id="my-hand" class="my-hand"></div>
      <div class="my-info">
        <span id="my-name-display" class="my-name"></span>
        <span id="my-tricks" class="my-tricks">Tricks: 0</span>
      </div>
    </div>
  </div>

  <!-- SCREEN: Round End -->
  <div id="screen-round-end" class="screen">
    <div class="result-container">
      <div class="glass-panel result-panel">
        <h2 id="result-title">Round Over!</h2>
        <div id="result-mendikot" class="mendikot-badge hidden">⭐ MENDIKOT! ⭐</div>
        <div class="result-scores">
          <div class="result-team">
            <span id="result-team0-label" class="team-label t0">Team A</span>
            <span id="result-team0-round" class="result-pts"></span>
          </div>
          <div class="result-team">
            <span id="result-team1-label" class="team-label t1">Team B</span>
            <span id="result-team1-round" class="result-pts"></span>
          </div>
        </div>
        <div class="match-scores">
          <p>Match Score: <strong id="match-score-display"></strong></p>
        </div>
        <div id="match-winner-banner" class="match-winner hidden"></div>
        <button class="btn-primary" onclick="App.backToLobby()">Back to Lobby</button>
      </div>
    </div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script src="js/app.js"></script>
  <script src="js/socket.js"></script>
  <script src="js/ui.js"></script>
</body>
</html>
```

**Step 2: Commit**
```bash
git add client/index.html
git commit -m "feat: add SPA HTML shell with all screens"
```

---

## Task 8: CSS Design System (Monochrome Theme)

**Files:**
- Modify: `client/css/style.css`

**Step 1: Write the complete `client/css/style.css`**

Write the full CSS file with:
- CSS custom properties (design tokens)
- Reset and base styles
- Screen system (`.screen`, `.screen.active`)
- Lobby screen styles (hero, glass panel, tabs, inputs)
- Waiting room styles (player slots, team colors, host controls)
- Game table styles (HUD, table surface, opponents grid, my hand fan)
- Card styles (white card, suit colors, 10s gold glow, hover lift)
- Turn indicator animation
- Result screen styles
- Responsive adjustments
- Keyframe animations (card-slide-in, card-flip, glow-pulse, count-up)

(Full CSS content is in `client/css/style.css` — see Task 8 implementation for complete file)

**Step 2: Commit**
```bash
git add client/css/style.css
git commit -m "feat: implement full monochrome design system"
```

---

## Task 9: Client JavaScript — app.js (State + Screen Routing)

**Files:**
- Modify: `client/js/app.js`

Implements the `App` namespace with:
- `App.state` — local game state (myId, myHand, players, trump, etc.)
- `App.switchTab(tab)` — toggle create/join tabs
- `App.createRoom()` — emit createRoom, transition to waiting screen
- `App.joinRoom()` — emit joinRoom, transition to waiting screen
- `App.setPlayerCount(n)` — emit setPlayerCount
- `App.startGame()` — emit startGame
- `App.playCard(cardId)` — emit playCard with validation
- `App.copyCode()` — clipboard copy of room code
- `App.backToLobby()` — reset state, show lobby screen
- `App.showScreen(id)` — hide all screens, show target

**Step 2: Commit**
```bash
git add client/js/app.js
git commit -m "feat: implement client app state and screen routing"
```

---

## Task 10: Client JavaScript — socket.js (Socket.io Event Handlers)

**Files:**
- Modify: `client/js/socket.js`

Implements all incoming socket event handlers:
- `lobbyUpdate` → update waiting room player list
- `gameStart` → store hand, players, transition to game screen, render table
- `cardPlayed` → show card in trick area, update turn indicator
- `trickEnd` → animate trick winner, clear trick area, update trick counts
- `handUpdate` → re-render my hand
- `roundEnd` → show round end screen with scores
- `matchOver` → show match winner banner
- `playerLeft` → update player list display

**Step 2: Commit**
```bash
git add client/js/socket.js
git commit -m "feat: implement all socket.io client event handlers"
```

---

## Task 11: Client JavaScript — ui.js (Card Rendering & Table Layout)

**Files:**
- Modify: `client/js/ui.js`

Implements the `UI` namespace:
- `UI.renderCard(card, clickable)` — returns a `.card` DOM element with suit symbol, rank, color, gold glow for 10s
- `UI.renderHand(cards, myTurn, trump, ledSuit)` — renders fan of cards in `#my-hand`, attaches click handlers
- `UI.renderOpponents(players, myIndex, tricksWon)` — places opponent name tags around the table
- `UI.addCardToTrick(playerId, card, playerName)` — animates card onto trick area
- `UI.clearTrick(winnerId)` — sweeps trick to winner with animation
- `UI.updateTrump(suit)` — updates HUD trump display with suit symbol
- `UI.updateScores(matchScores, teams)` — updates score panel
- `UI.showTurnIndicator(isMyTurn)` — shows/hides "Your Turn!" indicator
- `UI.renderPlayerSlots(players, playerCount)` — renders waiting room player list with team badges
- `UI.renderResultScreen(data, teams)` — populates round-end screen

**Step 2: Commit**
```bash
git add client/js/ui.js
git commit -m "feat: implement card rendering and table layout UI"
```

---

## Task 12: Integration & End-to-End Verification

**Step 1: Run all unit tests**
```bash
npm test
```
Expected: All tests PASS (green).

**Step 2: Start development server**
```bash
npm run dev
```
Expected: Server starts on port 3000.

**Step 3: Manual smoke test (4-player game)**

Open 4 browser tabs to `http://localhost:3000`.

Checklist:
- [ ] Tab 1: Create room → waiting room shows, room code displayed
- [ ] Tabs 2-4: Join with code → all appear in waiting room with correct teams
- [ ] Tab 1 (host): Click Start Game → all tabs transition to game screen
- [ ] Each tab shows its own hand (13 cards)
- [ ] Active player tab shows "Your Turn!" indicator
- [ ] Playing a valid card moves it to trick area on all tabs
- [ ] Playing off-suit when holding led suit shows error (card not played)
- [ ] Trick resolves correctly, winner leads next trick
- [ ] Trump suit revealed correctly on first off-suit play
- [ ] 10s display gold glow
- [ ] Round ends, scores shown on round-end screen
- [ ] Score accumulates until 7 points → match winner shown

**Step 4: Final commit**
```bash
git add -A
git commit -m "feat: complete mendicoat card game v1"
```
