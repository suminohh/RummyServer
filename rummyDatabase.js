const Deck = require("./deck");
var admin = require("firebase-admin");

var serviceAccount = require("./rummysite_creds.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://rummysite-e9ddf.firebaseio.com"
});

module.exports = class RummyDatabase {
  constructor() {
    this.db = admin.firestore();
  }

  getGameRef = docID => this.db.collection("games").doc(docID);

  getUserRef = userID => this.db.collection("users").doc(userID);

  createDeck = () => {
    const deck = new Deck();
    deck.shuffle();
    return this.db
      .collection("decks")
      .add({ cards: deck.cards, cards_used: deck.cardsUsed });
  };

  createGame = userID => {
    const gameData = {
      user_id: userID
    };
  };
};
