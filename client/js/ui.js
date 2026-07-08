'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   ui.js — All DOM rendering: cards, table, opponents, scores
═══════════════════════════════════════════════════════════════════════ */

const UI = (() => {

  // ── Suit helpers ───────────────────────────────────────────────────────
  const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const SUIT_NAMES   = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
  const RED_SUITS    = new Set(['H', 'D']);

  function suitSymbol(suit) { return SUIT_SYMBOLS[suit] || suit; }
  function isRed(suit)      { return RED_SUITS.has(suit); }
  function isMendi(rank)    { return rank === '10'; }

  // ── Build a card DOM element ───────────────────────────────────────────
  /**
   * @param {Object}   card          - { id, rank, suit, value }
   * @param {boolean}  playable      - If true, adds hover/click styling
   * @param {Function} onPlay        - Callback(cardId) when clicked
   * @param {boolean}  small         - Render as smaller trick-area card
   */
  function buildCard(card, playable = false, onPlay = null, small = false) {
    const el = document.createElement('div');
    el.className = [
      'card',
      isRed(card.suit) ? 'red' : 'black',
      isMendi(card.rank) ? 'mendi' : '',
      playable ? 'playable' : '',
      small ? 'trick-card' : '',
    ].filter(Boolean).join(' ');

    el.setAttribute('aria-label', `${card.rank} of ${SUIT_NAMES[card.suit]}`);
    el.dataset.cardId = card.id;

    const symbol = suitSymbol(card.suit);

    el.innerHTML = `
      <div class="card-corner">
        <span class="card-rank">${card.rank}</span>
        <span class="card-suit">${symbol}</span>
      </div>
      <div class="card-center">${symbol}</div>
      <div class="card-corner bottom-right">
        <span class="card-rank">${card.rank}</span>
        <span class="card-suit">${symbol}</span>
      </div>
    `;

    if (playable && onPlay) {
      el.addEventListener('click', () => onPlay(card.id));
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay(card.id); }
      });
    }

    return el;
  }

  // ── My Hand (fan at bottom) ────────────────────────────────────────────
  /**
   * Render the player's own hand.
   * Cards are overlapping fan; playable ones lift on hover.
   */
  function renderMyHand(hand, isMyTurn, trump, ledSuit, onPlay) {
    const container = document.getElementById('my-hand');
    if (!container) return;
    container.innerHTML = '';

    // Sort hand: by suit, then by value within suit
    const sorted = [...hand].sort((a, b) => {
      const suitOrder = ['S', 'H', 'D', 'C'];
      const sd = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
      return sd !== 0 ? sd : a.value - b.value;
    });

    // Determine which cards are legally playable
    const hasLedSuit = ledSuit ? sorted.some(c => c.suit === ledSuit) : false;

    // ── Dynamic overlap so cards never crowd off-screen ────────────────────
    // Detect rendered card width from CSS (fallback 60px desktop / 48px mobile)
    const cardW   = window.innerWidth <= 480 ? 48 : (window.innerWidth <= 360 ? 42 : 60);
    const n       = sorted.length;
    // Available width for the fan (leave 32px padding each side)
    const avail   = Math.min(container.offsetWidth || window.innerWidth, window.innerWidth) - 64;
    // Desired visible portion of each card (min 22px so rank is readable)
    const minVis  = 22;
    // Maximum overlap = cardW - minVis (leaving minVis visible)
    // Optimal: spread n cards so total width = avail
    // totalWidth = cardW + (n-1) * (cardW + overlap)  →  overlap = (avail - cardW) / (n-1) - cardW
    let overlap = 0;
    if (n > 1) {
      const ideal = (avail - cardW) / (n - 1) - cardW;
      // ideal is negative (it's the margin-right). Clamp so visible portion ≥ minVis
      overlap = Math.max(ideal, -(cardW - minVis));
      overlap = Math.min(overlap, -4); // never positive (always fan)
    }
    container.style.setProperty('--card-overlap', `${Math.round(overlap)}px`);

    sorted.forEach((card) => {
      const isLegal = isMyTurn && (
        !ledSuit ||
        !hasLedSuit ||
        card.suit === ledSuit
      );
      const el = buildCard(card, isLegal, isLegal ? onPlay : null, false);
      container.appendChild(el);
    });
  }


  // ── Trick Area (center table) ──────────────────────────────────────────
  function renderTrickArea(trickCards) {
    const area = document.getElementById('trick-area');
    if (!area) return;
    area.innerHTML = '';

    trickCards.forEach(({ card, playerName }) => {
      const wrap = document.createElement('div');
      wrap.className = 'trick-card-wrap';

      const cardEl = buildCard(card, false, null, true);
      const label  = document.createElement('div');
      label.className = 'trick-card-player';
      label.textContent = playerName;

      wrap.appendChild(cardEl);
      wrap.appendChild(label);
      area.appendChild(wrap);
    });
  }

  // ── Sweep trick off the table ──────────────────────────────────────────
  function sweepTrick(winnerId, callback) {
    const area = document.getElementById('trick-area');
    if (!area) { callback?.(); return; }

    area.classList.add('sweeping');
    setTimeout(() => {
      area.classList.remove('sweeping');
      callback?.();
    }, 520);
  }

  // ── Build the tricks + tens row for a player ───────────────────────────
  /**
   * Returns a .player-tricks-row element showing:
   *   - a card-back stack with count for regular tricks
   *   - individual face-up mini 10-cards for each mendi won
   *
   * @param {number} tricks    - total tricks won by this player's team
   * @param {Array}  mendiList - array of { rank:'10', suit:'S'|'H'|'D'|'C' }
   *                             for each 10 the team has captured
   */
  function _buildTricksRow(tricks, mendiList) {
    const row = document.createElement('div');
    row.className = 'player-tricks-row';

    // Trick stack (non-mendi tricks)
    const nonMendiTricks = tricks - (mendiList ? mendiList.length : 0);
    if (tricks > 0) {
      const stack = document.createElement('div');
      stack.className = 'trick-stack';
      const icon = document.createElement('span');
      icon.className = 'trick-stack-icon';
      const count = document.createElement('span');
      count.className = 'trick-stack-count';
      count.textContent = tricks;
      stack.appendChild(icon);
      stack.appendChild(count);
      row.appendChild(stack);
    }

    // Face-up mini 10 cards
    if (mendiList && mendiList.length > 0) {
      mendiList.forEach(mendi => {
        const mini = document.createElement('div');
        mini.className = 'mendi-mini';
        mini.setAttribute('aria-label', `10 of ${SUIT_NAMES[mendi.suit] || mendi.suit}`);
        const redClass = isRed(mendi.suit) ? ' red' : '';
        mini.innerHTML = `
          <span class="mendi-mini-rank${redClass}">10</span>
          <span class="mendi-mini-suit${redClass}">${suitSymbol(mendi.suit)}</span>
        `;
        row.appendChild(mini);
      });
    }

    return row;
  }

  // ── Opponents (positioned around table) ───────────────────────────────
  /**
   * Place opponent players around the table using absolute positioning.
   * With 4 players: top-center, left, right.
   * With 6 players: top-left, top-right, left, right, bottom-left (excluded = me).
   * Strategy: evenly distribute opponents around a circle.
   */
  function renderOpponents(players, myIndex, tricksWon, tensWon, currentTurn) {
    const area = document.getElementById('opponents-area');
    if (!area) return;
    area.innerHTML = '';

    const opponents = players.filter((_, i) => i !== myIndex);
    const total = opponents.length;
    if (total === 0) return;

    const positions = _getOpponentPositions(total);

    opponents.forEach((player, idx) => {
      const pos = positions[idx];
      const teamTricks = tricksWon?.[player.teamIndex] ?? 0;
      const teamMendis = tensWon?.[player.teamIndex] ?? [];
      const el  = _buildOpponentEl(player, teamTricks, teamMendis, currentTurn);
      el.style.left = pos.x;
      el.style.top  = pos.y;
      el.style.transform = 'translate(-50%, -50%)';
      area.appendChild(el);
    });
  }

  function _getOpponentPositions(count) {
    const positions = [];
    const startAngle = -130;
    const endAngle   = 130;
    const step = count === 1 ? 0 : (endAngle - startAngle) / (count - 1);

    for (let i = 0; i < count; i++) {
      const angleDeg = count === 1 ? 0 : startAngle + step * i;
      const angleRad = (angleDeg * Math.PI) / 180;
      const cx = 50, cy = 42, rx = 36, ry = 32;
      const x = cx + rx * Math.sin(angleRad);
      const y = cy - ry * Math.cos(angleRad);
      positions.push({ x: `${x}%`, y: `${y}%` });
    }
    return positions;
  }

  function _buildOpponentEl(player, teamTricks, teamMendis, currentTurn) {
    const isActive = player.id === currentTurn;

    const el = document.createElement('div');
    el.className = 'opponent-player';
    el.dataset.playerId = player.id;

    // Card backs (show 3 representative card backs)
    const backs = document.createElement('div');
    backs.className = 'opponent-cards';
    for (let i = 0; i < 3; i++) {
      const back = document.createElement('div');
      back.className = 'card-back';
      backs.appendChild(back);
    }

    const nameTag = document.createElement('div');
    nameTag.className = `opponent-name-tag${isActive ? ' active-turn' : ''}`;
    nameTag.dataset.playerId = player.id;
    nameTag.textContent = player.name;

    // Tricks + tens row under name
    const tricksRow = _buildTricksRow(teamTricks, teamMendis);
    tricksRow.dataset.playerId = `tricks-${player.id}`;

    el.appendChild(backs);
    el.appendChild(nameTag);
    el.appendChild(tricksRow);

    return el;
  }

  function updateOpponentTurnHighlight(currentTurn) {
    document.querySelectorAll('.opponent-name-tag').forEach(el => {
      el.classList.toggle('active-turn', el.dataset.playerId === currentTurn);
    });
  }

  function updateOpponentTricks(players, tricksWon, tensWon) {
    players.forEach(p => {
      const container = document.querySelector(`[data-player-id="tricks-${p.id}"]`);
      if (!container) return;
      const teamTricks = tricksWon?.[p.teamIndex] ?? 0;
      const teamMendis = tensWon?.[p.teamIndex] ?? [];
      const newRow = _buildTricksRow(teamTricks, teamMendis);
      newRow.dataset.playerId = `tricks-${p.id}`;
      container.replaceWith(newRow);
    });
  }

  // ── My tricks row (under my name in my-area) ──────────────────────────
  function updateMyTricksRow(myTeam, tricksWon, tensWon) {
    const container = document.getElementById('my-tricks-row');
    if (!container) return;
    container.innerHTML = '';

    const teamTricks = tricksWon?.[myTeam] ?? 0;
    const teamMendis = tensWon?.[myTeam] ?? [];
    const row = _buildTricksRow(teamTricks, teamMendis);
    // Append children (not the wrapper) so the my-info-bar layout stays flat
    Array.from(row.children).forEach(child => container.appendChild(child));
  }

  // ── Trump reveal ───────────────────────────────────────────────────────
  function showTrump(suit) {
    const el = document.getElementById('hud-trump-suit');
    if (!el) return;
    el.textContent = suitSymbol(suit);
    el.style.color = isRed(suit) ? 'var(--red)' : 'var(--white)';
    el.classList.add('revealed');
    setTimeout(() => el.classList.remove('revealed'), 700);
  }

  // ── Waiting room player slots ──────────────────────────────────────────
  function renderPlayerSlots(players, playerCount) {
    const container = document.getElementById('player-slots');
    if (!container) return;
    container.innerHTML = '';

    // Filled slots
    players.forEach((p, i) => {
      const slot = document.createElement('div');
      slot.className = 'player-slot';

      const isHost = i === 0;
      const initial = p.name.charAt(0).toUpperCase();
      const teamLabel = p.teamIndex === 0 ? 'Team A' : 'Team B';

      slot.innerHTML = `
        <div class="slot-avatar">${initial}</div>
        <div class="slot-info">
          <div class="slot-name">${_esc(p.name)}</div>
          ${isHost ? '<div class="slot-host-badge">⭐ Host</div>' : ''}
        </div>
        <span class="team-badge t${p.teamIndex}">${teamLabel}</span>
      `;
      container.appendChild(slot);
    });

    // Empty slots
    const remaining = playerCount - players.length;
    for (let i = 0; i < remaining; i++) {
      const empty = document.createElement('div');
      empty.className = 'empty-slot';
      empty.innerHTML = `<div class="slot-avatar" style="opacity:0.3">?</div><span>Waiting for player…</span>`;
      container.appendChild(empty);
    }
  }

  // ── Result screen ──────────────────────────────────────────────────────
  function renderResultScreen(data, teamNames, isHost) {
    const { scores, mendikot, tricksWon, tensWon, matchScores } = data;

    // Mendikot badge
    const badge = document.getElementById('mendikot-badge');
    if (badge) badge.classList.toggle('hidden', !mendikot);

    // Heading
    const heading = document.getElementById('result-heading');
    if (heading) {
      if (mendikot) heading.textContent = 'Mendikot!';
      else if (scores[0] > 0) heading.textContent = `${teamNames[0]} wins the round!`;
      else if (scores[1] > 0) heading.textContent = `${teamNames[1]} wins the round!`;
      else heading.textContent = 'Round Draw!';
    }

    // Team cards
    [0, 1].forEach(t => {
      const nameEl   = document.getElementById(`result-team${t}-name`);
      const scoreEl  = document.getElementById(`result-team${t}-score`);
      const detailEl = document.getElementById(`result-team${t}-tricks`);

      if (nameEl)   nameEl.textContent = teamNames[t];
      if (scoreEl)  scoreEl.textContent = `+${scores[t]}`;
      if (detailEl) detailEl.textContent =
        `${tricksWon?.[t] ?? 0} tricks · ${tensWon?.[t] ?? 0} tens`;
    });

    // Match total
    const m0 = document.getElementById('match-total-0');
    const m1 = document.getElementById('match-total-1');
    if (m0) m0.textContent = `${teamNames[0].split(' ')[0]}: ${matchScores[0]}`;
    if (m1) m1.textContent = `${teamNames[1].split(' ')[0]}: ${matchScores[1]}`;

    // Next round button (host only, if no match winner yet)
    const nextRoundBtn = document.getElementById('btn-next-round');
    if (nextRoundBtn) {
      nextRoundBtn.classList.toggle('hidden', !isHost || data.matchWinner !== null);
    }

    // Clear match winner banner (may be set by onMatchOver)
    const banner = document.getElementById('match-winner-banner');
    if (banner) banner.classList.add('hidden');
  }

  function showMatchWinner(winnerTeam, teamNames) {
    const banner = document.getElementById('match-winner-banner');
    if (banner) {
      banner.textContent = `🏆 ${teamNames[winnerTeam]} wins the match!`;
      banner.classList.remove('hidden');
    }
    const nextRoundBtn = document.getElementById('btn-next-round');
    if (nextRoundBtn) nextRoundBtn.classList.add('hidden');
  }

  // ── Utility ────────────────────────────────────────────────────────────
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Public API ─────────────────────────────────────────────────────────
  return {
    renderMyHand,
    renderTrickArea,
    sweepTrick,
    renderOpponents,
    updateOpponentTurnHighlight,
    updateOpponentTricks,
    updateMyTricksRow,
    showTrump,
    renderPlayerSlots,
    renderResultScreen,
    showMatchWinner,
  };
})();
