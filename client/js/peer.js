// client/js/peer.js
// PeerJS transport layer — replaces socket.js
// Exposes PeerBridge with the same public emit() / id() API as SocketBridge,
// so app.js needs minimal changes.
//
// Architecture:
//   HOST  — creates a Peer with ID "mendi-<ROOMCODE>", accepts guest connections,
//            runs all game logic locally via window._RoomMgr, then broadcasts results.
//   GUEST — creates an anonymous Peer, connects to "mendi-<ROOMCODE>", sends
//            action messages to host, receives event broadcasts.
//
// Message envelope:  { type: string, data: object, cbId: string|null }
// Callback response: { type: '__cb', cbId: string, data: object }
/* global Peer, App */

const PeerBridge = (() => {
  let _peer       = null;   // My PeerJS Peer instance
  let _myId       = null;   // My peer ID
  let _isHost     = false;
  let _hostConn   = null;   // Guest only: DataConnection to host
  let _guestConns = [];     // Host only: DataConnections from guests
  let _pendingCbs = {};     // cbId → callback fn  (guest side)
  let _cbCounter  = 0;

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Return my PeerJS peer ID (mirrors SocketBridge.id()) */
  function id() { return _myId; }

  /** Destroy the peer and all connections (called on backToLobby) */
  function destroy() {
    try { if (_peer) _peer.destroy(); } catch (_) {}
    _peer       = null;
    _hostConn   = null;
    _guestConns = [];
    _myId       = null;
    _pendingCbs = {};
  }

  /**
   * Send an event (mirrors SocketBridge.emit(event, data, cb)).
   * Host handles its own events locally.
   * Guests send to host over WebRTC.
   */
  function emit(event, data, cb) {
    const cbId = cb ? String(++_cbCounter) : null;
    if (cb && cbId) _pendingCbs[cbId] = cb;
    const msg = { type: event, data: data || {}, cbId };

    if (_isHost) {
      _handleHostEvent(event, data || {}, (res) => {
        if (cb) { delete _pendingCbs[cbId]; cb(res); }
      });
    } else {
      if (_hostConn && _hostConn.open) {
        _hostConn.send(msg);
      } else {
        console.warn('[PeerBridge] Not connected to host');
        if (cb) { delete _pendingCbs[cbId]; cb({ error: 'Not connected to host' }); }
      }
    }
  }

  /**
   * Initialize as host or guest and open the PeerJS connection.
   *
   * @param {boolean} isHost
   * @param {string}  roomCode  — Host uses "mendi-<code>" as peer ID; guest connects to it
   * @param {string}  myName
   * @param {{ onReady(peerId:string), onError(msg:string) }} callbacks
   */
  function init(isHost, roomCode, myName, { onReady, onError }) {
    _isHost = isHost;
    // Host uses deterministic peer ID so guests can find it by room code
    const peerId = isHost ? `mendi-${roomCode}` : undefined;

    _peer = new Peer(peerId, {
      host:   '0.peerjs.com',
      port:   443,
      path:   '/',
      secure: true,
    });

    _peer.on('open', (assignedId) => {
      _myId = assignedId;
      console.log('[PeerBridge] open, id:', assignedId);
      if (isHost) _setupHostListeners();
      onReady(assignedId);
    });

    _peer.on('error', (err) => {
      console.error('[PeerBridge] error:', err.type, err.message);
      onError(err.message || err.type || 'PeerJS error');
    });
  }

  /**
   * Guest: connect to the host peer after our own peer is open.
   * Fires App.onJoinAck(res) when the host responds to the join request.
   *
   * @param {string} roomCode
   * @param {string} myName
   */
  function connectToHost(roomCode, myName) {
    const hostPeerId = `mendi-${roomCode}`;
    const conn = _peer.connect(hostPeerId, { reliable: true, serialization: 'json' });
    _hostConn = conn;

    conn.on('open', () => {
      console.log('[PeerBridge] connected to host');
      // Send join request — cbId stored so we get the ack
      const cbId = String(++_cbCounter);
      _pendingCbs[cbId] = (res) => {
        // Fire the special join-ack handler in app.js
        if (typeof App !== 'undefined') App.onJoinAck(res);
      };
      conn.send({ type: 'joinRoom', data: { name: myName }, cbId });
    });

    conn.on('data', _handleGuestMessage);

    conn.on('close', () => {
      console.warn('[PeerBridge] host connection closed');
      if (typeof App !== 'undefined') App.onPlayerLeft({ players: [], host: null });
    });

    conn.on('error', (err) => {
      console.error('[PeerBridge] conn error:', err);
    });
  }

  // ── Host: set up incoming guest connection listener ─────────────────────────

  function _setupHostListeners() {
    _peer.on('connection', (conn) => {
      console.log('[PeerBridge] guest connected:', conn.peer);
      conn.on('open', () => { _guestConns.push(conn); });

      conn.on('data', (msg) => _handleHostMessage(conn, msg));

      conn.on('close', () => {
        _guestConns = _guestConns.filter(c => c !== conn);
        console.log('[PeerBridge] guest disconnected:', conn.peer);
        const RoomMgr = window._RoomMgr;
        if (RoomMgr) {
          const result = RoomMgr.handleDisconnect(conn.peer);
          if (result && result.room) {
            const ld = { players: result.room.players, host: result.room.host };
            _broadcast('playerLeft', ld);
            if (typeof App !== 'undefined') App.onPlayerLeft(ld);
          }
        }
      });

      conn.on('error', (err) => console.error('[PeerBridge] guest conn error:', err));
    });
  }

  // ── Host: route an incoming message from a guest ────────────────────────────

  function _handleHostMessage(conn, msg) {
    const { type, data, cbId } = msg;
    // Attach the sender's peer ID so the handler knows who acted
    const enriched = { ...(data || {}), _fromPeer: conn.peer };
    _handleHostEvent(type, enriched, (res) => {
      if (cbId) conn.send({ type: '__cb', cbId, data: res });
    });
  }

  // ── Host: execute a game action (own or from guest) ─────────────────────────

  function _handleHostEvent(type, data, cb) {
    const RoomMgr = window._RoomMgr;
    // Who performed this action?  Own actions have no _fromPeer.
    const actorId = data._fromPeer || _myId;

    switch (type) {

      case 'createRoom': {
        const r = RoomMgr.createRoom(_myId, data.name);
        cb({ code: r.code, room: _publicRoom(r) });
        break;
      }

      case 'joinRoom': {
        const result = RoomMgr.joinRoom(actorId, data.name);
        if (result.error) { cb({ error: result.error }); break; }
        // Ack the joining guest with the full room
        cb({ room: _publicRoom(result.room) });
        // Broadcast updated lobby to all existing guests + update host UI
        const lu = _lobbyData(result.room);
        _broadcast('lobbyUpdate', lu);
        if (typeof App !== 'undefined') App.onLobbyUpdate(lu);
        break;
      }

      case 'setPlayerCount': {
        const result = RoomMgr.setPlayerCount(_myId, data.count);
        if (result.error) { cb({ error: result.error }); break; }
        const lu = _lobbyData(result.room);
        _broadcast('lobbyUpdate', lu);
        if (typeof App !== 'undefined') App.onLobbyUpdate(lu);
        cb({ ok: true });
        break;
      }

      case 'startGame': {
        const result = RoomMgr.startGame(_myId);
        if (result.error) { cb({ error: result.error }); break; }
        _distributeGameStart(result.room);
        cb({ ok: true });
        break;
      }

      case 'startNewRound': {
        const result = RoomMgr.startNewRound(_myId);
        if (result.error) { cb({ error: result.error }); break; }
        _distributeGameStart(result.room);
        cb({ ok: true });
        break;
      }

      case 'playCard': {
        const result = RoomMgr.playCard(actorId, data.cardId);
        if (result.error) { cb({ error: result.error }); break; }
        cb({ ok: true });
        _broadcastPlayResult(result);
        break;
      }

      default:
        cb({ error: `Unknown event: ${type}` });
    }
  }

  // ── Guest: handle a message from host ──────────────────────────────────────

  function _handleGuestMessage(msg) {
    // Callback acknowledgement
    if (msg.type === '__cb') {
      const cb = _pendingCbs[msg.cbId];
      if (cb) { cb(msg.data); delete _pendingCbs[msg.cbId]; }
      return;
    }
    // Server-push event → dispatch to App
    _dispatchToApp(msg.type, msg.data);
  }

  // ── Dispatch a server-push event to App handlers ────────────────────────────

  function _dispatchToApp(type, data) {
    if (typeof App === 'undefined') return;
    switch (type) {
      case 'lobbyUpdate': App.onLobbyUpdate(data); break;
      case 'gameStart':   App.onGameStart(data);   break;
      case 'cardPlayed':  App.onCardPlayed(data);  break;
      case 'handUpdate':  App.onHandUpdate(data);  break;
      case 'trickEnd':    App.onTrickEnd(data);    break;
      case 'roundEnd':    App.onRoundEnd(data);    break;
      case 'matchOver':   App.onMatchOver(data);   break;
      case 'playerLeft':  App.onPlayerLeft(data);  break;
      default: console.warn('[PeerBridge] unknown push event:', type);
    }
  }

  // ── Broadcast a message to all connected guests ─────────────────────────────

  function _broadcast(type, data) {
    const msg = { type, data };
    _guestConns.forEach(c => { try { if (c.open) c.send(msg); } catch (_) {} });
  }

  /** Send a message to one specific guest by peer ID */
  function _sendTo(peerId, type, data) {
    const conn = _guestConns.find(c => c.peer === peerId && c.open);
    if (conn) try { conn.send({ type, data }); } catch (_) {}
  }

  // ── Send each player their own private gameStart payload ────────────────────

  function _distributeGameStart(room) {
    const teamNames = _buildTeamNames(room.players);
    room.players.forEach(p => {
      const payload = {
        hand:        room.game.hands[p.id],
        players:     room.players,
        teamNames,
        currentTurn: room.game.currentTurn,
        trump:       null,
        myId:        p.id,
        seatIndex:   p.seatIndex,
        teamIndex:   p.teamIndex,
        totalTricks: room.game.totalTricks,
        matchScores: room.matchScores,
        winTarget:   room.winTarget,
      };
      if (p.id === _myId) {
        if (typeof App !== 'undefined') App.onGameStart(payload);
      } else {
        _sendTo(p.id, 'gameStart', payload);
      }
    });
  }

  // ── Fan out the result of a playCard action to all peers ────────────────────

  function _broadcastPlayResult(result) {
    const room = result.room;

    if (result.event === 'cardPlayed') {
      const ev = result.data;
      _broadcast('cardPlayed', ev);
      if (typeof App !== 'undefined') App.onCardPlayed(ev);
      // Hand update only to the player who played
      const hand = room.game.hands[ev.playerId];
      if (ev.playerId === _myId) {
        if (typeof App !== 'undefined') App.onHandUpdate({ hand });
      } else {
        _sendTo(ev.playerId, 'handUpdate', { hand });
      }

    } else if (result.event === 'trickEnd') {
      const ev = result.data;
      _broadcast('trickEnd', ev);
      if (typeof App !== 'undefined') App.onTrickEnd(ev);
      // Send every player their updated hand
      room.players.forEach(p => {
        const hand = room.game.hands[p.id];
        if (p.id === _myId) {
          if (typeof App !== 'undefined') App.onHandUpdate({ hand });
        } else {
          _sendTo(p.id, 'handUpdate', { hand });
        }
      });

    } else if (result.event === 'roundEnd') {
      const teamNames = _buildTeamNames(room.players);
      const ev = { ...result.data, teamNames };
      _broadcast('roundEnd', ev);
      if (typeof App !== 'undefined') App.onRoundEnd(ev);
      if (result.data.matchWinner !== null) {
        const mv = {
          winner:      result.data.matchWinner,
          matchScores: result.data.matchScores,
          teamNames,
        };
        _broadcast('matchOver', mv);
        if (typeof App !== 'undefined') App.onMatchOver(mv);
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Strip private hand data — safe to broadcast to all */
  function _publicRoom(room) {
    return {
      code:        room.code,
      host:        room.host,
      playerCount: room.playerCount,
      players:     room.players,
      state:       room.state,
      matchScores: room.matchScores,
      winTarget:   room.winTarget,
    };
  }

  function _lobbyData(room) {
    return { players: room.players, playerCount: room.playerCount, host: room.host };
  }

  function _buildTeamNames(players) {
    const names = { 0: [], 1: [] };
    players.forEach(p => names[p.teamIndex].push(p.name));
    return {
      0: names[0].join(' & ') || 'Team A',
      1: names[1].join(' & ') || 'Team B',
    };
  }

  // ── Public surface ──────────────────────────────────────────────────────────
  return { init, emit, id, destroy, connectToHost };
})();
