var fs = require("fs");
var ejs = require("ejs");
var uuid = require("node-uuid");
var templates = {
    capturedBrowser: fs.readFileSync(__dirname + "/../templates/captured_browser.html", "utf8"),
    controlFrame: fs.readFileSync(__dirname + "/../templates/control_frame.html", "utf8")
};

module.exports = {
    create: function (server, resourceMiddleware, headerResourceSet, headerHeight) {
        var client = Object.create(this);
        client.id = uuid();

        client.url = "/clients/" + client.id
        // Note: when changing this, make sure browser/control-frame.js still
        // works. It's not currently integration tested.
        client.env = {
            clientId: client.id,
            bayeuxUrl: server.bayeuxClientUrl
        };

        client.bayeuxClient = server.bayeux;
        client.bayeuxClient.subscribe("/" + client.id + "/ready", function () {
            client.ready();
        });
        client.createResourceSet(resourceMiddleware);
        if (headerResourceSet !== undefined) {
            client.headerResourceSet= headerResourceSet;
            client.headerHeight = headerHeight;
        }

        return client;
    },

    respond: function (req, res, pathname) {
        var self = this;

        if (req.method == "GET" && pathname == this.url) {
            res.writeHead(200, {"Content-Type": "text/html"});

            var locals = {clientRoot: this.url}
            locals.hasHeaderFrame = ("headerResourceSet" in this);
            if (locals.hasHeaderFrame) {
                locals.headerFrameHeight = this.headerHeight;
                locals.headerFrameUrl = this.headerResourceSet.contextPath + "/";
            }

            res.write(ejs.render(templates.capturedBrowser, {locals: locals}));
            res.end();
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

    ready: function () {
        this.isReady = true;
        this.broadcastSession();
    },

    startSession: function (session) {
        this.currentSession = session;
        this.broadcastSession();
    },

    endSession: function () {
        this.bayeuxClient.publish("/" + this.id + "/session/end", {});
        delete this.currentSession;
    },

    broadcastSession: function () {
        if (("currentSession" in this) && this.isReady) {
            this.bayeuxClient.publish("/" + this.id + "/session/start", this.currentSession.toJSON());
        }
    },

    // TODO: add test coverage here.
    createResourceSet: function (resourceMiddleware) {
        var self =  this;
        var resourceSet = resourceMiddleware.busterResources.createResourceSet({
            contextPath: this.url
        });
        this.resourceSet = resourceSet;

        resourceSet.addResource("/env.js", {
            content: function (promise) {
                promise.resolve("var buster = buster || {}; buster.env = " + JSON.stringify(self.env) + ";");
            }
        });
        resourceSet.load.push("/env.js");

        var scriptPaths = [
            require.resolve("./../../vendor/json/json2"),
            require.resolve("buster-core"),
            require.resolve("buster-core").replace("buster-core.js", "buster-event-emitter.js"),
            require.resolve("buster-promise"),
            require.resolve("faye/faye-browser-min"),
            require.resolve("./../browser/cross-frame"),
            require.resolve("./../browser/control-frame"),
            require.resolve("./../browser/control-frame-load")
        ];

        for (var i = 0, ii = scriptPaths.length; i < ii; i++) {
            var path = scriptPaths[i];
            resourceSet.load.push(path);
            resourceSet.addFile(path);
        }
    }
};