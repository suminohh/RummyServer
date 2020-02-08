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

  getGameDoc = async gameID => {
    return await this.db
      .collection("games")
      .doc(gameID)
      .get();
  };

  getUserDoc = async userID => {
    var usersRef = this.db.collection("users");
    var querySnapshot = await usersRef.where("user_id", "==", userID).get();
    return querySnapshot.docs[0];
  };

  createDeck = async gameRef => {
    const deck = new Deck();
    deck.shuffle();
    await gameRef
      .collection("deck")
      .add({ cards: deck.cards, cards_used: deck.cardsUsed });
  };

  getDeckRef = async gameRef => {
    var querySnapshot = await gameRef.collection("deck").get();
    var deckQueryDocumentSnapshot = querySnapshot.docs[0];
    return deckQueryDocumentSnapshot.ref;
  };

  getDeckDoc = async gameRef => {
    var deckRef = await this.getDeckRef(gameRef);
    return await deckRef.get();
  };

  createHand = async (gameRef, userRef) =>
    await gameRef.collection("hands").add({ player: userRef, cards: [] });

  getHandsRefs = async gameRef => {
    var querySnapshot = await gameRef.collection("hands").get();
    return querySnapshot.docs;
  };

  createGame = async userID => {
    const userRef = (await this.getUserDoc(userID)).ref;
    var gameID = "MISSING";
    var gameRef = await this.db
      .collection("games")
      .add({ player1: userRef, turn: userRef });
    gameID = gameRef.id;
    this.createDeck(gameRef);
    this.createHand(gameRef, userRef);
    return gameID;
  };

  joinGame = async (userID, gameID) => {
    var returnMessage;
    const userRef = (await this.getUserDoc(userID)).ref;
    const gameRef = (await this.getGameDoc(gameID)).ref;
    // TODO: fail if player2 is already set
    await gameRef
      .update({ player2: userRef })
      .then(async _ => {
        await gameRef
          .collection("hands")
          .add({ player: userRef, cards: [] })
          .then(async _ => {
            await this.getDeckDoc(gameRef).then(async deckDoc => {
              var cards = deckDoc.data().cards;
              var first14Cards = cards.slice(0, 14);
              var p1Hand = [];
              var p2Hand = [];
              for (var i = 0; i < 14; i += 2) {
                p1Hand.push(first14Cards[i]);
                p2Hand.push(first14Cards[i + 1]);
              }
              await this.getHandsRefs(gameRef).then(async handsRefs => {
                var hand1 = await handsRefs[0].ref.get();
                if (hand1.data().player == userRef) {
                  handsRefs[0].ref.update({ cards: p2Hand });
                  handsRefs[1].ref.update({ cards: p1Hand });
                } else {
                  handsRefs[0].ref.update({ cards: p1Hand });
                  handsRefs[1].ref.update({ cards: p2Hand });
                }
              });

              var firstDiscard = cards[14];
              gameRef.update({ discard: [firstDiscard] });
              await deckDoc.ref.update({ cards_used: 15 }).then(async _ => {
                returnMessage = "Success";
              });
            });
          });
      })
      .catch(_ => {
        returnMessage = "Game not Found";
      });
    return returnMessage;
  };

  pickupDeck = async (userID, gameID) => {
    // TODO: check if player is in game, is player's turm, and hasn't already picked up
    var returnMessage = "Error";
    const userRef = (await this.getUserDoc(userID)).ref;
    const gameRef = (await this.getGameDoc(gameID)).ref;
    await this.getDeckRef(gameRef).then(async deckRef => {
      await deckRef.get().then(async deckDoc => {
        var cards = deckDoc.data().cards;
        var cardsUsed = deckDoc.data().cards_used;
        const pickedUpCard = cards[cardsUsed];
        deckRef.update({ cards_used: cardsUsed + 1 });
        await this.getHandsRefs(gameRef).then(async handsRefs => {
          var hand1 = await handsRefs[0].ref.get();
          var hand2 = await handsRefs[1].ref.get();
          if (hand1.data().player == userRef) {
            handsRefs[0].ref.update({
              cards: [...hand1.data().cards, pickedUpCard]
            });
          } else {
            handsRefs[1].ref.update({
              cards: [...hand2.data().cards, pickedUpCard]
            });
          }
        });
        returnMessage = "Success";
      });
    });
    return returnMessage;
  };

  playCards = async (userID, gameID, cards) => {};
};
