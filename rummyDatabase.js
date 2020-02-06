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

  getGameRef = gameID => this.db.collection("games").doc(gameID);

  getUserRef = userID => this.db.collection("users").doc(userID);

  createGame = userID => {
    const userRef = this.getUserRef(userID);
    var gameID;
    this.db
      .collection("games")
      .add({ player1: userRef, turn: userRef })
      .then(gameref => {
        // can then do the following to get data from the deck
        // gameref.get().then(gameresp => {
        //    gameresp.data().player1
        // });
        gameID = gameref.id;
        const deck = new Deck();
        deck.shuffle();
        gameref
          .collection("deck")
          .add({ cards: deck.cards, cards_used: deck.cardsUsed });
        gameref.collection("hands").add({ player: userRef, cards: [] });
        // TODO: a callback to send the gameID to the player who created the game
      });
  };

  joinGame = (userID, gameID) => {
    const userRef = this.getUserRef(userID);
    const gameRef = this.getGameRef(gameID);
    gameRef.update({ player2: userRef });
    gameRef.collection("hands").add({ player: userRef, cards: [] });
    // TODO: distribute cards to each player's hand
    // TODO: a callback to send the player to the game view
  };
};
