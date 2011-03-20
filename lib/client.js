var fs = require("fs");
var html = {
    index: fs.readFileSync(__dirname + "/templates/client.html"),
    buster: fs.readFileSync(__dirname + "/templates/buster.html")
};

module.exports = {
    create: function (id, messagingMiddleware) {
        var client = Object.create(this);
        client.id = id;

        client.url = "/clients/" + client.id
        client.messagingMiddlewareClient = messagingMiddleware.createClient();
        client.messagingMiddlewareClient.url = client.url + "/messages"

        return client;
    },

    respond: function (req, res, pathname) {
        if (req.method == "GET" && pathname == this.url) {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.write(html.index);
            res.end();
            return true;
        }

        if (req.method == "GET" && pathname == this.url + "/buster.html") {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.write(html.buster);
            res.end();
            return true;
        }

        if (req.method == "GET" && pathname == this.url + "/env.js") {
            res.writeHead(200, {"Content-Type": "text/javascript"});
            res.write("var buster = " + JSON.stringify({
                messagingUrl: this.messagingMiddlewareClient.url
            }) + ";");
            res.end();
            return true;
        }
    }
};