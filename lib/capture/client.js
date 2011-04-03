var fs = require("fs");
var ejs = require("ejs");
var path = require("path");
var templates = {
    index: fs.readFileSync(__dirname + "/templates/client.html", "utf8"),
    buster: fs.readFileSync(__dirname + "/templates/buster.html", "utf8")
};

module.exports = {
    create: function (id, messagingMiddleware) {
        var client = Object.create(this);
        client.id = id;

        client.url = "/clients/" + client.id
        client.messagingMiddlewareClient = messagingMiddleware.createClient();
        client.messagingMiddlewareClient.url = client.url + "/messages"
        client.scripts = [];

        client.scripts.push({
            path: "/env.js",
            read: function (done) {
                done("var busterSessionEnv = " + JSON.stringify({
                    messagingUrl: client.messagingMiddlewareClient.url,
                    messagingClientId: client.messagingMiddlewareClient.clientId
                }) + ";");
            }
        });

        client.requireScript("buster-core");
        client.requireScript("buster-event-emitter");
        client.requireScript("buster-multicast/lib/client/messaging-client");
        client.requireScript("buster-multicast/lib/client/long-polling-requester");
        client.requireScript("buster-multicast/lib/client/browser/browser-compat");
        client.requireScript("buster-multicast/lib/client/browser/ajax");
        client.requireScript("buster-multicast/lib/client/browser/ajax-json");
        client.requireScript("buster-multicast/lib/client/browser/json-poller");
        client.requireScript("./client-iframe");

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
    },

    requireScript: function (requireable) {
        this.scripts.push({
            path: "/" + path.normalize(requireable) + ".js",
            read: function (done) {
                fs.readFile(require.resolve(requireable), function (err, data) {
                    if (err) throw err;
                    done(data);
                });
            }
        });
    },
};