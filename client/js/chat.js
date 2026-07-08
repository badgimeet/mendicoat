'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   chat.js — In-game chat panel: emoji shortcuts + text input
   Depends on: app.js (App.sendChat), app.js (App.state.myId)
═══════════════════════════════════════════════════════════════════════ */

const ChatUI = (() => {

  const EMOJIS = ['👍', '😂', '🔥', '😱', '🤝', '😤', '💯', '🃏', '🏆', '😎', '🤔', '😅'];

  let _isOpen    = false;
  let _unread    = 0;
  let _panel     = null;
  let _fab       = null;
  let _messages  = null;
  let _input     = null;
  let _sendBtn   = null;

  // ── Init (called once DOM is ready) ────────────────────────────────────
  function _init() {
    _panel    = document.getElementById('chat-panel');
    _fab      = document.getElementById('chat-fab');
    _messages = document.getElementById('chat-messages');
    _input    = document.getElementById('chat-input');
    _sendBtn  = document.getElementById('chat-send');

    if (!_panel) return; // not on game screen yet

    // Build emoji buttons
    const emojiRow = document.getElementById('chat-emoji-row');
    if (emojiRow) {
      EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'chat-emoji-btn';
        btn.textContent = emoji;
        btn.setAttribute('aria-label', `Send ${emoji}`);
        btn.addEventListener('click', () => _sendText(emoji));
        emojiRow.appendChild(btn);
      });
    }

    // Send on button click
    _sendBtn?.addEventListener('click', _onSend);

    // Send on Enter key
    _input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _onSend();
      }
    });

    // Prevent game card clicks from triggering through panel
    _panel.addEventListener('click', (e) => e.stopPropagation());
  }

  // ── Toggle open / close ─────────────────────────────────────────────────
  function toggle() {
    if (!_panel) _init();
    _isOpen = !_isOpen;
    _panel?.classList.toggle('open', _isOpen);

    if (_isOpen) {
      _unread = 0;
      _fab?.classList.remove('has-unread');
      _input?.focus();
      // Scroll to bottom
      if (_messages) _messages.scrollTop = _messages.scrollHeight;
    }
  }

  // ── Receive a message from any peer ─────────────────────────────────────
  function onMessage({ senderId, senderName, text }) {
    if (!_messages) _init();
    if (!_messages) return;

    const myId    = typeof App !== 'undefined' ? App.state.myId : null;
    const isMine  = senderId === myId;

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isMine ? 'mine' : 'other'}`;

    const sender = document.createElement('div');
    sender.className = 'chat-sender';
    sender.textContent = isMine ? 'You' : _esc(senderName);

    const msg = document.createElement('div');
    msg.className = 'chat-text';
    msg.textContent = text;

    bubble.appendChild(sender);
    bubble.appendChild(msg);
    _messages.appendChild(bubble);

    // Auto-scroll
    _messages.scrollTop = _messages.scrollHeight;

    // Unread badge when panel is closed
    if (!_isOpen) {
      _unread++;
      _fab?.classList.add('has-unread');
    }
  }

  // ── Private: send text via App ──────────────────────────────────────────
  function _onSend() {
    if (!_input) return;
    const text = _input.value.trim();
    if (!text) return;
    _input.value = '';
    if (typeof App !== 'undefined') App.sendChat(text);
  }

  function _sendText(text) {
    if (typeof App !== 'undefined') App.sendChat(text);
  }

  // ── Utility ────────────────────────────────────────────────────────────
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Re-init when game screen becomes active ────────────────────────────
  // Watch for the game screen being shown
  const _observer = new MutationObserver(() => {
    const gameScreen = document.getElementById('screen-game');
    if (gameScreen && gameScreen.classList.contains('active')) {
      _init();
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    const gameScreen = document.getElementById('screen-game');
    if (gameScreen) {
      _observer.observe(gameScreen, { attributes: true, attributeFilter: ['class'] });
    }
    // Also try init immediately in case game screen is already active
    _init();
  });

  // ── Public API ─────────────────────────────────────────────────────────
  return { toggle, onMessage };
})();
