var fs = require("fs");
var ejs = require("ejs");
var scriptServingMiddleware = require("./../script-serving-middleware");
var templates = {
    capturedBrowser: fs.readFileSync(__dirname + "/../templates/captured_browser.html", "utf8"),
    controlFrame: fs.readFileSync(__dirname + "/../templates/control_frame.html", "utf8")
};

module.exports = {
    create: function (id, multicastMiddleware) {
        var client = Object.create(this);
        client.id = id;

        client.url = "/clients/" + client.id
        // Note: when changing this, make sure browser/captured-client.js still
        // works. It's not currently integration tested.
        client.env = {
            clientId: client.id,
            multicastUrl: multicastMiddleware.contextPath + "/"
        };

        return client;
    },

    respond: function (req, res, pathname) {
        if (this.scriptServingMiddleware.respond(req, res)) return true;

        if (req.method == "GET" && pathname == this.url) {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.write(ejs.render(templates.capturedBrowser, {
                locals: {
                    clientRoot: this.url
                }
            }));
            res.end();
            return true;
        }

        if (req.method == "GET" && pathname == this.url + "/control_frame.html") {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.write(ejs.render(templates.controlFrame, {
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
        this.currentSession = session;
        this.broadcastSession();
    },

    endSession: function () {
        this.multicast.emitToClient(this.multicast.clientId, "session:end");
    },

    attachMulticast: function (multicast) {
        this.multicast = multicast;
        this.broadcastSession();
    },

    broadcastSession: function () {
        if ("multicast" in this && "currentSession" in this) {
            this.multicast.emitToClient(this.multicast.clientId, "session:start", this.currentSession);
        }
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
        middleware.requireFile(require.resolve("json/json2.js")); // For old browsers
        middleware.requireFile(require.resolve("buster-core"));
        middleware.requireFile(require.resolve("buster-event-emitter"));
        middleware.requireFile(require.resolve("buster-promise"));
        middleware.requireFile(require.resolve("buster-multicast/lib/client/multicast-client"));
        middleware.requireFile(require.resolve("buster-multicast/lib/client/long-polling-requester"));
        middleware.requireFile(require.resolve("buster-multicast/lib/client/browser/browser-compat"));
        middleware.requireFile(require.resolve("buster-multicast/lib/client/browser/ajax"));
        middleware.requireFile(require.resolve("buster-multicast/lib/client/browser/ajax-json"));
        middleware.requireFile(require.resolve("buster-multicast/lib/client/browser/json-poller"));
        middleware.requireFile(require.resolve("./../browser/cross-frame"));
        middleware.requireFile(require.resolve("./../browser/control-frame"));
        middleware.requireFile(require.resolve("./../browser/control-frame-load"));
 

        return this._scriptServingMiddleware = middleware;
    }
};