// client/js/gameEngine.js
// Browser ES module — identical logic to server/gameEngine.js, CommonJS → ESM
'use strict';

// ─── Card Model ───────────────────────────────────────────────────────────────
const SUITS = ['S', 'H', 'D', 'C']; // Spades, Hearts, Diamonds, Clubs
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VALUES = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,
  '9':9,'10':10,'J':11,'Q':12,'K':13,'A':14,
};

// ─── Deck Creation ────────────────────────────────────────────────────────────
/**
 * Create and shuffle a deck appropriate for the given player count.
 * 4 players → 52 cards (full deck)
 * 6 or 8 players → 48 cards (all four 2s removed)
 */
function createDeck(playerCount) {
  let cards = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      cards.push({ id: `${rank}${suit}`, rank, suit, value: RANK_VALUES[rank] });
  if (playerCount === 6 || playerCount === 8)
    cards = cards.filter(c => c.rank !== '2');
  return shuffle(cards);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Dealing ──────────────────────────────────────────────────────────────────
/**
 * Deal cards evenly to `playerCount` players.
 * Returns an object keyed by seat index (0, 1, 2, …).
 */
function dealCards(deck, playerCount) {
  const perPlayer = Math.floor(deck.length / playerCount);
  const hands = {};
  for (let i = 0; i < playerCount; i++)
    hands[i] = deck.slice(i * perPlayer, (i + 1) * perPlayer);
  return hands;
}

// ─── Trick Resolution ─────────────────────────────────────────────────────────
/**
 * Determine the winner of a completed trick.
 *
 * @param {Array<{playerId, card}>} trick  - Cards played in order
 * @param {string} ledSuit                 - Suit of the first card played
 * @param {string|null} trump              - Current trump suit (null = not yet set)
 * @returns {{ winnerId, newTrump }}
 *   newTrump is set when trump is established for the first time this round.
 */
function resolveTrick(trick, ledSuit, trump) {
  let newTrump = trump;
  // In Cut Mode: if no trump yet, the first off-suit card sets trump
  if (!trump) {
    const offSuit = trick.find(t => t.card.suit !== ledSuit);
    if (offSuit) newTrump = offSuit.card.suit;
  }
  let winner = trick[0];
  for (let i = 1; i < trick.length; i++)
    if (_isBetter(trick[i].card, winner.card, ledSuit, newTrump)) winner = trick[i];
  return { winnerId: winner.playerId, newTrump };
}

/**
 * Returns true if `challenger` beats `current` card.
 */
function _isBetter(challenger, current, ledSuit, trump) {
  const cIsTrump = trump && challenger.suit === trump;
  const wIsTrump = trump && current.suit === trump;
  if (cIsTrump && !wIsTrump) return true;    // trump beats non-trump
  if (!cIsTrump && wIsTrump) return false;   // non-trump loses to trump
  // Both trump or both non-trump:
  if (!cIsTrump && challenger.suit !== ledSuit) return false;
  if (!wIsTrump && current.suit !== ledSuit)    return true;
  return challenger.value > current.value;
}

// ─── Play Validation ──────────────────────────────────────────────────────────
/**
 * Returns true if the player is allowed to play `card` given their hand and the led suit.
 * Rule: must follow led suit if you have it; otherwise any card is legal.
 */
function canPlayCard(card, hand, ledSuit) {
  if (!ledSuit) return true;
  const hasLedSuit = hand.some(c => c.suit === ledSuit);
  if (!hasLedSuit) return true;
  return card.suit === ledSuit;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────
/**
 * Calculate scores for a completed round.
 *
 * @param {{ 0: number, 1: number }} tricksWon - Tricks won per team
 * @param {{ 0: number, 1: number }} tensWon   - 10s captured per team
 * @param {number} totalTricks                  - Total tricks in the round
 * @returns {{ scores: { 0, 1 }, mendikot: boolean }}
 */
function calculateRoundScore(tricksWon, tensWon, totalTricks) {
  const scores = { 0: 0, 1: 0 };
  let mendikot = false;
  if (tensWon[0] === 4)      { scores[0] = 2; mendikot = true; }
  else if (tensWon[1] === 4) { scores[1] = 2; mendikot = true; }
  else {
    const threshold = Math.floor(totalTricks / 2) + 1;
    if (tricksWon[0] >= threshold)      scores[0] = 1;
    else if (tricksWon[1] >= threshold) scores[1] = 1;
  }
  return { scores, mendikot };
}

export { createDeck, dealCards, resolveTrick, canPlayCard, calculateRoundScore };
