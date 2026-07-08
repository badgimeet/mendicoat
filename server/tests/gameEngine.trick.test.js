const { resolveTrick, canPlayCard } = require('../gameEngine');

describe('resolveTrick', () => {
  test('highest led-suit card wins when no trump played', () => {
    const trick = [
      { playerId: 0, card: { suit: 'H', rank: 'K', value: 13 } },
      { playerId: 1, card: { suit: 'H', rank: 'A', value: 14 } },
      { playerId: 2, card: { suit: 'H', rank: '9', value: 9 } },
      { playerId: 3, card: { suit: 'H', rank: '5', value: 5 } },
    ];
    const result = resolveTrick(trick, 'H', null);
    expect(result.winnerId).toBe(1); // AH wins
    expect(result.newTrump).toBeNull();
  });

  test('off-suit card does not beat led-suit card (no trump set yet)', () => {
    const trick = [
      { playerId: 0, card: { suit: 'H', rank: 'K', value: 13 } },
      { playerId: 1, card: { suit: 'H', rank: '9', value: 9 } },
      { playerId: 2, card: { suit: 'S', rank: 'A', value: 14 } }, // off-suit, becomes trump
      { playerId: 3, card: { suit: 'H', rank: '5', value: 5 } },
    ];
    const result = resolveTrick(trick, 'H', null);
    // S becomes trump; SA is the only trump → SA wins
    expect(result.newTrump).toBe('S');
    expect(result.winnerId).toBe(2);
  });

  test('trump card beats led-suit cards', () => {
    const trick = [
      { playerId: 0, card: { suit: 'H', rank: 'A', value: 14 } },
      { playerId: 1, card: { suit: 'S', rank: '3', value: 3 } }, // trump=S
      { playerId: 2, card: { suit: 'H', rank: 'K', value: 13 } },
      { playerId: 3, card: { suit: 'H', rank: 'Q', value: 12 } },
    ];
    const result = resolveTrick(trick, 'H', 'S');
    expect(result.winnerId).toBe(1); // 3S (trump) beats AH
  });

  test('highest trump wins when multiple trumps played', () => {
    const trick = [
      { playerId: 0, card: { suit: 'H', rank: 'A', value: 14 } },
      { playerId: 1, card: { suit: 'S', rank: '3', value: 3 } },
      { playerId: 2, card: { suit: 'S', rank: 'K', value: 13 } }, // higher trump
      { playerId: 3, card: { suit: 'H', rank: 'Q', value: 12 } },
    ];
    const result = resolveTrick(trick, 'H', 'S');
    expect(result.winnerId).toBe(2); // KS beats 3S
  });

  test('detects new trump from first off-suit card', () => {
    const trick = [
      { playerId: 0, card: { suit: 'H', rank: 'A', value: 14 } },
      { playerId: 1, card: { suit: 'H', rank: '9', value: 9 } },
      { playerId: 2, card: { suit: 'D', rank: '5', value: 5 } }, // first off-suit → trump = D
      { playerId: 3, card: { suit: 'D', rank: 'K', value: 13 } }, // higher trump
    ];
    const result = resolveTrick(trick, 'H', null);
    expect(result.newTrump).toBe('D');
    expect(result.winnerId).toBe(3); // KD beats 5D as highest trump
  });

  test('does not overwrite existing trump', () => {
    const trick = [
      { playerId: 0, card: { suit: 'H', rank: 'A', value: 14 } },
      { playerId: 1, card: { suit: 'C', rank: '7', value: 7 } }, // off-suit, NOT trump
      { playerId: 2, card: { suit: 'S', rank: 'K', value: 13 } }, // trump (already set)
      { playerId: 3, card: { suit: 'H', rank: 'Q', value: 12 } },
    ];
    const result = resolveTrick(trick, 'H', 'S'); // trump already 'S'
    expect(result.newTrump).toBe('S'); // unchanged
    expect(result.winnerId).toBe(2); // KS wins
  });
});

describe('canPlayCard', () => {
  test('must follow suit if player has led suit', () => {
    const hand = [
      { suit: 'H', rank: 'K' },
      { suit: 'S', rank: 'A' },
    ];
    expect(canPlayCard({ suit: 'S', rank: 'A' }, hand, 'H')).toBe(false);
    expect(canPlayCard({ suit: 'H', rank: 'K' }, hand, 'H')).toBe(true);
  });

  test('can play any card if player has no led suit', () => {
    const hand = [{ suit: 'D', rank: '5' }, { suit: 'S', rank: '7' }];
    expect(canPlayCard({ suit: 'D', rank: '5' }, hand, 'H')).toBe(true);
    expect(canPlayCard({ suit: 'S', rank: '7' }, hand, 'H')).toBe(true);
  });

  test('can play any card on the first play of a trick (no ledSuit)', () => {
    const hand = [{ suit: 'H', rank: 'A' }];
    expect(canPlayCard({ suit: 'H', rank: 'A' }, hand, null)).toBe(true);
  });
});
