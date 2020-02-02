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
};
