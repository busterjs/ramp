var URL = require("url");
var fs = require("fs");

var busterClient = require("./client");
var messagingMiddleware = require("buster-multicast/lib/server/messaging-middleware");
var html = {
    index: fs.readFileSync(__dirname + "/templates/index.html")
};

module.exports = {
    create: function () {
        var clientMiddleware = Object.create(this);
        clientMiddleware.messagingMiddleware = Object.create(messagingMiddleware);

        return clientMiddleware;
    },

    respond: function (req, res) {
        var url = URL.parse(req.url);

        if (req.method == "GET" && url.pathname == "/") {
            this.serveIndexPage(res);
            return true;
        }

        if (req.method == "POST" && url.pathname == "/capture") {
            this.createClient(res);
            return true;
        }

        if (!this.clients) return false;
        for (var i = 0, ii = this.clients.length; i < ii; i++) {
            if (this.clients[i].respond(req, res, url.pathname)) return true;
        }

        if (this.messagingMiddleware.respond(req, res)) return true;
    },

    serveIndexPage: function (res) {
        res.writeHead(200, {"Content-Type": "text/html"})
        res.write(html.index);
        res.end();
    },

    createClient: function (res) {
        if (typeof(this.clientId) != "number") this.clientId = 0;
        if (!this.clients) this.clients = [];

        var client = busterClient.create(++this.clientId, this.messagingMiddleware);
        this.clients.push(client);

        res.writeHead(302, {"Location": client.url});
        res.write(JSON.stringify({
            messagingUrl: client.messagingMiddlewareClient.url
        }));
        res.end();
    }
};