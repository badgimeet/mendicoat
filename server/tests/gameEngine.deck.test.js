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
    expect(card).toHaveProperty('value');
    expect(card).toHaveProperty('id');
  });

  test('deck has no duplicate card ids', () => {
    const deck = createDeck(4);
    const ids = deck.map(c => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(52);
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
    expect(Object.keys(hands)).toHaveLength(6);
    Object.values(hands).forEach(hand => expect(hand).toHaveLength(8));
  });

  test('deals 6 cards to each of 8 players', () => {
    const deck = createDeck(8);
    const hands = dealCards(deck, 8);
    expect(Object.keys(hands)).toHaveLength(8);
    Object.values(hands).forEach(hand => expect(hand).toHaveLength(6));
  });

  test('no card appears in two hands', () => {
    const deck = createDeck(4);
    const hands = dealCards(deck, 4);
    const allCards = Object.values(hands).flat().map(c => c.id);
    const unique = new Set(allCards);
    expect(unique.size).toBe(allCards.length);
  });
});
