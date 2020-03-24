const suits = ["Spades", "Hearts", "Clubs", "Diamonds"];
const values = [
  "Ace",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "Jack",
  "Queen",
  "King"
];
const valuesCycle = [...values, "Ace"];
const cards = suits.flatMap(suit => {
  return values.map(value => `${value} of ${suit}`);
});

module.exports = class Deck {
  constructor() {
    this.cards = [...cards];
    this.cardsUsed = 0;
  }

  shuffle() {
    var m = this.cards.length,
      t,
      i;

    // While there remain elements to shuffle…
    while (m) {
      // Pick a remaining element…
      i = Math.floor(Math.random() * m--);

      // And swap it with the current element.
      t = this.cards[m];
      this.cards[m] = this.cards[i];
      this.cards[i] = t;
    }
  }

  pickup(n = 1) {
    const pickupCards = this.cards.slice(this.cardsUsed, this.cardsUsed + n);
    this.cardsUsed += n;
    return pickupCards;
  }

  reset() {
    this.cards = [...cards];
    this.cardsUsed = 0;
  }

  static validateSet(cards, continuing = false, validateStraight = true) {
    var cardValues = new Set();
    var cardSuits = new Set();
    var cardsSet = new Set();
    var fakeCard = false;
    cards.forEach(card => {
      const cardParts = card.split(" ");
      if (!this.isCard(card)) fakeCard = true;
      cardsSet.add(card);
      cardValues.add(cardParts[0]);
      cardSuits.add(cardParts[2]);
    });

    if (cards.length < 3 && !continuing) return [false, "Not enough cards", []];
    if (fakeCard) return [false, "Invalid suit or value", []];
    if (cardsSet.size != cards.length) return [false, "Duplicate card", []];
    if (cards.length === 1) return [true, "Wild", cards];
    if (
      cardSuits.size === 1 &&
      cardValues.size === cards.length &&
      cards.length <= 13
    ) {
      if (validateStraight) {
        const isValidArray = this.validateStraight(Array.from(cardsSet));
        if (isValidArray[0]) {
          return [true, "Straight", isValidArray[1]];
        }
        return [false, "Random cards", []];
      }
      return [true, "Straight", cards];
    }

    if (
      cardSuits.size === cards.length &&
      cardValues.size === 1 &&
      cards.length <= 4
    )
      return [true, "Same Value", cards];
    return [false, "Random cards", []];
  }

  static orderCards(cards, aceLast) {
    var orderedCards = [...cards];
    orderedCards.sort((a, b) => this.compareCards(a, b, aceLast));
    return orderedCards;
  }

  static validateStraight(cards) {
    const aceFirstOrderedCards = this.orderCards(cards, false);
    var properStraight = true;
    for (var index = 0; index < aceFirstOrderedCards.length - 1; index++) {
      const curCardValPlusOne =
        valuesCycle[
          valuesCycle.indexOf(aceFirstOrderedCards[index].split(" ")[0]) + 1
        ];
      if (curCardValPlusOne !== aceFirstOrderedCards[index + 1].split(" ")[0])
        properStraight = false;
    }
    if (properStraight) return [true, aceFirstOrderedCards];
    const aceLastOrderedCards = this.orderCards(cards, true);
    var properStraight = true;
    for (var index = 0; index < aceLastOrderedCards.length - 1; index++) {
      const curCardValPlusOne =
        valuesCycle[
          valuesCycle.indexOf(aceLastOrderedCards[index].split(" ")[0]) + 1
        ];
      if (curCardValPlusOne !== aceLastOrderedCards[index + 1].split(" ")[0])
        properStraight = false;
    }
    if (properStraight) return [true, aceLastOrderedCards];
    return [false, cards];
  }

  static compareCards(a, b, aceLast) {
    const valuesSlice = aceLast
      ? valuesCycle.slice(1)
      : valuesCycle.slice(0, 13);
    const indexA = valuesSlice.indexOf(a.split(" ")[0]);
    const indexB = valuesSlice.indexOf(b.split(" ")[0]);
    if (indexA < indexB) {
      return -1;
    }
    if (indexA > indexB) {
      return 1;
    }
    return 0;
  }

  static isCard(potentialCard) {
    return cards.indexOf(potentialCard) > -1;
  }
};
