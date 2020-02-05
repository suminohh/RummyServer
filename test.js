const RummyDatabase = require("./rummyDatabase");

module.exports = class Test {
  testUpdateGame = () => {
    var rd = new RummyDatabase();

    var game = rd.getGameRef("9yCQ5VklFNt7E9Sy28k1");

    game.get().then(docresp => {
      var game = docresp.data();
      console.log("game:");
      game.player1.get().then(res => console.log(res.data().user_id));
      game.player2.get().then(res => console.log(res.data().user_id));
      game.deck.get().then(res => console.log(res.data().cards));
    });

    var p1 = rd.getUserRef("hZMMwESSYVrmRieHFCKO");
    var p2 = rd.getUserRef("mOxzCgLN55kEJOtGxSqd");

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

  testCreateDeck = () => {
    var rd = new RummyDatabase();
    const deckprom = rd.createDeck();
    deckprom.then(deckref => {
      deckref.get().then(docresp => {
        var deck = docresp.data();
        console.log("deck:");
        console.log(deckref.id);
        console.log(deck.cards);
        console.log(deck.cards_used);
      });
    });
  };
};
