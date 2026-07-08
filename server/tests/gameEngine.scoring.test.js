const { calculateRoundScore } = require('../gameEngine');

describe('calculateRoundScore', () => {
  test('team with majority of tricks (7/13) gets 1 point', () => {
    const result = calculateRoundScore({ 0: 7, 1: 6 }, { 0: 2, 1: 2 }, 13);
    expect(result.scores[0]).toBe(1);
    expect(result.scores[1]).toBe(0);
    expect(result.mendikot).toBe(false);
  });

  test('team with 8+ tricks also gets 1 point (not mendikot)', () => {
    const result = calculateRoundScore({ 0: 10, 1: 3 }, { 0: 2, 1: 2 }, 13);
    expect(result.scores[0]).toBe(1);
    expect(result.scores[1]).toBe(0);
    expect(result.mendikot).toBe(false);
  });

  test('mendikot: all 4 tens captured gives 2 points', () => {
    const result = calculateRoundScore({ 0: 10, 1: 3 }, { 0: 4, 1: 0 }, 13);
    expect(result.scores[0]).toBe(2);
    expect(result.scores[1]).toBe(0);
    expect(result.mendikot).toBe(true);
  });

  test('mendikot for team 1', () => {
    const result = calculateRoundScore({ 0: 3, 1: 10 }, { 0: 0, 1: 4 }, 13);
    expect(result.scores[0]).toBe(0);
    expect(result.scores[1]).toBe(2);
    expect(result.mendikot).toBe(true);
  });

  test('losing team (6/13 tricks) gets 0 points', () => {
    const result = calculateRoundScore({ 0: 6, 1: 7 }, { 0: 2, 1: 2 }, 13);
    expect(result.scores[0]).toBe(0);
    expect(result.scores[1]).toBe(1);
  });

  test('works for 8-trick rounds (5 needed to win)', () => {
    const result = calculateRoundScore({ 0: 5, 1: 3 }, { 0: 2, 1: 2 }, 8);
    expect(result.scores[0]).toBe(1);
    expect(result.scores[1]).toBe(0);
  });

  test('works for 6-trick rounds (4 needed to win)', () => {
    const result = calculateRoundScore({ 0: 2, 1: 4 }, { 0: 2, 1: 2 }, 6);
    expect(result.scores[0]).toBe(0);
    expect(result.scores[1]).toBe(1);
  });
});
