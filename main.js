const cities = require("cities");
const url = require("url");
const http = require("http");

// Create a server object
const app = http.createServer(function(req, res) {
  // http header
  res.writeHead(200, { "Content-Type": "text/html" });

  var browserUrl = req.url;
  var urlArray = browserUrl.split("/");
  urlArray.shift();
  urlArray = urlArray.map(el => {
    return el.split("?")[0];
  });
  console.log(urlArray);

  if (urlArray[0] === "about") {
    res.write(" Welcome to about us page");
    res.end();
  } else if (urlArray[0] === "contact") {
    res.write(" Welcome to contact us page");
    res.end();
  } else if (urlArray[0] === "cities") {
    var city, query;
    query = url.parse(browserUrl, true).query;
    console.log(query);
    if (query.zipCode) city = cities.zip_lookup(query.zipCode).city;
    else city = "not found";
    res.writeHead(200, { "Content-Type": "text/html" });
    res.write(`&lt;h1&gt;The city you are in is ${city}.&lt;/h1&gt;`);
    res.end();
  } else {
    res.write("Hello World!");
    res.end();
  }
});

app.listen(3000, function() {
  // The server object listens on port 3000
  console.log("Server started at: https://localhost:3000");
});
