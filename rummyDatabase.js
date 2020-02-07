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

  getDeckRef = async gameRef => {
    var deckRef;
    await gameRef
      .collection("deck")
      .get()
      .then(querySnapshot => {
        var deckQueryDocumentSnapshot = querySnapshot.docs[0];
        deckRef = deckQueryDocumentSnapshot.ref;
      });
    return deckRef;
  };

  getHandsRefs = async gameRef => {
    var handsRefs;
    await gameRef
      .collection("hands")
      .get()
      .then(querySnapshot => {
        handsRefs = querySnapshot.docs;
      });
    return handsRefs;
  };

  createGame = async userID => {
    const userRef = this.getUserRef(userID);
    var gameID = "MISSING";
    await this.db
      .collection("games")
      .add({ player1: userRef, turn: userRef })
      .then(async gameRef => {
        gameID = gameRef.id;
        const deck = new Deck();
        deck.shuffle();
        gameRef
          .collection("deck")
          .add({ cards: deck.cards, cards_used: deck.cardsUsed });
        gameRef.collection("hands").add({ player: userRef, cards: [] });
      });
    return gameID;
  };

  joinGame = async (userID, gameID) => {
    var returnMessage;
    const userRef = this.getUserRef(userID);
    const gameRef = this.getGameRef(gameID);
    // TODO: fail if player2 is already set
    await gameRef.update({ player2: userRef }).then(async _ => {
      await gameRef
        .collection("hands")
        .add({ player: userRef, cards: [] })
        .then(async _ => {
          await this.getDeckRef(gameRef).then(async deckRef => {
            await deckRef.get().then(async deckDoc => {
              var cards = deckDoc.data().cards;
              var first14Cards = cards.slice(0, 14);
              var p1Hand = [];
              var p2Hand = [];
              for (var i = 0; i < 14; i += 2) {
                p1Hand.push(first14Cards[i]);
                p2Hand.push(first14Cards[i + 1]);
              }
              await this.getHandsRefs(gameRef).then(handsRefs => {
                handsRefs[0].ref.update({ cards: p1Hand });
                handsRefs[1].ref.update({ cards: p2Hand });
              });

              var firstDiscard = cards[14];
              gameRef.update({ discard: [firstDiscard] });
              await deckRef.update({ cards_used: 15 }).then(async _ => {
                returnMessage = "Success";
              });
            });
          });
        });
    });
    return returnMessage;
  };
};
