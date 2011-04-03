var fs = require("fs");
var ejs = require("ejs");
var templates = {
    index: fs.readFileSync(__dirname + "/templates/client.html", "utf8"),
    buster: fs.readFileSync(__dirname + "/templates/buster.html", "utf8")
};

module.exports = {
    scripts: [
        {
            pathname: "/client-iframe.js",
            file: __dirname + "/client-iframe.js"
        }
    ],

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
            res.write(ejs.render(templates.index, {
                locals: {
                    clientRoot: this.url
                }
            }));
            res.end();
            return true;
        }

        if (req.method == "GET" && pathname == this.url + "/buster.html") {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.write(ejs.render(templates.buster, {
                locals: {
                    clientRoot: this.url,
                    scripts: this.scripts
                }
            }));
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

        for (var i = 0, ii = this.scripts.length; i < ii; i++) {
            var script = this.scripts[i];
            if (req.method == "GET" && pathname == (this.url + script.path)) {
                res.writeHead(200, {"Content-Type": "text/javascript"});
                script.read(function (data) {
                    res.write(data);
                    res.end();
                });
                return true;
            }
        }
    }
};