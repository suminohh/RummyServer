const url = require("url");
const http = require("http");

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

// Create a server object
const app = http.createServer(function(req, res) {
  log(req.url);
  log(req.headers);
  var browserUrl = req.url;
  var urlArray = getUrlArray(browserUrl);
  log(urlArray);

  try {
    var query;
    query = url.parse(browserUrl, true).query;
    log(`query:`);
    log(query);
    res.writeHead(200, { "Content-Type": "text/html" });

    switch (urlArray[0]) {
      case "createGame":
        res.write(`done`);
        break;
      case "joinGame":
        res.write(`done`);
        break;
      case "pickupDeck":
        res.write(`done`);
        break;
      case "pickupDiscard":
        res.write(`done`);
        break;
      case "playCard":
        res.write(`done`);
        break;
      case "discard":
        res.write(`done`);
        break;
      case "rummy":
        res.write(`done`);
        break;
      default:
        res.writeHead(404, { "Content-Type": "text/html" });
        res.write("Not found");
    }
  } catch (err) {
    res.writeHead(404, { "Content-Type": "text/html" });
    res.write("Malformed Request");
  }

  res.end();
});

app.listen(3000, function() {
  // The server object listens on port 3000
  console.log("Server started at: https://localhost:3000");
});
