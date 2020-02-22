const express = require("express");
var cors = require("cors");
const RummyDatabase = require("./rummyDatabase");

var rd = new RummyDatabase();

var args = process.argv.slice(2);
const DEBUG = args.length > 0 && args[0] === "debug";

const log = message => {
  DEBUG && console.log(message);
};

const getUrlArray = url => {
  var urlArray = url.split("/");
  urlArray.shift();
  urlArray = urlArray.map(el => {
    return el.split("?")[0];
  });
  return urlArray;
};

const createUserHandler = (res, userID, name) => {
  rd.createUser(userID, name).then(message => {
    res.write(message);
    res.end();
  });
};
const createGameHandler = (res, userID) => {
  rd.createGame(userID).then(gameID => {
    res.write(gameID);
    res.end();
  });
};
const joinGameHandler = (res, userID, gameID) => {
  rd.joinGame(userID, gameID).then(message => {
    res.write(message);
    res.end();
  });
};
const pickupDeckHandler = (res, userID, gameID) => {
  rd.pickupDeck(userID, gameID).then(message => {
    res.write(message);
    res.end();
  });
};
const pickupDiscardHandler = (res, userID, gameID, discardPickupIndex) => {
  rd.pickupDiscard(userID, gameID, discardPickupIndex).then(message => {
    res.write(message);
    res.end();
  });
};
const playCardsHandler = (res, userID, gameID, cards, continuedSetID) => {
  rd.playCards(userID, gameID, cards, continuedSetID).then(message => {
    res.write(message);
    res.end();
  });
};
const discardHandler = (res, userID, gameID, discardCard) => {
  rd.discard(userID, gameID, discardCard).then(message => {
    res.write(message);
    res.end();
  });
};

const rummyHandler = (res, userID) => {
  res.write(`rummy - userID: ${userID}`);
  res.end();
};

const getUserID = async headers => {
  var IDToken = headers["id_token"];
  var userID = null;

  if (!IDToken) {
    throw new Error("No User ID Token");
  } else {
    userID = await rd.verifyUser(IDToken);
    if (!userID) throw new Error("User doesn't exist");
  }
  return userID;
};

const getName = headers => {
  var name = headers["name"];
  if (!name) {
    throw new Error("No Name");
  }
  return name;
};

const getGameID = headers => {
  var gameID = headers["game_id"];
  if (!gameID) {
    throw new Error("No game ID");
  }
  return gameID;
};

const getDiscardPickupIndex = headers => {
  var discardPickupIndex = headers["discard_pickup_index"];
  if (!discardPickupIndex) {
    throw new Error("No discard pickup index");
  }
  return discardPickupIndex;
};

const getCards = headers => {
  var cards = headers["cards"];
  if (!cards || cards.length < 1) {
    throw new Error("No cards to play");
  }
  return JSON.parse(cards);
};

const getContinuedSetID = headers => {
  return headers["continued_set_id"];
};

const getDiscardCard = headers => {
  var discardCard = headers["discard_card"];
  if (!discardCard) {
    throw new Error("No card to discard");
  }
  return discardCard;
};

const app = express();
app.use(cors());
const port = 3001;

app.post("/signUp", async (req, res) => {
  getUserID(req.headers)
    .then(userID => {
      const name = getName(req.headers);
      res.status(200);
      createUserHandler(res, userID, name);
    })
    .catch(err => {
      res.status(400);
      res.send(err);
    });
});

app.post("/createGame", async (req, res) => {
  getUserID(req.headers)
    .then(userID => {
      res.status(200);
      createGameHandler(res, userID);
    })
    .catch(err => {
      res.status(400);
      res.send(err);
    });
});

app.post("/joinGame", async (req, res) => {
  getUserID(req.headers)
    .then(userID => {
      try {
        const gameID = getGameID(req.headers);
        res.status(200);
        joinGameHandler(res, userID, gameID);
      } catch (err) {
        res.status(400);
        res.send(err);
      }
    })
    .catch(err => {
      res.status(400);
      res.send(err);
    });
});

app.post("/pickupDeck", async (req, res) => {
  getUserID(req.headers)
    .then(userID => {
      try {
        const gameID = getGameID(req.headers);
        res.status(200);
        pickupDeckHandler(res, userID, gameID);
      } catch (err) {
        res.status(400);
        res.send(err);
      }
    })
    .catch(err => {
      res.status(400);
      res.send(err);
    });
});

app.post("/pickupDiscard", async (req, res) => {
  getUserID(req.headers)
    .then(userID => {
      try {
        const gameID = getGameID(req.headers);
        const discardPickupIndex = getDiscardPickupIndex(req.headers);
        res.status(200);
        pickupDiscardHandler(res, userID, gameID, discardPickupIndex);
      } catch (err) {
        res.status(400);
        res.send(err);
      }
    })
    .catch(err => {
      res.status(400);
      res.send(err);
    });
});

app.post("/playCards", async (req, res) => {
  getUserID(req.headers)
    .then(userID => {
      try {
        const gameID = getGameID(req.headers);
        const cards = getCards(req.headers);
        const continuedSetID = getContinuedSetID(req.headers);
        res.status(200);
        playCardsHandler(res, userID, gameID, cards, continuedSetID);
      } catch (err) {
        res.status(400);
        res.send(err);
      }
    })
    .catch(err => {
      res.status(400);
      res.send(err);
    });
});

app.post("/discard", async (req, res) => {
  getUserID(req.headers)
    .then(userID => {
      try {
        const gameID = getGameID(req.headers);
        const discardCard = getDiscardCard(req.headers);
        res.status(200);
        discardHandler(res, userID, gameID, discardCard);
      } catch (err) {
        res.status(400);
        res.send(err);
      }
    })
    .catch(err => {
      res.status(400);
      res.send(err);
    });
});

app.listen(port, () =>
  console.log(`Server started at: http://localhost:${port}`)
);
