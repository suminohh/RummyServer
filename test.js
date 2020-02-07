const RummyDatabase = require("./rummyDatabase");

module.exports = class Test {
  gameID = "oOVUkVzH6yatiH7pQ7RS"; // may break if game is deleted from games collection
  player1ID = "hZMMwESSYVrmRieHFCKO"; // may break if user is deleted from users collection
  player2ID = "mOxzCgLN55kEJOtGxSqd"; // may break if user is deleted from users collection

  testUpdateGame = () => {
    var rd = new RummyDatabase();

    var game = rd.getGameRef(this.gameID);

    game.get().then(docresp => {
      var game = docresp.data();
      console.log("game:");
      game.player1.get().then(res => console.log(res.data().user_id));
      game.player2.get().then(res => console.log(res.data().user_id));
      game.deck.get().then(res => console.log(res.data().cards));
    });

    var p1 = rd.getUserRef(this.player1ID);
    var p2 = rd.getUserRef(this.player2ID);

    game.update("player2", p2);
    game.update("player1", p1);

    game.get().then(docresp => {
      var game = docresp.data();
      console.log("game:");
      game.player1.get().then(res => console.log(res.data().user_id));
      game.player2.get().then(res => console.log(res.data().user_id));
      game.deck.get().then(res => console.log(res.data().cards));
    });
  };

  testCreateAndJoinGame = () => {
    var rd = new RummyDatabase();
    rd.createGame(this.player1ID).then(gameID => {
      rd.joinGame(this.player2ID, gameID).then(message => {
        console.log(message);
      });
    });
  };

  testCreateGame = () => {
    var rd = new RummyDatabase();
    rd.createGame(this.player1ID);
  };

  testAddSet = () => {
    var rd = new RummyDatabase();
    var gameref = rd.getGameRef(this.gameID);
    gameref.get().then(gameresp => {
      var userRef = gameresp.data().player1;
      gameref
        .collection("sets")
        .add({
          cards: ["King of Spades", "King of Clubs", "King of Hearts"],
          player: userRef,
          continued_from: null
        })
        .then(setref => {
          gameref.collection("sets").add({
            cards: ["King of Diamonds"],
            player: userRef,
            continued_from: setref
          });
        });
    });
  };

  testJoinGame = () => {
    var rd = new RummyDatabase();
    rd.joinGame(this.player2ID, this.gameID);
  };
};
