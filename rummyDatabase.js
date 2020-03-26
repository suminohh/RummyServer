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

  asyncForEach = async (array, callback) => {
    for (let index = 0; index < array.length; index += 1) {
      await callback(array[index], index, array);
    }
  };

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

  deleteCollection = (collectionRef, batchSize) => {
    let query = collectionRef.orderBy("__name__").limit(batchSize);

    return new Promise((resolve, reject) => {
      this.deleteQueryBatch(query, batchSize, resolve, reject);
    });
  };

  deleteQueryBatch = (query, batchSize, resolve, reject) => {
    query
      .get()
      .then(snapshot => {
        if (snapshot.size == 0) {
          return 0;
        }
        let batch = this.db.batch();
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });

        return batch.commit().then(() => {
          return snapshot.size;
        });
      })
      .then(numDeleted => {
        if (numDeleted === 0) {
          resolve();
          return;
        }

        process.nextTick(() => {
          this.deleteQueryBatch(query, batchSize, resolve, reject);
        });
      })
      .catch(reject);
  };

  createPossibleRummies = async (gameRef, userRef, possibleRummies) => {
    await this.deleteCollection(gameRef.collection("possible_rummies"), 100);
    for (let i = 0; i < possibleRummies.length; i += 1) {
      await gameRef.collection("possible_rummies").add({
        player: userRef,
        playerID: userRef.id,
        setcards: possibleRummies[i][0] || null,
        setID: possibleRummies[i][1] || null,
        discards_play: possibleRummies[i][2],
        discards_keep: possibleRummies[i][3]
      });
    }
  };

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

  createSet = async (gameRef, userRef, cards, setType) => {
    let setRef = await gameRef.collection("sets").add({
      set_type: setType,
      lower: 14,
      upper: 14
    });
    await setRef
      .collection("subsets")
      .doc("14")
      .set({ cards: cards, player: userRef });
    await setRef.update({ plays: 1 });
  };

  addToSet = async (userRef, cards, setDoc) => {
    const setRef = setDoc.ref;
    const lowSet = await setRef
      .collection("subsets")
      .doc(`${setDoc.data().lower}`)
      .get();
    const upSet = await setRef
      .collection("subsets")
      .doc(`${setDoc.data().upper}`)
      .get();

    const allSetCardsString = (await this.getSetCards(setRef)).toString();
    const hasKing = allSetCardsString.indexOf("King") !== -1;
    const hasTwo = allSetCardsString.indexOf("2") !== -1;
    const aceLast = hasKing && !hasTwo;

    const lowestSetCard = lowSet.data().cards[0];
    const highestNewCard = cards[cards.length - 1];
    const cardCompare = Deck.compareCards(
      lowestSetCard,
      highestNewCard,
      aceLast
    );

    var directionToUpdate,
      newValue,
      updateData = {},
      sameUser = false;

    switch (cardCompare) {
      case 1:
        directionToUpdate = "lower";
        newValue = setDoc.data().lower - 1;
        if (lowSet.data().player.id === userRef.id) {
          sameUser = true;
        }
        break;
      case -1:
      case 0:
        if (upSet.data().player.id === userRef.id) {
          sameUser = true;
        }
        directionToUpdate = "upper";
        newValue = setDoc.data().upper + 1;
        break;
    }
    if (sameUser) {
      if (directionToUpdate === "upper") {
        console.log("mine upper");
        console.log([...upSet.data().cards, ...cards]);
        upSet.ref.update({ cards: [...upSet.data().cards, ...cards] });
      } else {
        console.log("mine lower");
        console.log([...cards, ...lowSet.data().cards]);
        lowSet.ref.update({ cards: [...cards, ...lowSet.data().cards] });
      }
    } else {
      console.log("not mine");
      console.log(directionToUpdate);
      updateData[directionToUpdate] = newValue;
      console.log(updateData);
      await setRef
        .collection("subsets")
        .doc(`${newValue}`)
        .set({ cards: cards, player: userRef });
    }

    updateData["plays"] = setDoc.data().plays + 1;
    setRef.update(updateData);
  };

  getSetCards = async setRef => {
    const subsetsSnapshot = await setRef.collection("subsets").get();
    let allCards = [];
    subsetsSnapshot.docs.forEach(doc => {
      allCards = [...allCards, ...doc.data().cards];
    });
    console.log(allCards);
    return allCards;
  };

  getSetDoc = async (gameRef, setID) => {
    return await gameRef
      .collection("sets")
      .doc(setID)
      .get();
  };

  getPossibleRummyDoc = async (gameRef, possibleRummyID) => {
    return await gameRef
      .collection("possible_rummies")
      .doc(possibleRummyID)
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
    await gameDoc.ref.update({
      discard_pickup_card: card,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  };

  getDiscardPickupCard = gameDoc => gameDoc.data().discard_pickup_card;

  powerSet = (list, filterValid = false, validateStraight = true) => {
    var set = [],
      listSize = list.length,
      combinationsCount = 1 << listSize;

    for (var i = 1; i < combinationsCount; i++) {
      for (var j = 0, combination = []; j < listSize; j++)
        if (i & (1 << j)) combination.push(list[j]);

      if (filterValid) {
        // gets [isvalid, type of set [straight, value, wild], cards]
        let validatedData = Deck.validateSet(
          combination,
          true,
          validateStraight
        );

        // checks isValid
        if (validatedData[0]) {
          // pushes type of set, and cards
          set.push(validatedData.slice(1));
        }
      } else {
        // pushes type of set, and cards
        set.push(["not validated", combination]);
      }
    }
    return set;
  };

  getDiscardUses = async (cardsInHand, playedSetDocs, discardCards) => {
    let discardPowerSet = this.powerSet(discardCards.slice(1), true, false).map(
      set => {
        return [set[0], [...set[1], discardCards[0]]];
      }
    );

    discardPowerSet.push(["not validated", [discardCards[0]]]);

    console.log(discardPowerSet);

    const handPowerSet = this.powerSet(cardsInHand, true, false);

    const playedSets = [];

    await this.asyncForEach(playedSetDocs, async setDoc => {
      playedSets.push(await this.getSetCards(setDoc.ref));
    });

    console.log(playedSets);

    // [continued set cards, continuedSetID, cards from discard, discard to pickup]
    const rummySets = [];

    // [continued set cards, continuedSetID, hand cards, cards from discard]
    const normalSets = [];

    // try playing just discard cards (rummy)
    for (let i = 0; i < discardPowerSet.length; i += 1) {
      let discardCombination = discardPowerSet[i][1];

      let validatedDiscardData = Deck.validateSet(discardCombination);
      if (validatedDiscardData[0]) {
        const pickupDiscard = discardCards.filter(
          card => validatedDiscardData[2].indexOf(card) === -1
        );
        rummySets.push([[], undefined, validatedDiscardData[2], pickupDiscard]);
      }
      // try playing discard cards on a played set (rummy)
      for (let j = 0; j < playedSets.length; j += 1) {
        let validatedDiscardAndPlayedData = Deck.validateSet([
          ...discardCombination,
          ...playedSets[j]
        ]);
        if (
          validatedDiscardAndPlayedData[0] &&
          validatedDiscardAndPlayedData[1] === playedSetDocs[j].data().set_type
        ) {
          let discardOnly = validatedDiscardAndPlayedData[2].filter(
            card => playedSets[j].indexOf(card) === -1
          );
          const pickupDiscard = discardCards.filter(
            card => discardOnly.indexOf(card) === -1
          );
          rummySets.push([
            playedSets[j],
            playedSetDocs[j].id,
            discardOnly,
            pickupDiscard
          ]);
        }
      }
      // try playing discard cards with player cards
      for (let j = 0; j < handPowerSet.length; j += 1) {
        let handCombination = handPowerSet[j][1];
        let validatedDiscardAndHandData = Deck.validateSet([
          ...discardCombination,
          ...handCombination
        ]);
        if (validatedDiscardAndHandData[0]) {
          let discardOnly = validatedDiscardAndHandData[2].filter(
            card => handCombination.indexOf(card) === -1
          );
          normalSets.push([[], handCombination, discardOnly]);
        }

        // try playing discard cards with player cards and a played set
        for (let k = 0; k < playedSets.length; k += 1) {
          let validatedDiscardPlayedAndHandData = Deck.validateSet([
            ...discardCombination,
            ...playedSets[k],
            ...handCombination
          ]);
          if (
            validatedDiscardPlayedAndHandData[0] &&
            validatedDiscardPlayedAndHandData[1] ===
              playedSetDocs[k].data().set_type
          ) {
            let discardOnly = validatedDiscardPlayedAndHandData[2].filter(
              card =>
                handCombination.indexOf(card) === -1 &&
                playedSets[k].indexOf(card) === -1
            );
            normalSets.push([playedSets[k], handCombination, discardOnly]);
          }
        }
      }
    }
    console.log("printing possible discard uses");
    console.log(JSON.stringify(rummySets));
    console.log(JSON.stringify(normalSets));
    console.log("done");
    return [rummySets, normalSets];
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
      player2Name: userDoc.data().name,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
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
      player2NumCards: 7,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
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
        forfeiter: userRef,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
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
  pickupDiscard = async (
    userID,
    gameID,
    discardPickupIndex,
    alreadyValidated = false
  ) => {
    const userRef = (await this.getUserDoc(userID)).ref;
    const gameDoc = await this.getGameDoc(gameID);
    const playedSetDocs = await this.getPlayedSetDocs(gameDoc.ref);
    const discard = gameDoc.data().discard;
    const pickedUpCards = discard.slice(discardPickupIndex);
    const firstPickedUpCard = pickedUpCards[0];
    const handDoc = await this.getHandDocForUser(gameDoc.ref, userRef);

    const discardUses = await this.getDiscardUses(
      handDoc.data().cards,
      playedSetDocs,
      pickedUpCards
    );

    const possibleRummies = discardUses[0];
    const possibleSets = discardUses[1];

    // console.log(discardUses);
    console.log(possibleRummies);
    console.log(possibleSets);

    if (!alreadyValidated) {
      if (possibleRummies.length === 0) {
        if (!(await this.isPlayersTurn(gameDoc, userID))) {
          return "Not your turn";
        }
        if (gameDoc.data().game_state !== GAME_STATE.draw) {
          return "Cannot draw now";
        }
      } else if (gameDoc.data().game_state !== GAME_STATE.rummy) {
        console.log("rummy");
        this.createPossibleRummies(gameDoc.ref, userRef, possibleRummies);
        const gameUpdateData = {
          rummy_player: userRef,
          rummy_player_id: userRef.id,
          game_state: GAME_STATE.rummy,
          rummy_index: discardPickupIndex,
          game_revert_state: gameDoc.data().game_state,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        };
        if (possibleSets.length > 0) {
          gameUpdateData.discard_pickup_card = firstPickedUpCard;
          gameUpdateData.timestamp = admin.firestore.FieldValue.serverTimestamp();
        }
        gameDoc.ref.update(gameUpdateData);
        return "Rummy";
      } else {
        return "Other player is doing a rummy";
      }

      if (possibleSets.length === 0)
        return "Cannot use the card being picked up from discard";
    }
    const remainingDiscard = discard.slice(0, discardPickupIndex);
    gameDoc.ref.update({ discard: remainingDiscard });
    handDoc.ref.update({
      cards: [...handDoc.data().cards, ...pickedUpCards]
    });
    await this.setDiscardPickupCard(gameDoc, firstPickedUpCard);
    await gameDoc.ref.update({
      game_state: GAME_STATE.discardPlay,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ...(await this.getUpdatedCardInHandCount(
        gameDoc,
        userID,
        pickedUpCards.length
      ))
    });
    return "Success";
  };

  // TODO:
  // throw errors rather than good responses
  // check whether drawing a card while reordering hand may break game
  reorderCards = async (userID, gameID, cards) => {
    const userRef = (await this.getUserDoc(userID)).ref;
    const gameDoc = await this.getGameDoc(gameID);
    const gameRef = gameDoc.ref;
    const userHandDoc = await this.getHandDocForUser(gameRef, userRef);

    var cardValues = new Set();
    var cardSuits = new Set();
    var cardsSet = new Set();
    var fakeCard = false;
    cards.forEach(card => {
      const cardParts = card.split(" ");
      if (!Deck.isCard(card)) fakeCard = true;
      cardsSet.add(card);
      cardValues.add(cardParts[0]);
      cardSuits.add(cardParts[2]);
    });
    if (fakeCard) return "Invalid suit or value";
    if (cardsSet.size != cards.length) return "Duplicate card";
    let currentCards = userHandDoc.data().cards;
    for (let i = 0; i < cards.length; i += 1) {
      if (currentCards.indexOf(cards[i]) === -1) {
        return "Card not found in hand";
      }
    }

    await userHandDoc.ref.update({ cards: cards });
    return "Success";
  };

  // TODO:
  // throw errors rather than good responses
  playCards = async (userID, gameID, cards, continuedSetID) => {
    const userRef = (await this.getUserDoc(userID)).ref;
    const gameDoc = await this.getGameDoc(gameID);
    const gameRef = gameDoc.ref;
    const userHandDoc = await this.getHandDocForUser(gameRef, userRef);
    if (!(await this.isPlayersTurn(gameDoc, userID))) {
      return "Not your turn";
    }
    if (
      gameDoc.data().game_state !== GAME_STATE.play &&
      gameDoc.data().game_state !== GAME_STATE.discardPlay
    ) {
      return "Cannot play cards now";
    }

    if (!this.areCardsInHand(userHandDoc, cards)) {
      return "Card(s) not in your hand";
    }
    var discardPickupCard = await this.getDiscardPickupCard(gameDoc);
    if (discardPickupCard && !(cards.indexOf(discardPickupCard) !== -1)) {
      return `Must play the ${discardPickupCard} in a set before any other set`;
    }

    var potentialSet, orderedCards;
    if (continuedSetID) {
      orderedCards = Deck.orderCards(cards);
      //get all the cards in the set then validate the set
      var setDoc = await this.getSetDoc(gameRef, continuedSetID);
      const allCards = [
        ...(await this.getSetCards(setDoc.ref)),
        ...orderedCards
      ];
      potentialSet = Deck.validateSet(allCards);
    } else {
      potentialSet = Deck.validateSet(cards);
      orderedCards = potentialSet[2];
    }
    // returns a failure message here
    if (!potentialSet[0]) {
      return potentialSet[1];
    }

    // if continuing a set add to set
    if (continuedSetID) {
      console.log("here");
      await this.addToSet(userRef, orderedCards, setDoc);
    } else {
      // not continuing a set, create a new set
      await this.createSet(gameRef, userRef, orderedCards, potentialSet[1]);
    }

    if (discardPickupCard) {
      await this.setDiscardPickupCard(gameDoc, null);
      await gameRef.update({
        game_state: GAME_STATE.play,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
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
  // play rummy based off of set chosen by user
  rummy = async (userID, gameID, possibleRummyID) => {
    const userRef = (await this.getUserDoc(userID)).ref;
    const gameDoc = await this.getGameDoc(gameID);
    const gameRef = gameDoc.ref;
    if (gameDoc.data().game_state !== "rummy") {
      return "Not a time for rummy";
    }
    console.log(gameDoc.data().rummy_player.id);
    console.log(userRef.id);
    if (gameDoc.data().rummy_player.id !== userRef.id) {
      return "Other player is doing a rummy";
    }
    if (possibleRummyID) {
      const rummyDoc = await this.getPossibleRummyDoc(gameRef, possibleRummyID);
      const discardsPlay = rummyDoc.data().discards_play;
      const discardsKeep = rummyDoc.data().discards_keep;
      if (rummyDoc.data().setID !== null) {
        const setDoc = await this.getSetDoc(gameRef, rummyDoc.data().setID);
        const orderedCards = Deck.orderCards(discardsPlay);
        await this.addToSet(userRef, orderedCards, setDoc);
      } else {
        const validated = Deck.validateSet(discardsPlay);
        await this.createSet(gameRef, userRef, validated[2], validated[1]);
      }
      // no error message, was able to play cards
      // now pick up remaining discard and remove the played
      console.log("now to clean up");
      const newDiscard = gameDoc
        .data()
        .discard.filter(
          card => [...discardsKeep, ...discardsPlay].indexOf(card) === -1
        );
      await gameDoc.ref.update({
        discard: newDiscard,
        discard_pickup_card: null,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      const userHandDoc = await this.getHandDocForUser(gameRef, userRef);
      userHandDoc.ref.update({
        cards: [...userHandDoc.data().cards, ...discardsKeep]
      });
      await this.deleteCollection(gameRef.collection("possible_rummies"), 100);
      //clean up game state
      await gameRef.update({
        game_state: gameDoc.data().game_revert_state,
        game_revert_state: null,
        rummy_player: null,
        rummy_index: null,
        rummy_player_id: null,
        discard_pickup_card: null,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      return "Success";
    } else {
      await this.deleteCollection(gameRef.collection("possible_rummies"), 100);
      if (
        gameDoc.data().turn.id === userID &&
        gameDoc.data().discard_card != null
      ) {
        await this.pickupDiscard(
          userID,
          gameID,
          gameDoc.data().rummy_index,
          true
        );
        await gameDoc.ref.update({
          game_state: GAME_STATE.discardPlay,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        await gameDoc.ref.update({
          game_state: gameDoc.data().game_revert_state,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      await gameRef.update({
        game_revert_state: null,
        rummy_player: null,
        rummy_index: null,
        rummy_player_id: null,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      return "Success";
    }
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
