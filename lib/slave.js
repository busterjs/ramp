var fs = require("fs");
var ejs = require("ejs");
var uuid = require("node-uuid");
var templates = {
    capturedBrowser: fs.readFileSync(__dirname + "/templates/captured_browser.html", "utf8"),
    controlFrame: fs.readFileSync(__dirname + "/templates/control_frame.html", "utf8")
};
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
var buster = require("buster-core");

exports.create = function (server, bayeuxServer, resourceSet, headerResourceSet, headerHeight, currentSession) {
    var bayeuxClient = server.bayeux;
    var ended = false;
    var bayeuxDisconnectListener;
    var isReady;
    var bayeuxClientId;

    var slave = buster.extend(buster.eventEmitter.create(), {
        respond: function (req, res, pathname) {
            if (req.method == "GET" && pathname == this.url) {
                res.writeHead(200, {"Content-Type": "text/html"});

                var locals = {slaveRoot: this.url}
                locals.hasHeaderFrame = (headerResourceSet !== undefined);
                if (locals.hasHeaderFrame) {
                    locals.headerFrameHeight = headerHeight;
                    locals.headerFrameUrl = headerResourceSet.contextPath + "/";
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
            this.sessionInProgress = true;
            session.on("end", this.endSession.bind(this));
            currentSession = session;
            broadcastSession();
        },

        endSession: function () {
            this.sessionInProgress = false;
            bayeuxClient.publish("/" + this.id + "/session/end", {});
            currentSession = undefined;
        },

        // Note: when changing this, make sure browser/control-frame.js still
        // works. It's not currently integration tested.
        getEnv: function() {
            var env = {
                slaveId: this.id,
                bayeuxPath: server.messagingContextPath,
                capturePath: server.capturePath
            };

            return buster.extend(env, this.env);
        }
    });

    slave.id = uuid();
    slave.url = "/slaves/" + slave.id
    slave.env = {};
    slave.resourceSet = resourceSet;
    bayeuxDisconnectListener = function (_bayeuxClientId) {
        if (bayeuxClientId == _bayeuxClientId) endSlave();
    };

    function ready(_bayeuxClientId) {
        isReady = true;
        bayeuxClientId = _bayeuxClientId;
        broadcastSession();
    }

    function broadcastSession() {
        if (currentSession !== undefined && isReady) {
            bayeuxClient.publish("/" + slave.id + "/session/start", currentSession.toJSON());
        }
    }

    function endSlave() {
        if (ended) return;
        ended = true;
        
        bayeuxServer.unbind("disconnect", bayeuxDisconnectListener);
        slave.emit("end");
    }

    slave.resourceSet.contextPath = slave.url;
    slave.resourceSet.addResource("/env.js", {
        content: function (promise, req) {
            promise.resolve("var buster = buster || {}; buster.env = " + JSON.stringify(slave.getEnv()) + ";");
        }
    });
    slave.resourceSet.load.push("/env.js");
    scriptPaths.forEach(function (path) {
        slave.resourceSet.load.push(path);
        slave.resourceSet.addFile(path);
    });

    bayeuxClient.subscribe("/" + slave.id + "/ready", ready);
    bayeuxServer.bind("disconnect", bayeuxDisconnectListener);

    if (currentSession && !(currentSession.joinable == false)) {
        slave.startSession(currentSession);
    }

    return slave;
};