const url = require("url");
const http = require("http");
const Deck = require("./deck");

var admin = require("firebase-admin");

var serviceAccount = require("./rummysite_creds.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://rummysite-e9ddf.firebaseio.com"
});

// var db = admin.database();
var query = admin
  .firestore()
  .collection("games")
  .limit(10);

var args = process.argv.slice(2);
const DEBUG = args.length > 0 && args[0] === "debug";

const log = message => {
  DEBUG && console.log(message);
};

// Start listening to the query.
query.onSnapshot(function(snapshot) {
  snapshot.docChanges().forEach(function(change) {
    if (change.type === "removed") {
      log("removed");
    } else {
      var game = change.doc.data();
      log("game");
      log(change.doc.id);
      game.player1.get().then(res => log(res.data().user_id));
      game.player2.get().then(res => log(res.data().user_id));
      game.deck.get().then(res => log(res.data().cards));
    }
  });
});

const getUrlArray = url => {
  var urlArray = url.split("/");
  urlArray.shift();
  urlArray = urlArray.map(el => {
    return el.split("?")[0];
  });
  return urlArray;
};

const createGameHandler = (res, userID) => {
  res.write(`createGame - userID: ${userID}`);
};
const joinGameHandler = (res, userID) => {
  res.write(`joinGame - userID: ${userID}`);
};
const pickupDeckHandler = (res, userID) => {
  res.write(`pickupDeck - userID: ${userID}`);
};
const pickupDiscardHandler = (res, userID, discardPickupIndex) => {
  res.write(
    `pickupDiscard - userID: ${userID}, discardPickupIndex: ${discardPickupIndex}`
  );
};
const playCardsHandler = (res, userID, cards, continuedSetID) => {
  res.write(
    `playCards - userID: ${userID}, cards: ${JSON.stringify(
      cards
    )}, continuedSetID: ${continuedSetID}`
  );
};
const discardHandler = (res, userID, discardCard) => {
  res.write(`discard - userID: ${userID}, discardCard: ${discardCard}`);
};
const rummyHandler = (res, userID) => {
  res.write(`rummy - userID: ${userID}`);
};

// Create a server object
const app = http.createServer(function(req, res) {
  log(req.url);
  var browserUrl = req.url;
  var urlArray = getUrlArray(browserUrl);
  log(urlArray);

  try {
    var query = url.parse(browserUrl, true).query;
    log(`query:`);
    log(query);

    var headers = req.headers;
    log(`headers:`);
    log(headers);

    var userID = headers["user_id"];
    log(`userID:`);
    log(userID);

    if (!userID) {
      throw new Error("No User ID");
    } else {
      //TODO: validate userID
    }

    res.writeHead(200, { "Content-Type": "text/html" });

    switch (urlArray[0]) {
      case "createGame":
        createGameHandler(res, userID);
        break;
      case "joinGame":
        joinGameHandler(res, userID);
        break;
      case "pickupDeck":
        pickupDeckHandler(res, userID);
        break;
      case "pickupDiscard":
        var discardPickupIndex = headers["discard_pickup_index"];
        if (!discardPickupIndex) {
          throw new Error("No discard pickup index");
        }
        pickupDiscardHandler(res, userID, discardPickupIndex);
        break;
      case "playCards":
        var cards = headers["cards"];
        var continuedSetID = headers["continued_set_id"];
        if (!cards) {
          throw new Error("No cards to play");
        }
        playCardsHandler(res, userID, cards, continuedSetID);
        break;
      case "discard":
        var discardCard = headers["discard_card"];
        if (!discardCard) {
          throw new Error("No card to discard");
        }
        discardHandler(res, userID, discardCard);
        break;
      case "rummy":
        rummyHandler(res, userID);
        break;
      default:
        res.writeHead(404, { "Content-Type": "text/html" });
        res.write("Not found");
    }
  } catch (err) {
    log(err);
    res.writeHead(404, { "Content-Type": "text/html" });
    res.write(`Malformed Request: ${err.message}`);
  }

  res.end();
});

app.listen(3000, function() {
  // The server object listens on port 3000
  console.log("Server started at: https://localhost:3000");
});
