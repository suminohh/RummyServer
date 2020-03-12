const Deck = require("./deck");
var admin = require("firebase-admin");

var serviceAccount = require(process.env.NODE_ENV === "dev"
  ? "./rummyHouse_creds_dev.json"
  : "./rummyHouse_creds.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const GAME_STATE = {
  setup: "setup",
  draw: "draw",
  play: "play",
  discardPlay: "discardPlay",
  done: "done",
  rummy: "rummy",
  forfeit: "forfeit"
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
    await gameRef
      .collection("hands")
      .add({ player: userRef, playerID: userRef.id, cards: [] });

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
    console.log("removing cards");
    console.log(cards);
    var newCardsInHand = [...handDoc.data().cards];
    cards.forEach(card => {
      const cardInHandIndex = newCardsInHand.indexOf(card);
      newCardsInHand.splice(cardInHandIndex, 1);
    });

    console.log(newCardsInHand);

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
      player_id: userRef.id,
      cards: cards,
      set_type: setType,
      same_value_continued_set: sameSuitContinuedSetDoc
        ? sameSuitContinuedSetDoc.ref
        : null,
      same_value_continued_set_id: sameSuitContinuedSetDoc
        ? sameSuitContinuedSetDoc.ref.id
        : null,
      straight_continued_set_below: straightContinuedSetDocBelow
        ? straightContinuedSetDocBelow.ref
        : null,
      straight_continued_set_below_id: straightContinuedSetDocBelow
        ? straightContinuedSetDocBelow.ref.id
        : null,
      straight_continued_set_above: straightContinuedSetDocAbove
        ? straightContinuedSetDocAbove.ref
        : null,
      straight_continued_set_above_id: straightContinuedSetDocAbove
        ? straightContinuedSetDocAbove.ref.id
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

  isUserIDPlayer1 = async (gameDoc, userID) => {
    const player1Ref = gameDoc.data().player1;
    const player1Doc = await player1Ref.get();
    return userID === player1Doc.data().user_id;
  };

  isPlayerInGame = async (gameDoc, userID) => {
    const player1Ref = gameDoc.data().player1;
    const player1Doc = await player1Ref.get();
    if (userID === player1Doc.data().user_id) return true;
    const player2Ref = gameDoc.data().player2;
    const player2Doc = await player2Ref.get();
    return userID === player2Doc.data().user_id;
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

  powerSet = (list, filterValid = true) => {
    var set = [],
      listSize = list.length,
      combinationsCount = 1 << listSize;

    for (var i = 1; i < combinationsCount; i++) {
      for (var j = 0, combination = []; j < listSize; j++)
        if (i & (1 << j)) combination.push(list[j]);

      if (filterValid) {
        // gets [isvalid, type of set [straight, value, wild], cards]
        let validatedData = Deck.validateSet(combination, true);

        // checks isValid
        if (validatedData[0]) {
          // pushes type of set, and cards
          set.push([validatedData.slice(1)]);
        }
      } else {
        // pushes type of set, and cards
        set.push(["not validated", combination]);
      }
    }
    return set;
  };

  getDiscardUses = (cardsInHand, playedSetDocs, discardCards) => {
    const discardPowerSet = this.powerSet(
      discardCards.slice(1),
      false
    ).map(set => [set[0], [...set[1], discardCards[0]]]);
    discardPowerSet.push(["not validated", [discardCards[0]]]);

    const handPowerSet = this.powerSet(cardsInHand, false);

    const playedSets = playedSetDocs.map(setDoc => setDoc.data().cards);

    // [continued setID, cards from discard]
    const rummySets = [];

    // [hand cards, cards from discard]
    const discardAndHandSets = [];

    // [continued setID, hand cards, cards from discard]
    const discardPlayedAndHandSets = [];

    // try playing just discard cards (rummy)
    for (let i = 0; i < discardPowerSet.length; i += 1) {
      let discardCombination = discardPowerSet[i][1];

      let validatedDiscardData = Deck.validateSet(discardCombination, false);
      if (validatedDiscardData[0]) {
        rummySets.push([undefined, validatedDiscardData[2]]);
      }
      // try playing discard cards on a played set (rummy)
      for (let j = 0; j < playedSets.length; j += 1) {
        let validatedDiscardAndPlayedData = Deck.validateSet(
          [...discardCombination, ...playedSets[j]],
          true
        );
        if (
          validatedDiscardAndPlayedData[0] &&
          validatedDiscardAndPlayedData[1] === playedSetDocs[j].data().set_type
        ) {
          rummySets.push([
            playedSetDocs[j].id,
            validatedDiscardAndPlayedData[2]
          ]);
        }
      }
      // try playing discard cards with player cards
      for (let j = 0; j < handPowerSet.length; j += 1) {
        let handCombination = handPowerSet[j][1];
        let validatedDiscardAndHandData = Deck.validateSet(
          [...discardCombination, ...handCombination],
          false
        );
        if (validatedDiscardAndHandData[0]) {
          discardAndHandSets.push([
            handCombination,
            validatedDiscardAndHandData[2]
          ]);
        }

        // try playing discard cards with player cards and a played set
        for (let k = 0; k < playedSets.length; k += 1) {
          let validatedDiscardPlayedAndHandData = Deck.validateSet(
            [...discardCombination, ...playedSets[k], ...handCombination],
            true
          );
          if (
            validatedDiscardPlayedAndHandData[0] &&
            validatedDiscardPlayedAndHandData[1] ===
              playedSetDocs[k].data().set_type
          ) {
            discardPlayedAndHandSets.push([
              playedSetDocs[k].id,
              handCombination,
              validatedDiscardPlayedAndHandData[2]
            ]);
          }
        }
      }
    }
    return [rummySets, discardAndHandSets, discardPlayedAndHandSets];
  };

  getUpdatedCardInHandCount = async (gameDoc, userID, cardUpdate) => {
    const isP1 = await this.isUserIDPlayer1(gameDoc, userID);
    let cardInHandCountUpdate = {};
    if (isP1) {
      cardInHandCountUpdate = {
        player1NumCards: gameDoc.data().player1NumCards + cardUpdate
      };
    } else {
      cardInHandCountUpdate = {
        player2NumCards: gameDoc.data().player2NumCards + cardUpdate
      };
    }
    return cardInHandCountUpdate;
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
    const userDoc = await this.getUserDoc(userID);
    const userRef = userDoc.ref;
    var gameID = "MISSING";
    var gameRef = await this.db.collection("games").add({
      player1: userRef,
      player1ID: userRef.id,
      player1Name: userDoc.data().name,
      turn: userRef,
      game_state: GAME_STATE.setup,
      discard_pickup_card: null,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    gameID = gameRef.id;
    this.createDeck(gameRef);
    this.createHand(gameRef, userRef);
    return gameID;
  };

  // TODO:
  // throw errors rather than good responses
  joinGame = async (userID, gameID) => {
    const userDoc = await this.getUserDoc(userID);
    const userRef = userDoc.ref;
    const gameDoc = await this.getGameDoc(gameID);
    const gameRef = gameDoc.ref;
    if (!gameDoc.exists) {
      return "Game not found";
    }
    if (gameDoc.data().game_state !== GAME_STATE.setup) {
      return "Game already joined";
    }
    if (await this.isUserIDPlayer1(gameDoc, userID)) {
      return "Player cannot join twice";
    }
    await gameRef.update({
      player2: userRef,
      player2ID: userRef.id,
      player2Name: userDoc.data().name
    });
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
    gameRef.update({
      discard: [firstDiscard],
      player1NumCards: 7,
      player2NumCards: 7
    });
    await deckDoc.ref.update({ cards_used: 15 });
    await gameRef.update({
      game_state: GAME_STATE.draw,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    return "Success";
  };

  // TODO:
  // throw errors rather than good responses
  deleteGame = async (userID, gameID) => {
    const userDoc = await this.getUserDoc(userID);
    const userRef = userDoc.ref;
    const gameDoc = await this.getGameDoc(gameID);
    const gameRef = gameDoc.ref;
    if (!gameDoc.exists) {
      return "Game not found";
    }
    if (await this.isPlayerInGame(gameDoc, userID)) {
      await gameRef.update({
        game_state: GAME_STATE.forfeit,
        forfeiter: userRef
      });
      return "Success";
    } else {
      return "Player is not in game";
    }
  };

  // TODO:
  // throw errors rather than good responses
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
    await gameDoc.ref.update({
      game_state: GAME_STATE.play,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ...(await this.getUpdatedCardInHandCount(gameDoc, userID, 1))
    });
    return "Success";
  };

  // TODO:
  // throw errors rather than good responses
  // fix determining if pickup is okay
  // start rummy flow if rummy is happening
  // set rummy player if rummy
  pickupDiscard = async (userID, gameID, discardPickupIndex) => {
    const userRef = (await this.getUserDoc(userID)).ref;
    const gameDoc = await this.getGameDoc(gameID);
    const playedSetDocs = await this.getPlayedSetDocs(gameDoc.ref);
    const discard = gameDoc.data().discard;
    const pickedUpCards = discard.slice(discardPickupIndex);
    const firstPickedUpCard = pickedUpCards[0];
    const handDoc = await this.getHandDocForUser(gameDoc.ref, userRef);

    const discardUses = this.getDiscardUses(
      handDoc.data().cards,
      playedSetDocs,
      pickedUpCards
    );

    console.log(discardUses);

    // // TODO: figure out best way to tackle rummy situation
    // if (!isRummyPickup) {
    //   if (!(await this.isPlayersTurn(gameDoc, userID))) {
    //     return "Not your turn";
    //   }
    //   if (gameDoc.data().game_state !== GAME_STATE.draw) {
    //     return "Cannot draw now";
    //   }
    // } else {
    //   // rummy situation
    //   console.log("rummy");
    //   const remainingDiscard = discard.slice(0, discardPickupIndex);
    //   gameDoc.ref.update({ discard: remainingDiscard });
    //   handDoc.ref.update({
    //     cards: [...handDoc.data().cards, ...pickedUpCards]
    //   });
    //   await this.getUpdatedCardInHandCount(
    //     gameDoc,
    //     userID,
    //     pickedUpCards.length
    //   );
    //   await gameDoc.ref.update({
    //     game_state: GAME_STATE.rummy,
    //     rummy_turn: userRef,
    //     rummy_turn_id: userRef.id
    //   });
    //   return "Rummy";
    // }

    // // TODO: update this
    // const isDiscardPickupAllowed = this.canDiscardBeUsed(
    //   handDoc,
    //   playedSetDocs,
    //   pickedUpCards[0]
    // );
    // if (!isDiscardPickupAllowed)
    //   return "Cannot use the card being picked up from discard";
    // const remainingDiscard = discard.slice(0, discardPickupIndex);
    // gameDoc.ref.update({ discard: remainingDiscard });
    // handDoc.ref.update({
    //   cards: [...handDoc.data().cards, ...pickedUpCards]
    // });
    // await this.setDiscardPickupCard(gameDoc, pickedUpCards[0]);
    // await gameDoc.ref.update({
    //   game_state: GAME_STATE.discardPlay,
    //   timestamp: admin.firestore.FieldValue.serverTimestamp(),
    //   ...(await this.getUpdatedCardInHandCount(
    //     gameDoc,
    //     userID,
    //     pickedUpCards.length
    //   ))
    // });
    return "Success";
  };

  // TODO:
  // throw errors rather than good responses
  // work with rummy
  // remove rummy player if rummy and play happens
  // TODO: update use of potential type of set
  playCards = async (userID, gameID, cards, continuedSetID) => {
    const userRef = (await this.getUserDoc(userID)).ref;
    const gameDoc = await this.getGameDoc(gameID);
    const gameRef = gameDoc.ref;
    let rummyPlay = false;
    if (
      !(await this.isPlayersTurn(gameDoc, userID)) &&
      !(gameDoc.data().rummy_turn === userRef)
    ) {
      return "Not your turn";
    }
    if (
      gameDoc.data().game_state !== GAME_STATE.play &&
      gameDoc.data().game_state !== GAME_STATE.discardPlay
    ) {
      if (gameDoc.data().game_state !== GAME_STATE.rummy) {
        rummyPlay = true;
      } else {
        return "Cannot play cards now";
      }
    }
    const userHandDoc = await this.getHandDocForUser(gameRef, userRef);

    if (!this.areCardsInHand(userHandDoc, cards)) {
      return "Card(s) not in your hand";
    }
    var discardPickupCard = await this.getDiscardPickupCard(gameDoc);
    if (discardPickupCard) {
      if (!cards.indexOf(discardPickupCard) != -1) {
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
        return `Cannot play off of selected set because it is not a ${potentialSet[1]} set`;
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
          setDoc.ref.update({
            straight_continued_set_above: newSetRef,
            straight_continued_set_above_id: newSetRef.id
          });
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
          setDoc.ref.update({
            straight_continued_set_below: newSetRef,
            straight_continued_set_below_id: newSetRef.id
          });
        } else {
          return `unknown error`;
        }
      } else {
        if (setDoc.data().same_value_continued_set) {
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
        setDoc.ref.update({
          same_value_continued_set: newSetRef,
          same_value_continued_set_id: newSetRef.id
        });
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

    if (discardPickupCard) {
      await this.setDiscardPickupCard(gameDoc, null);
      await gameRef.update({ game_state: GAME_STATE.play });
    }
    await this.removeCardsFromHand(userHandDoc, cards);
    await gameRef.update({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ...(await this.getUpdatedCardInHandCount(
        gameDoc,
        userID,
        cards.length * -1
      ))
    });
    return "Success";
  };

  // TODO:
  // throw errors rather than good responses
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
      discard: newDiscardPile,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ...(await this.getUpdatedCardInHandCount(gameDoc, userID, -1))
    });
    return "Success";
  };
};
