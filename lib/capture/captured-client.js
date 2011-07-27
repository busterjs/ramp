var fs = require("fs");
var ejs = require("ejs");
var uuid = require("node-uuid");
var templates = {
    capturedBrowser: fs.readFileSync(__dirname + "/../templates/captured_browser.html", "utf8"),
    controlFrame: fs.readFileSync(__dirname + "/../templates/control_frame.html", "utf8")
};

module.exports = {
    create: function (multicastMiddleware, resourceMiddleware) {
        var client = Object.create(this);
        client.id = uuid();

        client.url = "/clients/" + client.id
        client.createMulticastUrl = client.url + "/createMulticast";
        // Note: when changing this, make sure browser/control-frame.js still
        // works. It's not currently integration tested.
        client.env = {
            clientId: client.id,
            multicastUrl: client.createMulticastUrl
        };

        client.createResourceSet(resourceMiddleware);
        client.multicastMiddleware = multicastMiddleware;

        return client;
    },

    respond: function (req, res, pathname) {
        var self = this;

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

        if (req.method == "POST" && pathname == this.createMulticastUrl) {
            this.multicastMiddleware.createClientFromRequest(req, res, function (multicastClient) {
                self.attachMulticast(multicastClient);
            });
            return true;
        }

        if (req.method == "GET" && pathname == this.url + "/control_frame.html") {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.write(ejs.render(templates.controlFrame, {
                locals: {
                    clientRoot: this.url,
                    scripts: this.resourceSet.load
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

    createResourceSet: function (resourceMiddleware) {
        var self =  this;
        var resourceSet = resourceMiddleware.createResourceSet({
            contextPath: this.url
        });
        this.resourceSet = resourceSet;

        var scriptPaths = [
            require.resolve("json/json2.js"),
            require.resolve("buster-core"),
            require.resolve("buster-core").replace("buster-core.js", "buster-event-emitter.js"),
            require.resolve("buster-promise"),
            require.resolve("buster-multicast/lib/client/multicast-client"),
            require.resolve("buster-multicast/lib/client/long-polling-requester"),
            require.resolve("buster-multicast/lib/client/browser/browser-compat"),
            require.resolve("buster-multicast/lib/client/browser/ajax"),
            require.resolve("buster-multicast/lib/client/browser/ajax-json"),
            require.resolve("buster-multicast/lib/client/browser/json-poller"),
            require.resolve("./../browser/cross-frame"),
            require.resolve("./../browser/control-frame"),
            require.resolve("./../browser/control-frame-load")
        ];

        for (var i = 0, ii = scriptPaths.length; i < ii; i++) {
            var path = scriptPaths[i];
            resourceSet.load.push(path);
            resourceSet.addFile(path);
        }

        resourceSet.addResource("/env.js", {
            content: function (promise) {
                promise.resolve("var buster = buster || {}; buster.env = " + JSON.stringify(self.env) + ";");
            }
        });
    }
};