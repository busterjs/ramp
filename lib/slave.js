var fs = require("fs");
var ejs = require("ejs");
var uuid = require("node-uuid");
var when = require("when");
var bResources = require("buster-resources");
var bResourcesResourceSet = bResources.resourceSet;

var templates = {
    capturedBrowser: fs.readFileSync(__dirname + "/templates/captured_browser.html", "utf8")
};

var frameworkScriptPaths = [
    require.resolve("./../vendor/json/json2"),
    require.resolve("buster-core"),
    require.resolve("buster-core").replace("buster-core.js", "buster-event-emitter.js"),
    require.resolve("faye/faye-browser-min"),
];
var slaveScriptPaths = [
    require.resolve("./browser/cross-browser-util"),
    require.resolve("./browser/session-loader"),
    require.resolve("./browser/session-loader-init")
];
var buster = require("buster-core");

exports.create = function (server, bayeuxServer, resourcesMiddleware, currentSession) {
    var bayeuxClient = server.bayeux;
    var ended = false;
    var bayeuxDisconnectListener;
    var bayeuxClientId;
    var headerHeight;
    var headerResourceSet;

    var id = uuid();
    var baseUrl = "/slaves/" + id;
    var url = baseUrl + "/browser"
    var headerPath = baseUrl + "/header";
    var becomesIdlePath = baseUrl + "/ready";

    var slave = buster.extend(buster.eventEmitter.create(), {
        header: function (height, resourceSet) {
            resourcesMiddleware.unmount(headerPath);

            // Unset
            if (height == undefined) return;

            // Set
            headerHeight = height;
            headerResourceSet = resourceSet;
            resourcesMiddleware.mount(headerPath, resourceSet);
        },

        startSession: function (session) {
            this.sessionInProgress = true;
            session.on("end", endSession);
            currentSession = session;
            broadcastSession();
        },

        // Note: when changing this, make sure browser/control-frame.js still
        // works. It's not currently integration tested.
        getEnv: function() {
            return {
                slaveId: id,
                bayeuxPath: server.messagingContextPath,
                capturePath: server.capturePath
            };
        },

        serialize: function () {
            return {
                id: id,
                url: url,
                becomesIdlePath: becomesIdlePath
            };
        }
    });

    Object.defineProperty(slave, "id", {
        get: function () { return id; }
    });

    Object.defineProperty(slave, "url", {
        get: function () { return url; }
    });


    bayeuxDisconnectListener = function (_bayeuxClientId) {
        if (bayeuxClientId == _bayeuxClientId) endSlave();
    };

    function broadcastSession() {
        if (currentSession !== undefined && slave.ready) {
            bayeuxClient.publish("/" + id + "/session/start", currentSession.toJSON());

            var session = currentSession;
            var readyEvent = "/" + id + "/session/" + currentSession.id + "/ready";
            var sessionReadyHandler = function () {
                slave.emit("sessionLoaded", session);
                bayeuxClient.unsubscribe(readyEvent, sessionReadyHandler);
            };
            bayeuxClient.subscribe(readyEvent, sessionReadyHandler);
        }
    }

    function endSession() {
        slave.sessionInProgress = false;
        bayeuxClient.publish("/" + id + "/session/end", {});
        currentSession = undefined;
    }

    function endSlave() {
        if (ended) return;
        ended = true;

        bayeuxServer.unbind("disconnect", bayeuxDisconnectListener);
        slave.emit("end");
    }

    function loadFileInResourceSet(path) {
        resourceSet.addFileResource(path);
        resourceSet.appendLoad(path);
    }

    var resourceSet = bResourcesResourceSet.create();
    resourceSet.addResource({
        path: "/",
        content: function () {
            var locals = {};
            locals.slaveRoot = url;
            locals.scripts = resourceSet.loadPath.paths();
            locals.hasHeaderFrame = (headerResourceSet !== undefined);
            if (locals.hasHeaderFrame) {
                locals.headerFrameHeight = headerHeight;
                locals.headerFramePath = headerPath;
            }

            return ejs.render(templates.capturedBrowser, {locals: locals});
        }
    });

    frameworkScriptPaths.forEach(loadFileInResourceSet);
    resourceSet.addResource("/env.js", {
        content: function (promise, req) {
            promise.resolve("buster.env = " + JSON.stringify(slave.getEnv()) + ";");
        }
    });
    resourceSet.appendLoad("/env.js");
    slaveScriptPaths.forEach(loadFileInResourceSet);

    // An extension is used to get the ID of the publicator
    bayeuxClient.addExtension({
        incoming: function (message, callback) {
            if (message.channel == becomesIdlePath) {
                slave.ready = true;
                bayeuxClientId = message.clientId;
                broadcastSession();
                // slave.emit("ready");
            }

            callback(message);
        }
    });
    // Subscribing so we receive the event in the extension
    bayeuxClient.subscribe(becomesIdlePath, function(){});


    bayeuxServer.bind("disconnect", bayeuxDisconnectListener);

    if (currentSession && !(currentSession.joinable == false)) {
        slave.startSession(currentSession);
    }

    resourcesMiddleware.mount(url, resourceSet);

    return slave;
};