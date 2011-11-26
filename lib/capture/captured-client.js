var fs = require("fs");
var ejs = require("ejs");
var uuid = require("node-uuid");
var templates = {
    capturedBrowser: fs.readFileSync(__dirname + "/../templates/captured_browser.html", "utf8"),
    controlFrame: fs.readFileSync(__dirname + "/../templates/control_frame.html", "utf8")
};
var buster = require("buster-core");

module.exports = {
    create: function (server, busterResources, headerResourceSet, headerHeight) {
        var client = Object.create(this);
        client.id = uuid();
        client.url = "/clients/" + client.id
        client.server = server;
        client.bayeuxClient = server.bayeux;
        client.env = {};
        client.busterResources = busterResources;
        client.bayeuxClient.subscribe("/" + client.id + "/ready", function (bayeuxClientId) {
            ready.call(client, bayeuxClientId);
        });

        createResourceSet.call(client);
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

    startSession: function (session) {
        this.currentSession = session;
        broadcastSession.call(this);
    },

    endSession: function () {
        this.bayeuxClient.publish("/" + this.id + "/session/end", {});
        delete this.currentSession;
    },

    destroy: function () {
        this.busterResources.removeResourceSet(this.resourceSet);
    }
};

function ready(bayeuxClientId) {
    this.isReady = true;
    this.bayeuxClientId = bayeuxClientId;
    broadcastSession.call(this);
}

function broadcastSession() {
    if (("currentSession" in this) && this.isReady) {
        this.bayeuxClient.publish("/" + this.id + "/session/start", this.currentSession.toJSON());
    }
}

// TODO: add test coverage here.
function createResourceSet() {
    var self =  this;
    var resourceSet = this.busterResources.createResourceSet({
        contextPath: this.url
    });
    this.resourceSet = resourceSet;

    resourceSet.addResource("/env.js", {
        content: function (promise, req) {
            promise.resolve("var buster = buster || {}; buster.env = " + getEnv.call(self) + ";");
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

// Note: when changing this, make sure browser/control-frame.js still
// works. It's not currently integration tested.
function getEnv() {
    var env = {
        clientId: this.id,
        bayeuxPath: this.server.messagingContextPath,
        capturePath: this.server.capturePath
    };

    return JSON.stringify(buster.extend(env, this.env));
}