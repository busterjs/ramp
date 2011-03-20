var fs = require("fs");
var html = {
    index: fs.readFileSync(__dirname + "/templates/client.html")
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
    }
};