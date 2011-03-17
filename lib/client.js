var fs = require("fs");
var html = {
    index: fs.readFileSync(__dirname + "/templates/client.html")
};

var messagingMiddleware = require("buster-multicast/lib/server/messaging-middleware");

module.exports = {
    create: function (id) {
        var client = Object.create(this);
        client.id = id;

        var url = "clients/" + client.id;
        client.url = "/" + url;
        client.messagingMiddleware = Object.create(messagingMiddleware);
        client.messagingMiddleware.contextPath = url + "/messages"
        client.messagingMiddlewareClient = client.messagingMiddleware.createClient();

        return client;
    },

    respond: function (req, res, pathname) {
        if (req.method == "GET" && pathname == this.url) {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.write(html.index);
            res.end();
            return true;
        }

        if (this.messagingMiddleware.respond(req, res)) return true;
    }
};