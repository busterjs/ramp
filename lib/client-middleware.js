var URL = require("url");
var fs = require("fs");

var html = {
    index: fs.readFileSync(__dirname + "/templates/index.html")
};

module.exports = {
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
    },

    serveIndexPage: function (res) {
        res.writeHead(200, {"Content-Type": "text/html"})
        res.write(html.index);
        res.end();
    },

    createClient: function (res) {
        if (typeof(this.clientId) != "number") this.clientId = 0;

        res.writeHead(201, {"Location": "/clients/" + ++this.clientId});
        res.end();
    }
};