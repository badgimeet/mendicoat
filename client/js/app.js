'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   app.js — Client-side state management and screen routing
   Depends on: socket.js (SocketBridge), ui.js (UI)
═══════════════════════════════════════════════════════════════════════ */

const App = (() => {

  // ── State ──────────────────────────────────────────────────────────────
  const state = {
    myId:        null,
    myName:      null,
    roomCode:    null,
    isHost:      false,
    players:     [],
    teamNames:   { 0: 'Team A', 1: 'Team B' },
    playerCount: 4,
    myHand:      [],
    myTeam:      0,
    mySeat:      0,
    currentTurn: null,
    trump:       null,
    ledSuit:     null,
    tricksWon:   { 0: 0, 1: 0 },
    tensWon:     { 0: 0, 1: 0 },
    matchScores: { 0: 0, 1: 0 },
    totalTricks: 13,
    round:       1,
    winTarget:   7,
    trickCards:  [], // [{playerId, card, playerName}]
  };

  // ── Screen Management ──────────────────────────────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }

  // ── Tab Switching (lobby) ──────────────────────────────────────────────
  function switchTab(which) {
    ['create', 'join'].forEach(t => {
      document.getElementById(`tab-${t}`).classList.toggle('active', t === which);
      document.getElementById(`btn-tab-${t}`).classList.toggle('active', t === which);
      document.getElementById(`btn-tab-${t}`).setAttribute('aria-selected', t === which);
    });
    clearError();
  }

  // ── Error display ──────────────────────────────────────────────────────
  function showError(msg) {
    const el = document.getElementById('lobby-error');
    if (el) el.textContent = msg;
  }
  function clearError() {
    const el = document.getElementById('lobby-error');
    if (el) el.textContent = '';
  }

  // ── Create Room ────────────────────────────────────────────────────────
  function createRoom() {
    const name = document.getElementById('input-create-name').value.trim();
    if (!name) return showError('Please enter your name.');

    state.myName = name;
    SocketBridge.emit('createRoom', { name }, (res) => {
      if (res.error) return showError(res.error);
      state.myId    = SocketBridge.id();
      state.roomCode = res.code;
      state.isHost  = true;
      state.players = res.room.players;
      state.playerCount = res.room.playerCount;

      _enterWaitingRoom();
    });
  }

  // ── Join Room ──────────────────────────────────────────────────────────
  function joinRoom() {
    const name = document.getElementById('input-join-name').value.trim();
    const code = document.getElementById('input-join-code').value.trim().toUpperCase();
    if (!name) return showError('Please enter your name.');
    if (!code || code.length < 4) return showError('Please enter a valid room code.');

    state.myName = name;
    SocketBridge.emit('joinRoom', { name, code }, (res) => {
      if (res.error) return showError(res.error);
      state.myId    = SocketBridge.id();
      state.roomCode = res.room.code;
      state.isHost  = false;
      state.players = res.room.players;
      state.playerCount = res.room.playerCount;

      _enterWaitingRoom();
    });
  }

  // ── Enter waiting room (shared after create/join) ──────────────────────
  function _enterWaitingRoom() {
    document.getElementById('display-room-code').textContent = state.roomCode;
    showScreen('screen-waiting');

    const matchPreview = document.getElementById('match-score-preview');
    if (matchPreview) matchPreview.textContent = `First to ${state.winTarget} pts wins`;

    // Show host controls only to host
    const hostCtrls = document.getElementById('host-controls');
    if (hostCtrls) hostCtrls.classList.toggle('hidden', !state.isHost);

    UI.renderPlayerSlots(state.players, state.playerCount);
    _updateStartButton();
  }

  // ── Set Player Count ───────────────────────────────────────────────────
  function setPlayerCount(count) {
    SocketBridge.emit('setPlayerCount', { code: state.roomCode, count }, (res) => {
      if (res.error) return console.warn('setPlayerCount error:', res.error);
      state.playerCount = count;
      // Highlight active button
      document.querySelectorAll('.count-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.count) === count);
      });
    });
  }

  // ── Start Game ─────────────────────────────────────────────────────────
  function startGame() {
    SocketBridge.emit('startGame', { code: state.roomCode }, (res) => {
      if (res.error) return alert('Could not start: ' + res.error);
    });
  }

  // ── Start Next Round ───────────────────────────────────────────────────
  function startNextRound() {
    SocketBridge.emit('startNewRound', { code: state.roomCode }, (res) => {
      if (res.error) return alert('Could not start round: ' + res.error);
    });
  }

  // ── Play Card ──────────────────────────────────────────────────────────
  function playCard(cardId) {
    if (state.currentTurn !== state.myId) return;
    SocketBridge.emit('playCard', { code: state.roomCode, cardId }, (res) => {
      if (res.error) {
        // Flash the error briefly in the turn indicator
        const ind = document.getElementById('my-turn-indicator');
        const prev = ind.textContent;
        ind.textContent = '⚠ ' + res.error;
        ind.style.color = 'var(--red)';
        setTimeout(() => {
          ind.textContent = prev;
          ind.style.color = '';
        }, 1800);
      }
    });
  }

  // ── Copy room code ─────────────────────────────────────────────────────
  function copyCode() {
    if (!state.roomCode) return;
    navigator.clipboard.writeText(state.roomCode).then(() => {
      const btn = document.getElementById('btn-copy-code');
      if (btn) {
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = '⧉'; }, 1500);
      }
    }).catch(() => {});
  }

  // ── Back to Lobby ──────────────────────────────────────────────────────
  function backToLobby() {
    // Reset state
    Object.assign(state, {
      myId: null, myName: null, roomCode: null, isHost: false,
      players: [], playerCount: 4, myHand: [], myTeam: 0, mySeat: 0,
      currentTurn: null, trump: null, ledSuit: null,
      tricksWon: { 0: 0, 1: 0 }, tensWon: { 0: 0, 1: 0 },
      matchScores: { 0: 0, 1: 0 }, round: 1, trickCards: [],
    });
    showScreen('screen-lobby');
  }

  // ── Internal: update start button visibility ───────────────────────────
  function _updateStartButton() {
    const btn = document.getElementById('btn-start');
    const status = document.getElementById('waiting-status');
    if (!btn || !state.isHost) return;

    const filled = state.players.length;
    const needed = state.playerCount;
    const ready  = filled === needed;

    btn.classList.toggle('hidden', !ready);
    if (status) {
      status.textContent = ready
        ? 'All players joined! Press Start to begin.'
        : `Waiting for players… (${filled}/${needed})`;
    }
  }

  // ── Event handlers called by socket.js ────────────────────────────────

  function onLobbyUpdate({ players, playerCount, host }) {
    state.players     = players;
    state.playerCount = playerCount;
    state.isHost      = host === state.myId;

    UI.renderPlayerSlots(players, playerCount);
    _updateStartButton();

    // Update host controls visibility dynamically
    const hostCtrls = document.getElementById('host-controls');
    if (hostCtrls) hostCtrls.classList.toggle('hidden', !state.isHost);

    // Sync count-btn highlight
    document.querySelectorAll('.count-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.count) === playerCount);
    });
  }

  function onGameStart(data) {
    // Store everything
    state.myHand      = data.hand;
    state.players     = data.players;
    state.teamNames   = data.teamNames;
    state.currentTurn = data.currentTurn;
    state.trump       = data.trump;
    state.myTeam      = data.teamIndex;
    state.mySeat      = data.seatIndex;
    state.totalTricks = data.totalTricks;
    state.matchScores = data.matchScores;
    state.winTarget   = data.winTarget;
    state.tricksWon   = { 0: 0, 1: 0 };
    state.tensWon     = { 0: 0, 1: 0 };
    state.ledSuit     = null;
    state.trickCards  = [];

    showScreen('screen-game');
    _renderGameScreen();
  }

  function onCardPlayed({ playerId, cardId, card, currentTurn, trickSoFar }) {
    state.currentTurn = currentTurn;
    state.ledSuit     = trickSoFar.length > 0 ? trickSoFar[0].card.suit : null;

    // Track trick cards for rendering
    const player = state.players.find(p => p.id === playerId);
    state.trickCards = trickSoFar.map(t => ({
      playerId: t.playerId,
      card: t.card,
      playerName: state.players.find(p => p.id === t.playerId)?.name || '?',
    }));

    UI.renderTrickArea(state.trickCards);
    _updateTurnUI();
  }

  function onHandUpdate({ hand }) {
    state.myHand = hand;
    const isMyTurn = state.currentTurn === state.myId;
    UI.renderMyHand(state.myHand, isMyTurn, state.trump, state.ledSuit, playCard);
  }

  function onTrickEnd({ winnerId, trick, trump, tricksWon, tensWon }) {
    if (trump && !state.trump) {
      state.trump = trump;
      UI.showTrump(trump);
    }
    state.tricksWon   = tricksWon;
    state.tensWon     = tensWon;
    state.currentTurn = winnerId;
    state.ledSuit     = null;
    state.trickCards  = [];

    // Animate sweep then clear
    UI.sweepTrick(winnerId, () => {
      state.trickCards = [];
      UI.renderTrickArea([]);
      _updateTurnUI();
      _updateHudTricks();
    });

    UI.updateOpponentTricks(state.players, state.tricksWon);
  }

  function onRoundEnd(data) {
    state.matchScores = data.matchScores;
    showScreen('screen-result');
    UI.renderResultScreen(data, state.teamNames, state.isHost);
  }

  function onMatchOver({ winner, matchScores, teamNames }) {
    // Already on result screen — show match winner banner
    UI.showMatchWinner(winner, teamNames || state.teamNames);
    document.getElementById('btn-next-round')?.classList.add('hidden');
  }

  function onPlayerLeft({ players, host }) {
    state.players = players;
    state.isHost  = host === state.myId;
    UI.renderPlayerSlots(players, state.playerCount);
  }

  // ── Private: render the full game screen layout ────────────────────────
  function _renderGameScreen() {
    // HUD
    document.getElementById('hud-round').textContent = state.round;
    document.getElementById('hud-trump-suit').textContent = '—';
    document.getElementById('hud-trump-suit').className = 'hud-trump-suit';
    _updateHudScores();
    _updateHudTricks();

    // My info bar
    document.getElementById('my-name-tag').textContent = state.myName || '';

    // Opponents around the table
    const myIndex = state.players.findIndex(p => p.id === state.myId);
    UI.renderOpponents(state.players, myIndex, state.tricksWon, state.currentTurn);

    // My hand
    const isMyTurn = state.currentTurn === state.myId;
    UI.renderMyHand(state.myHand, isMyTurn, state.trump, state.ledSuit, playCard);

    // Turn indicator
    _updateTurnUI();
  }

  function _updateTurnUI() {
    const isMyTurn = state.currentTurn === state.myId;
    const ind = document.getElementById('my-turn-indicator');
    if (ind) {
      ind.textContent = isMyTurn ? '✦ Your Turn — Play a Card' : '';
      ind.style.color = '';
    }

    const announce = document.getElementById('turn-announcement');
    if (announce) {
      if (isMyTurn) {
        announce.textContent = 'Your turn';
      } else {
        const p = state.players.find(x => x.id === state.currentTurn);
        announce.textContent = p ? `${p.name}'s turn` : '';
      }
    }

    // Re-render hand with updated playability
    const isMyTurnNow = state.currentTurn === state.myId;
    UI.renderMyHand(state.myHand, isMyTurnNow, state.trump, state.ledSuit, playCard);

    // Update opponent highlights
    UI.updateOpponentTurnHighlight(state.currentTurn);
  }

  function _updateHudScores() {
    const chip0 = document.getElementById('hud-score-0');
    const chip1 = document.getElementById('hud-score-1');
    const n0 = state.teamNames[0];
    const n1 = state.teamNames[1];
    if (chip0) chip0.textContent = `${n0.split(' ')[0]}: ${state.matchScores[0]}`;
    if (chip1) chip1.textContent = `${n1.split(' ')[0]}: ${state.matchScores[1]}`;
  }

  function _updateHudTricks() {
    const el = document.getElementById('hud-tricks-display');
    if (el) el.textContent = `${state.tricksWon[0]}–${state.tricksWon[1]}`;

    // Update my tricks count
    const myTricks = document.getElementById('my-tricks-count');
    const myTens   = document.getElementById('my-tens-count');
    if (myTricks) myTricks.textContent = `Tricks: ${state.tricksWon[state.myTeam]}`;
    if (myTens)   myTens.textContent   = state.tensWon[state.myTeam] > 0
      ? `10s: ${state.tensWon[state.myTeam]}` : '';
  }

  // ── Public API ─────────────────────────────────────────────────────────
  return {
    state,
    showScreen,
    switchTab,
    createRoom,
    joinRoom,
    setPlayerCount,
    startGame,
    startNextRound,
    playCard,
    copyCode,
    backToLobby,
    // Handlers for socket.js
    onLobbyUpdate,
    onGameStart,
    onCardPlayed,
    onHandUpdate,
    onTrickEnd,
    onRoundEnd,
    onMatchOver,
    onPlayerLeft,
  };
})();
