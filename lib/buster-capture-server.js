var buster = require("buster-core");
var br = require("buster-resources");
var bCapServBayeuxServer = require("./buster-capture-server-bayeux-server");
var httpServerRequestListenerProxy = require("./http-server-request-listener-proxy");
var bCapServSession = require("./session");
var bCapServSlave = require("./slave");
var URL = require("url");
var when = require("when");

var NOOP = function(){};

exports.create = function () {
    var httpServer;
    var headerHeight;
    var headerResourceSet;
    var bayeuxServer;
    var sessions = [];
    var slaves = [];
    var logger = {"error":NOOP,"warn":NOOP,"log":NOOP,"info":NOOP,"debug":NOOP};
    var resourcesMiddleware = br.resourceMiddleware.create("");
    var resourceCache = br.resourceSetCache.create();
    var currentSession;

    var captureServer = {
        messagingContextPath: "/messaging",
        capturePath: "/capture",

        get logger() {
            return logger;
        },

        set logger(newLogger) {
            logger = newLogger;
            bayeuxServer.setLogger(newLogger);
        },

        header: function (height, resourceSet) {
            headerHeight = height;
            headerResourceSet = resourceSet;
            slaves.forEach(function (slave) { slave.header(headerHeight, headerResourceSet); });
        },

        createSession: function (data) {
            logger.info("Creating session");
            return createSession(data);
        },

        endSession: function (id) {
            var i = getSessionIndexById(id);
            if (i >= 0) {
                logger.info("Destroying session");
                logger.debug("Session ID", id);
                sessions[i].end();
            }
        },

        currentSession: function () {
            return currentSession && currentSession.serialize();
        },

        get bayeux() {
            return bayeuxServer.getClient();
        },

        attach: function (_httpServer) {
            httpServer = _httpServer;
            bayeuxServer.attach(httpServer);
            httpServerRequestListenerProxy.attach(httpServer, respond);
        },

        oncapture: function (req, res, slave) {
            res.writeHead(302, {"Location": slave.url});
            res.end();
        },

        sessions: function () {
            return sessions.map(function (s) { return s.serialize(); });
        },

        slaves: function () {
            return slaves.map(function (s) { return s.serialize(); });
        }
    };

    function respond(req, res) {
        var url = URL.parse(req.url);

        if (req.method == "GET" && url.pathname == captureServer.capturePath) {
            logger.info("Capturing new slave");
            captureSlave(req, res);
            return true;
        }

        if (req.method == "GET" && url.pathname == "/sessions") {
            listSessionsFromRequest(res);
            return true;
        }

        if (req.method == "GET" && url.pathname == "/sessions/current") {
            showCurrentSession(res);
            return true;
        }

        if (req.method == "POST" && url.pathname == "/sessions") {
            logger.debug("Creating session via HTTP");
            createSessionFromRequest(req, res);
            return true;
        }

        if (req.method == "GET" && url.pathname == "/resources") {
            listKnownResources(res);
            return true;
        }

        if (resourcesMiddleware.respond(req, res)) return true;

        if (sessions.some(function(session) {
            return session.respond(req, res, url.pathname);
        })) return true;

        if (slaves.some(function(slave) {
            return slave.respond(req, res, url.pathname);
        })) return true;

        if (/^\/slaves\/[^\/]+\/browser$/.test(url.pathname)) {
            logger.info("Recapturing unknown slave");
            captureSlave(req, res);
            return true;
        }
    }

    function listKnownResources(res) {
        logger.debug("Listing known resources");
        res.writeHead(200);
        res.write(JSON.stringify(resourceCache.resourceVersions()));
        res.end();
    }

    function listSessionsFromRequest(res) {
        res.writeHead(200, {"Content-Type": "application/json"});
        res.write(JSON.stringify(captureServer.sessions()));
        res.end();
    }

    function showCurrentSession(res) {
        if (currentSession) {
            res.writeHead(200, {"Content-Type": "application/json"});
            res.write(JSON.stringify(currentSession.serialize()));
        } else {
            res.writeHead(404);
        }

        res.end();
    }

    function getSessionIndexById(id) {
        var matches = sessions.filter(function (sess) { return sess.id == id; });
        return sessions.indexOf(matches[0]);
    }

    function readySessions() {
        return sessions.filter(function (s) {
            return s.ready == true;
        });
    }

    function readySlaves() {
        return slaves.filter(function (s) {
            return s.ready == true;
        });
    }

    function unloadSession(id) {
        var i = getSessionIndexById(id);

        var session = sessions[i];
        resourcesMiddleware.unmount(currentSession.resourcesPath);
        sessions.splice(i, 1);

        // Make sure it's asynchronous.
        process.nextTick(function () {
            captureServer.bayeux.publish("/session/end", session.serialize());
        });

        // Did we unload the current session?
        if (i == 0) {
            logger.debug("Current session did end.");
            if (readySessions().length > 0 && readySlaves().length > 0) {
                logger.debug("Starting queued session.");
                loadCurrentSession();
            }
        }
    }

    function createSessionFromRequest(req, res) {
        var requestBody = "";
        req.setEncoding("utf8");
        req.on("data", function (chunk) { requestBody += chunk; });
        req.on("end", function () {
            createSessionWithRequestBody(requestBody, req, res);
        });
    }

    function createSessionWithRequestBody(requestBody, req, res) {
        try {
            var data = JSON.parse(requestBody);
        } catch(e) {
            logger.error("Invalid JSON", requestBody);
            return failWithMessage(res, "Invalid JSON");
        }

        var promise = createSession(data);
        if (!promise) {
            res.writeHead(403);
            res.write("No slaves captured, session not created.");
            res.end();
            return;
        }


        promise.then(function (serializedSession) {
            var statusCode = readySessions().length > 1 ? 202 : 201;

            res.writeHead(statusCode, {"Location": serializedSession.rootPath});
            res.write(JSON.stringify(serializedSession));
            res.end();
        }, function (err) {
            logger.error("Failed to create session", err);
            res.writeHead(403);
            res.write(err.toString());
            res.end();
        });
    }

    function createSession(data) {
        if (readySlaves().length === 0 && data.joinable == false) return;

        var serializedSessionPromise = when.defer();
        var promise = bCapServSession.create(data, httpServer, resourceCache);

        promise.then(function (session) {
            session.logger = logger;
            sessions.push(session);
            session.on("end", function () {
                when.all(slaves.map(function (slave) {
                    return slave.endSession();
                })).then(function () {
                    unloadSession(session.id);
                });
            });

            captureServer.bayeux.publish("/session/create", session.serialize());
            if (readySessions().length == 1) {
                logger.debug("Starting newly created session immediately");
                loadCurrentSession();
            } else {
                logger.debug("Queuing newly created session");
            }

            serializedSessionPromise.resolve(session.serialize());
        }, function (err) {
            serializedSessionPromise.reject(err);
        });

        return serializedSessionPromise;
    }

    function loadCurrentSession() {
        currentSession = sessions[0];
        logger.debug("Broadcasting session start to slaves");

        resourceCache.inflate(currentSession.resourceSet).then(function (rs) {
            resourcesMiddleware.mount(currentSession.resourcesPath, rs);
            when.all(slaves.map(function (slave) {
                return slave.startSession(sessions[0]);
            })).then(function () {
                captureServer.bayeux.publish("/session/start", currentSession.serialize());
            });
        });
    }

    function failWithMessage(res, message) {
        res.writeHead(400);
        res.write(message + "\n");
        res.end();
    }

    function captureSlave(req, res) {
        if (typeof(captureServer.oncapture) != "function") {
            failWithMessage(res, "Slave was created with no 'oncapture' handler.");
            return;
        }
        var slave = bCapServSlave.create(captureServer, bayeuxServer, resourcesMiddleware, currentSession, req.headers["user-agent"]);
        slave.header(headerHeight, headerResourceSet);
        slaves.push(slave);
        slave.on("end", function () { unloadSlave(slave); });
        slave.on("ready", function () {
            captureServer.oncapture(req, res, slave);
            captureServer.bayeux.publish("/capture", slave.serialize());
        });
    }

    function unloadSlave(slave) {
        slaves.splice(slaves.indexOf(slave), 1);
    }

    bayeuxServer = bCapServBayeuxServer.create(logger, captureServer.messagingContextPath);

    return captureServer;
};