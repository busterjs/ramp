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
    require.resolve("buster-faye/faye-browser-min")
];
var slaveScriptPaths = [
    require.resolve("./browser/cross-browser-util"),
    require.resolve("./browser/session-loader"),
    require.resolve("./browser/session-loader-init")
];
var buster = require("buster-core");

exports.create = function (server, bayeuxServer, resourcesMiddleware, currentSession, userAgent, logger) {
    var bayeuxClient = server.bayeux;
    var ended = false;
    var bayeuxDisconnectListener;
    var bayeuxClientId;
    var headerHeight;
    var headerResourceSet;
    var _sessionLoadedDeferred;

    var id = uuid();
    var baseUrl = "/slaves/" + id;
    var url = baseUrl + "/browser";
    var headerPath = baseUrl + "/header";
    var becomesReadyPath = baseUrl + "/ready";
    var noSessionPath = baseUrl + "/no_session";

    var slave = buster.extend(buster.eventEmitter.create(), {
        respond: function (req, res, pathname) {
            if (req.method == "GET" && pathname == noSessionPath) {
                res.writeHead(200, {"Content-Type": "text/html"});
                res.end();
                return true;
            }
        },

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
            currentSession = session;
            broadcastSession();
            return sessionLoadedDeferred().promise;
        },

        endSession: function () {
            if (!currentSession) return;

            logger.info("Session " + currentSession.id
                        + " about to end in " + slave.userAgent);

            var deferred = when.defer();
            bayeuxClient.publish("/" + id + "/session/end", {});

            var unloadedEvent = "/" + id + "/session/unloaded";
            var unloadedHandler = function () {
                bayeuxClient.unsubscribe(unloadedEvent, unloadedHandler);
                logger.info("Session " + currentSession.id
                            + " ended in " + slave.userAgent);
                currentSession = undefined;
                deferred.resolve();
            };
            bayeuxClient.subscribe(unloadedEvent, unloadedHandler);

            return deferred.promise;
        },

        // Note: when changing this, make sure browser/control-frame.js still
        // works. It's not currently integration tested.
        getEnv: function() {
            return {
                bayeuxPath: server.messagingContextPath,
                capturePath: server.capturePath,
                slave: this.serialize()
            };
        },

        serialize: function () {
            return {
                id: id,
                url: url,
                becomesReadyPath: becomesReadyPath,
                noSessionPath: noSessionPath,
                userAgent: userAgent
            };
        }
    });

    Object.defineProperty(slave, "id", {
        get: function () { return id; }
    });

    Object.defineProperty(slave, "url", {
        get: function () { return url; }
    });

    Object.defineProperty(slave, "userAgent", {
        get: function () { return userAgent; }
    });

    bayeuxDisconnectListener = function (_bayeuxClientId) {
        if (bayeuxClientId == _bayeuxClientId) endSlave();
    };

    function broadcastSession() {
        if (currentSession !== undefined && slave.ready) {

            bayeuxClient.publish("/" + id + "/session/start", currentSession.serialize());

            var session = currentSession;
            logger.info("Session " + session.id + " about to start in " + slave.userAgent);
            var readyEvent = "/" + id + "/session/" + currentSession.id + "/ready";
            var sessionReadyHandler = function () {
                logger.info("Session " + session.id + " started in " + userAgent);
                sessionLoadedDeferred().resolve();
                _sessionLoadedDeferred = null;
                bayeuxClient.unsubscribe(readyEvent, sessionReadyHandler);
            };
            bayeuxClient.subscribe(readyEvent, sessionReadyHandler);
        }
    }

    function sessionLoadedDeferred() {
        if (!_sessionLoadedDeferred) {
            _sessionLoadedDeferred = when.defer();
        }
        return _sessionLoadedDeferred;
    }

    function endSlave() {
        if (ended) return;
        ended = true;

        bayeuxServer.unbind("disconnect", bayeuxDisconnectListener);
        resourcesMiddleware.unmount(url);
        logger.info("Freed slave " + userAgent);
        slave.emit("end");
    }

    function addFiles(rs, paths, done) {
        var promises = [];
        paths.forEach(function (path) {
            var deferred = when.defer();
            promises.push(deferred.promise);
            resourceSet.addFileResource(path).then(function () {
                resourceSet.loadPath.append(path);
                deferred.resolve();
            });
        });

        when.all(promises).then(done);
    }

    var resourceSet = bResourcesResourceSet.create();

    addFiles(resourceSet, frameworkScriptPaths, function () {
        resourceSet.addResource({
            path: "/env.js",
            content: function () {
                return "buster.env = " + JSON.stringify(slave.getEnv()) + ";";
            }
        }).then(function () {
            resourceSet.loadPath.append(["/env.js"]);
            addFiles(resourceSet, slaveScriptPaths, function () {
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
                }).then(function () {
                    logger.info("Captured slave " + userAgent);
                    slave.emit("ready");
                });
            });
        });
    });

    // An extension is used to get the ID of the publicator
    bayeuxClient.addExtension({
        incoming: function (message, callback) {
            if (message.channel == becomesReadyPath) {
                slave.ready = true;
                bayeuxClientId = message.clientId;
                broadcastSession();
            }

            callback(message);
        }
    });
    // Subscribing so we receive the event in the extension
    bayeuxClient.subscribe(becomesReadyPath, function(){});

    bayeuxServer.bind("disconnect", bayeuxDisconnectListener);

    if (currentSession && !(currentSession.joinable == false)) {
        slave.startSession(currentSession);
    }

    resourcesMiddleware.mount(url, resourceSet);

    return slave;
};