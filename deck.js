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

  static sequenceFromCards(cards) {
    if (!(cards.length >= 3)) return [false, "Sequence too short"];
    const firstCardParts = cards[0].split(" ");
    var differentSuits = false;
    var differentValues = false;
    var cardValues = [];
    var cardSuits = [];
    cards.forEach(card => {
      const cardParts = card.split(" ");
      if (cardParts[0] !== firstCardParts[0]) differentValues = true;
      if (cardParts[2] !== firstCardParts[2]) differentSuits = true;
      cardValues.push(cardParts[0]);
      cardSuits.push(cardParts[2]);
    });
    if (differentSuits && !differentValues) {
      if (!(cards.length <= 4)) return [false, "Too many cards"];
      var sameSuits = false;
      for (var index = 0; index < cardSuits.length - 1; index++) {
        if (cardSuits.slice(index + 1).indexOf(cardSuits[index]) !== -1)
          sameSuits = true;
      }
      if (sameSuits) return [false, "Random cards"];
      return [true, "Same Value Set"];
    }
    if (!differentSuits && differentValues) {
      var properStraight = true;
      for (var index = 0; index < cardValues.length - 1; index++) {
        const curCardValPlusOne =
          valuesCycle[valuesCycle.indexOf(cardValues[index]) + 1];
        if (curCardValPlusOne !== cardValues[index + 1]) properStraight = false;
      }
      if (properStraight) {
        if (!(cards.length <= 13)) return [false, "Too many cards"];
        return [true, "Straight Set"];
      }
    }
    return [false, "Random cards"];
  }
};
