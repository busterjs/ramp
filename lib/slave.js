var fs = require("fs");
var ejs = require("ejs");
var uuid = require("node-uuid");
var templates = {
    capturedBrowser: fs.readFileSync(__dirname + "/templates/captured_browser.html", "utf8"),
    controlFrame: fs.readFileSync(__dirname + "/templates/control_frame.html", "utf8")
};
var buster = require("buster-core");

module.exports = buster.extend(buster.eventEmitter.create(), {
    create: function (server, bayeuxServer, resourceSet, headerResourceSet, headerHeight, currentSession) {
        var slave = Object.create(this);
        slave.id = uuid();
        slave.url = "/slaves/" + slave.id
        slave.server = server;
        slave.bayeuxServer = bayeuxServer;
        slave.bayeuxClient = server.bayeux;
        slave.env = {};
        slave.resourceSet = resourceSet;
        slave.bayeuxClient.subscribe("/" + slave.id + "/ready", function (bayeuxClientId) {
            ready.call(slave, bayeuxClientId);
        });
        slave._bayeuxDisconnectListener = function (clientId) {
            if (slave.bayeuxClientId == clientId) endSlave.call(slave);
        };
        slave.bayeuxServer.bind("disconnect", slave._bayeuxDisconnectListener);

        createResourceSet.call(slave);
        if (headerResourceSet !== undefined) {
            slave.headerResourceSet= headerResourceSet;
            slave.headerHeight = headerHeight;
        }

        if (currentSession && !(currentSession.joinable == false)) {
            slave.startSession(currentSession);
        }

        return slave;
    },

    respond: function (req, res, pathname) {
        var self = this;

        if (req.method == "GET" && pathname == this.url) {
            res.writeHead(200, {"Content-Type": "text/html"});

            var locals = {slaveRoot: this.url}
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
                    slaveRoot: this.url,
                    scripts: this.resourceSet.load
                }
            }));
            res.end();
            return true;
        }
    },

    startSession: function (session) {
        var self = this;
        session.on("end", function () {
            self.endSession();
        });
        this.currentSession = session;
        broadcastSession.call(this);
    },

    endSession: function () {
        this.bayeuxClient.publish("/" + this.id + "/session/end", {});
        delete this.currentSession;
    },

    // Note: when changing this, make sure browser/control-frame.js still
    // works. It's not currently integration tested.
    getEnv: function() {
        var env = {
            slaveId: this.id,
            bayeuxPath: this.server.messagingContextPath,
            capturePath: this.server.capturePath
        };

        return buster.extend(env, this.env);
    }
});

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
    this.resourceSet.contextPath = this.url;

    this.resourceSet.addResource("/env.js", {
        content: function (promise, req) {
            promise.resolve("var buster = buster || {}; buster.env = " + JSON.stringify(self.getEnv()) + ";");
        }
    });
    this.resourceSet.load.push("/env.js");

    var scriptPaths = [
        require.resolve("./../vendor/json/json2"),
        require.resolve("buster-core"),
        require.resolve("buster-core").replace("buster-core.js", "buster-event-emitter.js"),
        require.resolve("buster-promise"),
        require.resolve("faye/faye-browser-min"),
        require.resolve("./browser/cross-frame"),
        require.resolve("./browser/control-frame"),
        require.resolve("./browser/control-frame-load")
    ];

    for (var i = 0, ii = scriptPaths.length; i < ii; i++) {
        var path = scriptPaths[i];
        this.resourceSet.load.push(path);
        this.resourceSet.addFile(path);
    }
}

function endSlave() {
    if (this._ended) return;
    this._ended = true;

    this.bayeuxServer.unbind("disconnect", this._bayeuxDisconnectListener);
    this.emit("end");
}