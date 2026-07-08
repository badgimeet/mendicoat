'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   socket.js — Socket.io client bridge
   Exposes SocketBridge; wires all server events to App handlers
═══════════════════════════════════════════════════════════════════════ */

const SocketBridge = (() => {
  const socket = io(); // auto-connects to origin

  // ── Helpers ────────────────────────────────────────────────────────────
  function emit(event, data, cb) {
    socket.emit(event, data, cb || (() => {}));
  }

  function id() {
    return socket.id;
  }

  // ── Incoming Events ────────────────────────────────────────────────────

  /** Lobby player list changed */
  socket.on('lobbyUpdate', (data) => {
    App.onLobbyUpdate(data);
  });

  /** Game has started — receive private hand */
  socket.on('gameStart', (data) => {
    App.onGameStart(data);
  });

  /** A card was played (trick still in progress) */
  socket.on('cardPlayed', (data) => {
    App.onCardPlayed(data);
  });

  /** My hand changed (after I played / trick ended) */
  socket.on('handUpdate', (data) => {
    App.onHandUpdate(data);
  });

  /** Trick completed — winner determined */
  socket.on('trickEnd', (data) => {
    App.onTrickEnd(data);
  });

  /** Round over — scores calculated */
  socket.on('roundEnd', (data) => {
    App.onRoundEnd(data);
  });

  /** Match complete — someone hit win target */
  socket.on('matchOver', (data) => {
    App.onMatchOver(data);
  });

  /** A player disconnected */
  socket.on('playerLeft', (data) => {
    App.onPlayerLeft(data);
  });

  /** Connection lifecycle */
  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.warn('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  // ── Public API ─────────────────────────────────────────────────────────
  return { emit, id };
})();
