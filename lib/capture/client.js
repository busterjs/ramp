var fs = require("fs");
var ejs = require("ejs");
var scriptServingMiddleware = require("./../script-serving-middleware");
var templates = {
    index: fs.readFileSync(__dirname + "/templates/client.html", "utf8"),
    buster: fs.readFileSync(__dirname + "/templates/buster.html", "utf8")
};

module.exports = {
    create: function (id, multicastMiddleware) {
        var client = Object.create(this);
        client.id = id;

        client.url = "/clients/" + client.id
        client.multicast = multicastMiddleware.createClient();
        client.multicast.url = client.url + "/messages"
        // Note: when changing this, make sure browser/captured-client.js still
        // works. It's not currently integration tested.
        client.env = {
            multicastUrl: client.multicast.url,
            multicastClientId: client.multicast.clientId
        };

        return client;
    },

    respond: function (req, res, pathname) {
        if (this.scriptServingMiddleware.respond(req, res)) return true;

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
                    scripts: this.scriptServingMiddleware.scripts
                }
            }));
            res.end();
            return true;
        }
    },

    startSession: function (session) {
        this.multicast.emit("session:start", session);
    },

    endSession: function () {
        this.multicast.emit("session:end");
    },

    get scriptServingMiddleware() {
        return this._scriptServingMiddleware || this.createScriptServingMiddleware();
    },

    createScriptServingMiddleware: function () {
        var self = this;
        var middleware = Object.create(scriptServingMiddleware);
        middleware.contextPath = this.url;
        middleware.scripts.push({
            path: "/env.js",
            read: function (done) {
                done("var buster = buster || {}; buster.env = " + JSON.stringify(self.env) + ";");
            }
        });
        middleware.requireFile(require.resolve("buster-core"));
        middleware.requireFile(require.resolve("buster-event-emitter"));
        middleware.requireFile(require.resolve("buster-multicast/lib/client/multicast-client"));
        middleware.requireFile(require.resolve("buster-multicast/lib/client/long-polling-requester"));
        middleware.requireFile(require.resolve("buster-multicast/lib/client/browser/browser-compat"));
        middleware.requireFile(require.resolve("buster-multicast/lib/client/browser/ajax"));
        middleware.requireFile(require.resolve("buster-multicast/lib/client/browser/ajax-json"));
        middleware.requireFile(require.resolve("buster-multicast/lib/client/browser/json-poller"));
        middleware.requireFile(require.resolve("./browser/cross-frame"));
        middleware.requireFile(require.resolve("./browser/captured-client"));
        middleware.requireFile(require.resolve("./browser/frame"));
        middleware.requireFile(require.resolve("json/json2.js")); // For old browsers

        return this._scriptServingMiddleware = middleware;
    }
};