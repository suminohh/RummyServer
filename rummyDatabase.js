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
  done: "done",
  rummy: "rummy"
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

  verifyUser = async idToken => {
    return await admin
      .auth()
      .verifyIdToken(idToken)
      .then(function(decodedToken) {
        return decodedToken.uid;
      })
      .catch(function(error) {
        console.log(error);
        return null;
      });
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

  getDeckDoc = async gameRef => {
    var querySnapshot = await gameRef.collection("deck").get();
    return querySnapshot.docs[0];
  };

  createHand = async (gameRef, userRef) =>
    await gameRef.collection("hands").add({ player: userRef, cards: [] });

  getHandDocs = async gameRef => {
    return (await gameRef.collection("hands").get()).docs;
  };

  getPlayedSetDocs = async gameRef => {
    return (await gameRef.collection("sets").get()).docs;
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
    setType,
    sameSuitContinuedSetDoc,
    straightContinuedSetDocBelow,
    straightContinuedSetDocAbove
  ) => {
    return await gameRef.collection("sets").add({
      player: userRef,
      cards: cards,
      set_type: setType,
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

  traverseSets = async (upwards, setDoc, cards) => {
    var setCards = [...cards, ...setDoc.data().cards];
    if (upwards) {
      if (setDoc.data().straight_continued_set_above) {
        const newSetDoc = await setDoc
          .data()
          .straight_continued_set_above.get();
        return await this.traverseSets(upwards, newSetDoc, setCards);
      }
    } else {
      if (setDoc.data().straight_continued_set_below) {
        const newSetDoc = await setDoc
          .data()
          .straight_continued_set_below.get();
        return await this.traverseSets(upwards, newSetDoc, setCards);
      }
    }
    return setCards;
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

  powerSet = list => {
    var set = [],
      listSize = list.length,
      combinationsCount = 1 << listSize;

    for (var i = 1; i < combinationsCount; i++) {
      for (var j = 0, combination = []; j < listSize; j++)
        if (i & (1 << j)) combination.push(list[j]);

      if (Deck.potentialTypeOfSet(combination, true)[0]) {
        set.push(combination);
      }
    }
    return set;
  };

  getPotentialDiscardSetsUsingHand = (handDoc, discardCard) => {
    const cardsInHandPowerSet = this.powerSet(handDoc.data().cards).map(set => [
      ...set,
      discardCard
    ]);
    var potentialCardSets = [];
    for (var i = 0; i < cardsInHandPowerSet.length; i++) {
      if (Deck.potentialTypeOfSet(cardsInHandPowerSet[i], true)[0]) {
        potentialCardSets.push(cardsInHandPowerSet[i]);
      }
    }
    return potentialCardSets;
  };

  canDiscardBeUsed = (handDoc, playedSetDocs, discardCard) => {
    const potentialSets = this.getPotentialDiscardSetsUsingHand(
      handDoc,
      discardCard
    );
    for (var i = 0; i < potentialSets.length; i++) {
      var potentialSet = Deck.potentialTypeOfSet(potentialSets[i], false);
      if (potentialSet[0]) {
        if (potentialSet[1] === "Straight") {
          if (Deck.validateStraight(potentialSets[i])[0]) {
            return true;
          }
        } else {
          return true;
        }
      }
      for (var j = 0; j < playedSetDocs.length; j++) {
        const playedCards = playedSetDocs[j].data().cards;
        potentialSet = Deck.potentialTypeOfSet(
          [...potentialSets[i], ...playedCards],
          true
        );
        if (potentialSet[0]) {
          if (potentialSet[1] === "Straight") {
            if (Deck.validateStraight(potentialSets[i])[0]) {
              return true;
            }
          } else {
            return true;
          }
        }
      }
    }
    return false;
  };

  canDiscardBeUsedAsRummy = (playedSetDocs, discardCard) => {
    for (var j = 0; j < playedSetDocs.length; j++) {
      const playedCards = playedSetDocs[j].data().cards;
      if (Deck.potentialTypeOfSet([...playedCards, discardCard], true)[0]) {
        return true;
      }
    }
    return false;
  };

  createUser = async (userID, name) => {
    const userDoc = await this.getUserDoc(userID);
    if (!userDoc) {
      await this.db
        .collection("users")
        .doc(userID)
        .set({
          user_id: userID,
          name: name,
          deck_style: "default"
        });
    }
    return userID;
  };

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
    const playedSetDocs = await this.getPlayedSetDocs(gameDoc.ref);
    const discard = gameDoc.data().discard;
    const pickedUpCards = discard.slice(discardPickupIndex);
    const isRummyPickup = this.canDiscardBeUsedAsRummy(
      playedSetDocs,
      pickedUpCards[0]
    );
    // TODO: figure out best way to tackle rummy situation
    // if (!isRummyPickup) {
    if (!(await this.isPlayersTurn(gameDoc, userID))) {
      return "Not your turn";
    }
    if (gameDoc.data().game_state !== GAME_STATE.draw) {
      return "Cannot draw now";
    }
    // } else {
    //   console.log("rummy");
    //   const remainingDiscard = discard.slice(0, discardPickupIndex);
    //   gameDoc.ref.update({ discard: remainingDiscard });
    //   handDoc.ref.update({
    //     cards: [...handDoc.data().cards, ...pickedUpCards]
    //   });
    //   await gameDoc.ref.update({ game_state: GAME_STATE.rummy });
    //   return "Rummy";
    // }
    var handDoc = await this.getHandDocForUser(gameDoc.ref, userRef);
    const isDiscardPickupAllowed = this.canDiscardBeUsed(
      handDoc,
      playedSetDocs,
      pickedUpCards[0]
    );
    if (!isDiscardPickupAllowed)
      return "Cannot use the card being picked up from discard";
    const remainingDiscard = discard.slice(0, discardPickupIndex);
    gameDoc.ref.update({ discard: remainingDiscard });
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
      if (cards.indexOf(discardPickupCard) != -1) {
        await this.setDiscardPickupCard(gameDoc, null);
        await gameRef.update({ game_state: GAME_STATE.play });
      } else {
        return `Must play the ${discardPickupCard} in a set before any other set`;
      }
    }
    var orderedCards = [];
    // TODO: This will fail if <3 cards, which shouldn't always fail- ex playing 1 card off of another set
    // maybe don't check just the cards unless there isn't a continued set.
    var potentialSet = Deck.potentialTypeOfSet(cards, !!continuedSetID);
    if (!potentialSet[0] && !continuedSetID) return potentialSet[1];
    if (potentialSet[1] == "Straight") {
      var isValidStraight = Deck.validateStraight(cards);
      if (!isValidStraight[0]) return "Invalid Straight";
      orderedCards = isValidStraight[1];
    } else if (potentialSet[1] == "Wild") {
      orderedCards = [...cards];
    }

    var allCards = [...cards];

    var setDoc = null;
    var continuedCards = [];
    var cardCompare = 0;
    if (continuedSetID) {
      setDoc = await this.getSetDoc(gameRef, continuedSetID);
      continuedCards = setDoc.data().cards;
      if (
        setDoc.data().set_type !== potentialSet[1] &&
        potentialSet[1] !== "Wild"
      ) {
        return `Cannot play off of selected set becase it is not a ${potentialSet[1]} set`;
      }
      if (potentialSet[1] === "Straight" || potentialSet[1] === "Wild") {
        cardCompare = Deck.compareCards(
          continuedCards[0],
          orderedCards[orderedCards.length - 1]
        );
        if (cardCompare !== 0) {
          allCards = await this.traverseSets(
            cardCompare === 1,
            setDoc,
            orderedCards
          );
        } else if (potentialSet[1] !== "Wild") {
          return `Cannot play off of selected because the straight is invalid`;
        }
        if (potentialSet[1] === "Wild" && cardCompare === 0) {
          allCards = [cards[0], ...continuedCards];
        }
      }
      var potentialFullSet = Deck.potentialTypeOfSet(allCards);
      if (!potentialFullSet[0])
        return `Cards selected from hand are a ${potentialSet[1]}, but cannot be attached to the played set because: ${potentialFullSet[1]}`;
      if (potentialFullSet[1] == "Straight") {
        var isValidStraight = Deck.validateStraight(allCards);
        if (!isValidStraight[0]) return "Invalid Straight";
      }

      if (potentialFullSet[1] == "Straight") {
        if (cardCompare === -1) {
          if (setDoc.data().straight_continued_set_above) {
            return "Set is already continued upward";
          }
          const newSetRef = await this.createSet(
            gameRef,
            userRef,
            orderedCards,
            "Straight",
            null,
            setDoc,
            null
          );
          setDoc.ref.update({ straight_continued_set_above: newSetRef });
        } else if (cardCompare === 1) {
          if (setDoc.data().straight_continued_set_below) {
            return "Set is already continued downward";
          }
          const newSetRef = await this.createSet(
            gameRef,
            userRef,
            orderedCards,
            "Straight",
            null,
            null,
            setDoc
          );
          setDoc.ref.update({ straight_continued_set_below: newSetRef });
        } else {
          return `unknown error`;
        }
      } else {
        if (setDoc.data().same_suit_continued_set) {
          return "Set is already continued";
        }
        const newSetRef = await this.createSet(
          gameRef,
          userRef,
          cards,
          "Same Value",
          setDoc,
          null,
          null
        );
        setDoc.ref.update({ same_suit_continued_set: newSetRef });
      }
    } else {
      await this.createSet(
        gameRef,
        userRef,
        potentialSet[1] == "Straight" ? orderedCards : cards,
        potentialSet[1],
        null,
        null,
        null
      );
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
    const newDiscardPile = [...gameDoc.data().discard, card];
    var newTurn = (await this.isPlayer1Turn(gameDoc))
      ? gameDoc.data().player2
      : gameDoc.data().player1;
    await gameRef.update({
      game_state: GAME_STATE.draw,
      turn: newTurn,
      discard: newDiscardPile
    });
    return "Success";
  };
};
