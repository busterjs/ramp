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
    var isReady;
    var bayeuxClientId;
    var headerHeight;
    var headerResourceSet;
    var headerPath;

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
            var env = {
                slaveId: this.id,
                bayeuxPath: server.messagingContextPath,
                capturePath: server.capturePath
            };

            return buster.extend(env, this.env);
        },

        serialize: function () {
            return {
                id: this.id,
                url: this.url
            };
        }
    });

    slave.id = uuid();
    var baseUrl = "/slaves/" + slave.id;
    slave.url = baseUrl + "/browser"
    slave.env = {};

    headerPath = baseUrl + "/header";
    bayeuxDisconnectListener = function (_bayeuxClientId) {
        if (bayeuxClientId == _bayeuxClientId) endSlave();
    };

    function ready(_bayeuxClientId) {
        isReady = true;
        bayeuxClientId = _bayeuxClientId;
        broadcastSession();
        slave.emit("ready");
    }

    function broadcastSession() {
        if (currentSession !== undefined && isReady) {
            bayeuxClient.publish("/" + slave.id + "/session/start", currentSession.toJSON());

            var session = currentSession;
            var readyEvent = "/" + slave.id + "/session/" + currentSession.id + "/ready";
            var sessionReadyHandler = function () {
                slave.emit("sessionLoaded", session);
                bayeuxClient.unsubscribe(readyEvent, sessionReadyHandler);
            };
            bayeuxClient.subscribe(readyEvent, sessionReadyHandler);
        }
    }

    function endSession() {
        slave.sessionInProgress = false;
        bayeuxClient.publish("/" + slave.id + "/session/end", {});
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
            locals.slaveRoot = this.url;
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

    bayeuxClient.subscribe("/" + slave.id + "/ready", ready);
    bayeuxServer.bind("disconnect", bayeuxDisconnectListener);

    if (currentSession && !(currentSession.joinable == false)) {
        slave.startSession(currentSession);
    }

    resourcesMiddleware.mount(slave.url, resourceSet);

    return slave;
};