/*
 *
 * Run with node examples/simple.js
 *
 * Go to http://localhost:8282 and have fun!
 *
 */

var busterServer = require("../lib/buster-capture-server");
var http = require("http");
var fs = require("fs");


var bs = Object.create(busterServer);
bs.captureMiddleware.oncapture = function (req, res, client) {
    res.writeHead(301, {"Location": client.url});
    res.end();
};
var sess = bs.createSession({
    load: ["/test.js"],
    resources: {
        "/test.js": {
            content: fs.readFileSync(__dirname + "/simple-browser.js", "utf8")
        }
    }
});

http.createServer(function (req, res) {
    if (bs.respond(req, res)) return;

    if (req.method == "GET" && req.url == "/") {
        res.writeHead(200, {"Content-Type": "text/html"});
        res.write('<form method="POST" action="/capture"><input type="submit" value="Capture"></form>');
        res.end();
        return;
    }

    res.writeHead(404);
    res.end();
}).listen(8282);
