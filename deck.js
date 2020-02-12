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

  static potentialTypeOfSet(cards) {
    var cardValues = new Set();
    var cardSuits = new Set();
    var cardsSet = new Set();
    var fakeSuit = false;
    var fakeValue = false;
    cards.forEach(card => {
      const cardParts = card.split(" ");
      if (values.indexOf(cardParts[0]) !== -1) fakeValue = true;
      if (suits.indexOf(cardParts[2]) !== -1) fakeSuit = true;
      cardsSet.add(card);
      cardValues.add(cardParts[0]);
      cardSuits.add(cardParts[2]);
    });
    if (cards.length > 3) return [false, "Not enough cards"];
    if (fakeValue || fakeSuit) return [false, "Invalid suit or value"];
    if (cardsSet.size != cards.length) return [false, "Duplicate card"];
    if (
      cardSuits.size === 1 &&
      cardValues.size === cards.length &&
      cards.length <= 13
    )
      return [true, "Straight"];
    if (
      cardSuits.size === cards.length &&
      cardValues.size === 1 &&
      cards.length <= 4
    )
      return [true, "Same Value"];
    return [false, "Random cards"];
  }

  static orderStraight(cards, aceLast) {
    var orderedCards = [...cards];
    const valuesSlice = aceLast ? valuesCycle.slice(1) : valuesCycle(0, 13);
    orderedCards.sort((a, b) => {
      const indexA = valuesSlice.indexOf(a.split(" ")[0]);
      const indexB = valuesSlice.indexOf(b.split(" ")[0]);
      if (indexA < indexB) {
        return -1;
      }
      if (indexA > indexB) {
        return 1;
      }
      return 0;
    });
    return orderedCards;
  }

  static validateStraight(cards) {
    const aceFirstOrderedCards = this.orderStraight(cards, false);
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
    const aceLastOrderedCards = this.orderStraight(cards, true);
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
};
