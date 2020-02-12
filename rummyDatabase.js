const Deck = require("./deck");
var admin = require("firebase-admin");

var serviceAccount = require("./rummysite_creds.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://rummysite-e9ddf.firebaseio.com"
});

const GAME_STATE = {
  setup: "setup",
  draw: "draw",
  play: "play",
  discardPlay: "discardPlay",
  done: "done"
};

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
    // TODO: add shuffling - removed for testing
    // deck.shuffle();
    await gameRef
      .collection("deck")
      .add({ cards: deck.cards, cards_used: deck.cardsUsed });
  };

  getDeckDoc = async gameRef => {
    var querySnapshot = await gameRef.collection("deck").get();
    return querySnapshot.docs[0];
  };

  createHand = async (gameRef, userRef) =>
    await gameRef.collection("hands").add({ player: userRef, cards: [] });

  getHandDocs = async gameRef => {
    return (await gameRef.collection("hands").get()).docs;
  };

  getHandDocForUser = async (gameRef, userRef) => {
    var hand = await gameRef
      .collection("hands")
      .where("player", "==", userRef)
      .get();
    return hand.docs[0];
  };

  areCardsInHand = (handDoc, cards) => {
    var cardsInHand = handDoc.data().cards;
    cards.forEach(card => {
      if (cardsInHand.indexOf(card) == -1) {
        return false;
      }
    });
    return true;
  };

  removeCardsFromHand = async (handDoc, cards) => {
    var newCardsInHand = handDoc.data().cards;
    cards.forEach(card => {
      const cardInHandIndex = newCardsInHand.indexOf(card);
      newCardsInHand.splice(cardInHandIndex, 1);
    });

    await handDoc.ref.update({ cards: newCardsInHand });
  };

  createSet = async (
    gameRef,
    userRef,
    cards,
    sameSuitContinuedSetDoc,
    straightContinuedSetDocBelow,
    straightContinuedSetDocAbove
  ) => {
    return await gameRef.collection("sets").add({
      player: userRef,
      cards: cards,
      same_suit_continued_set: sameSuitContinuedSetDoc
        ? sameSuitContinuedSetDoc.ref
        : null,
      straight_continued_set_below: straightContinuedSetDocBelow
        ? straightContinuedSetDocBelow.ref
        : null,
      straight_continued_set_above: straightContinuedSetDocAbove
        ? straightContinuedSetDocAbove.ref
        : null
    });
  };

  getSetDoc = async (gameRef, setID) => {
    return await gameRef
      .collection("sets")
      .doc(setID)
      .get();
  };

  isPlayersTurn = async (gameDoc, userID) => {
    const turnRef = gameDoc.data().turn;
    const turnDoc = await turnRef.get();
    return userID === turnDoc.data().user_id;
  };

  isPlayerInGame = async (gameDoc, userID) => {
    const player1Ref = gameDoc.data().player1;
    const player1Doc = await player1Ref.get();
    return userID === player1Doc.data().user_id;
  };

  isPlayer1Turn = async gameDoc => {
    const player1Ref = gameDoc.data().player1;
    const player1Doc = await player1Ref.get();
    const turnRef = gameDoc.data().turn;
    const turnDoc = await turnRef.get();
    return player1Doc.data().user_id === turnDoc.data().user_id;
  };

  setDiscardPickupCard = async (gameDoc, card) => {
    await gameDoc.ref.update({ discard_pickup_card: card });
  };

  getDiscardPickupCard = gameDoc => gameDoc.data().discard_pickup_card;

  sequenceFromCards = cards => Deck.sequenceFromCards(cards);

  createGame = async userID => {
    const userRef = (await this.getUserDoc(userID)).ref;
    var gameID = "MISSING";
    var gameRef = await this.db.collection("games").add({
      player1: userRef,
      turn: userRef,
      game_state: GAME_STATE.setup,
      discard_pickup_card: null
    });
    gameID = gameRef.id;
    this.createDeck(gameRef);
    this.createHand(gameRef, userRef);
    return gameID;
  };

  joinGame = async (userID, gameID) => {
    const userRef = (await this.getUserDoc(userID)).ref;
    const gameDoc = await this.getGameDoc(gameID);
    const gameRef = gameDoc.ref;
    console.log(gameDoc);
    if (!gameDoc.exists) {
      return "Game not found";
    }
    if (gameDoc.data().game_state !== GAME_STATE.setup) {
      return "Game already joined";
    }
    if (await this.isPlayerInGame(gameDoc, userID)) {
      return "Player cannot join twice";
    }
    await gameRef.update({ player2: userRef });
    await this.createHand(gameRef, userRef);
    var deckDoc = await this.getDeckDoc(gameRef);
    var cards = deckDoc.data().cards;
    var first14Cards = cards.slice(0, 14);
    var p1Hand = [];
    var p2Hand = [];
    for (var i = 0; i < 14; i += 2) {
      p1Hand.push(first14Cards[i]);
      p2Hand.push(first14Cards[i + 1]);
    }
    var p2HandDoc = await this.getHandDocForUser(gameRef, userRef);
    var p1HandDoc = await this.getHandDocForUser(
      gameRef,
      gameDoc.data().player1
    );
    p2HandDoc.ref.update({ cards: p2Hand });
    p1HandDoc.ref.update({ cards: p1Hand });
    var firstDiscard = cards[14];
    gameRef.update({ discard: [firstDiscard] });
    await deckDoc.ref.update({ cards_used: 15 });
    await gameRef.update({ game_state: GAME_STATE.draw });
    return "Success";
  };

  pickupDeck = async (userID, gameID) => {
    const userDoc = await this.getUserDoc(userID);
    const gameDoc = await this.getGameDoc(gameID);
    const deckDoc = await this.getDeckDoc(gameDoc.ref);
    if (!(await this.isPlayersTurn(gameDoc, userID))) {
      return "Not your turn";
    }
    if (gameDoc.data().game_state !== GAME_STATE.draw) {
      return "Cannot draw now";
    }
    var cards = deckDoc.data().cards;
    var cardsUsed = deckDoc.data().cards_used;
    const pickedUpCard = cards[cardsUsed];
    deckDoc.ref.update({ cards_used: cardsUsed + 1 });
    var handDoc = await this.getHandDocForUser(gameDoc.ref, userDoc.ref);
    handDoc.ref.update({
      cards: [...handDoc.data().cards, pickedUpCard]
    });
    await gameDoc.ref.update({ game_state: GAME_STATE.play });
    return "Success";
  };

  pickupDiscard = async (userID, gameID, discardPickupIndex) => {
    const userRef = (await this.getUserDoc(userID)).ref;
    const gameDoc = await this.getGameDoc(gameID);
    if (!(await this.isPlayersTurn(gameDoc, userID))) {
      return "Not your turn";
    }
    if (gameDoc.data().game_state !== GAME_STATE.draw) {
      return "Cannot draw now";
    }
    const discard = gameDoc.data().discard;
    const pickedUpCards = discard.slice(discardPickupIndex);
    const remainingDiscard = discard.slice(0, discardPickupIndex);
    // TODO: check if player can use the card they will be picking up - this may be tough
    gameDoc.ref.update({ discard: remainingDiscard });
    var handDoc = await this.getHandDocForUser(gameDoc.ref, userRef);
    handDoc.ref.update({
      cards: [...handDoc.data().cards, ...pickedUpCards]
    });
    await this.setDiscardPickupCard(gameDoc, pickedUpCards[0]);
    await gameDoc.ref.update({ game_state: GAME_STATE.discardPlay });
    return "Success";
  };

  playCards = async (userID, gameID, cards, continuedSetID) => {
    const userRef = (await this.getUserDoc(userID)).ref;
    const gameDoc = await this.getGameDoc(gameID);
    const gameRef = gameDoc.ref;
    if (!(await this.isPlayersTurn(gameDoc, userID))) {
      return "Not your turn";
    }
    if (
      gameDoc.data().game_state !== GAME_STATE.play &&
      gameDoc.data().game_state !== GAME_STATE.discardPlay
    ) {
      return "Cannot play cards now";
    }
    const userHandDoc = await this.getHandDocForUser(gameRef, userRef);
    if (!this.areCardsInHand(userHandDoc, cards)) {
      return "Card(s) not in your hand";
    }
    var discardPickupCard = await this.getDiscardPickupCard(gameDoc);
    if (discardPickupCard) {
      if (orderedCards.indexOf(discardPickupCard) != -1) {
        await this.setDiscardPickupCard(gameDoc, null);
        await gameRef.update({ game_state: GAME_STATE.play });
      } else {
        return `Must play the ${discardPickupCard} in a set before any other set`;
      }
    }
    var orderedCards = [];

    var potentialSet = Deck.potentialTypeOfSet(cards); // Check if cards alone are a sequence
    if (!potentialSet[0]) return potentialSet[1];
    if (potentialSet[1] == "Straight") {
      var isValidStraight = Deck.validateStraight(cards);
      if (!isValidStraight[0]) return "Invalid Straight";
      orderedCards = isValidStraight[1];
    }

    var allCards = [...cards]; // initiate allCards with passed cards

    var setDoc = null;
    if (continuedSetID) {
      setDoc = await this.getSetDoc(gameRef, continuedSetID);
      if (potentialSet[1] == "Straight") {
        // TODO: should traverse each setDoc until continuedset is null
        // TODO: Check if cards in continued set are above or below the current cards
        // will follow the same (up or down) until null on each card set
      }
    }

    var potentialFullSet = Deck.potentialTypeOfSet(allCards); // Check if cards alone are a sequence
    if (!potentialFullSet[0])
      return `Cards selected from hand are a ${potentialSet[1]}, but cannot be attached to the played set because: ${potentialFullSet[1]}`;
    if (potentialFullSet[1] == "Straight") {
      var isValidStraight = Deck.validateStraight(allCards);
      if (!isValidStraight[0]) return "Invalid Straight";
    }

    if (potentialFullSet[1] == "Straight") {
      // TODO: The following:
      //if setDoc is below
      // await this.createSet(gameRef, userRef, orderedCards, null, setDoc, null);
      //if setDoc is above
      // await this.createSet(gameRef, userRef, orderedCards, null, null, setDoc);
    } else {
      await this.createSet(gameRef, userRef, orderedCards, setDoc, null, null);
    }
    await this.removeCardsFromHand(userHandDoc, orderedCards);
    return "Success";
  };

  discard = async (userID, gameID, card) => {
    const userRef = (await this.getUserDoc(userID)).ref;
    const gameDoc = await this.getGameDoc(gameID);
    const gameRef = gameDoc.ref;
    if (!(await this.isPlayersTurn(gameDoc, userID))) {
      return "Not your turn";
    }
    if (gameDoc.data().game_state !== GAME_STATE.play) {
      if (gameDoc.data().game_state === GAME_STATE.discardPlay) {
        var discardPickupCard = await this.getDiscardPickupCard(gameDoc);
        return `Must play the ${discardPickupCard} before discarding`;
      }
      return "Cannot discard now";
    }
    const userHandDoc = await this.getHandDocForUser(gameRef, userRef);
    if (!this.areCardsInHand(userHandDoc, [card])) {
      return "Card is not in your hand";
    }
    await this.removeCardsFromHand(userHandDoc, [card]);
    var newTurn = (await this.isPlayer1Turn(gameDoc))
      ? gameDoc.data().player2
      : gameDoc.data().player1;
    await gameRef.update({ game_state: GAME_STATE.draw, turn: newTurn });
    return "Success";
  };
};
