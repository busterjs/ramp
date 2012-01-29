var buster = require("buster-core");
var bResources = require("buster-resources");
var bResourcesResourceSet = bResources.resourceSet;
var bCapServBayeuxServer = require("./buster-capture-server-bayeux-server");
var httpServerRequestListenerProxy = require("./http-server-request-listener-proxy");
var bCapServSession = require("./session");
var bCapServSlave = require("./slave");
var URL = require("url");

var NOOP = function(){};

exports.create = function () {
    var busterResources = Object.create(bResources);
    var httpServer;
    var headerHeight;
    var headerResourceSet;
    var bayeuxServer;
    var sessions = [];
    var slaves = [];
    var logger = {"error":NOOP,"warn":NOOP,"log":NOOP,"info":NOOP,"debug":NOOP};
    var resourcesMiddleware = bResources.resourceMiddleware.create("");
    var currentSession;

    var captureServer = {
        messagingContextPath: "/sessions/messaging",
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
            var error = bCapServSession.validate(data);
            if (error) throw new Error(error);
            logger.info("Creating session");
            return createSession(data);
        },

        endSession: function (id) {
            var i = getSessionIndexById(id);
            if (i >= 0) {
                logger.info("Destroying session");
                logger.debug("Session ID", id)
                sessions[i].end();
            }
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
            this.bayeux.publish("/capture", slave.serialize());
        },

        getSlave: function (id) {
            for (var i = 0, ii = slaves.length; i < ii; i++) {
                var slave = slaves[i];
                if (slave.id === id) return slave;
            }
        },

        sessions: function () {
            return sessions.map(function (s) { return s.serialize(); });
        }
    }

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

        if (req.method == "POST" && url.pathname == "/sessions") {
            logger.debug("Creating session via HTTP");
            createSessionFromRequest(req, res);
            return true;
        }

        if (req.method == "GET" && url.pathname == "/resources") {
            listKnownResources(res);
            return true;
        }

        if (req.method == "DELETE" && url.pathname == "/resources") {
            resourceGc(res);
            return true;
        }

        if (resourcesMiddleware.respond(req, res)) return true;

        if (sessions.some(function(session) {
            return session.respond(req, res, url.pathname)
        })) return true;
    }

    function resourceGc(res) {
        logger.debug("Performing resource garbage collection");
        busterResources.gc();
        res.writeHead(200);
        res.end();
    }

    function listKnownResources(res) {
        logger.debug("Listing known resources");
        res.writeHead(200);
        res.write(JSON.stringify(busterResources.getCachedResources()));
        res.end();
    }

    function listSessionsFromRequest(res) {
        res.writeHead(200, {"Content-Type": "application/json"});
        res.write(JSON.stringify(captureServer.sessions()));
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

    function unloadSession(id) {
        var i = getSessionIndexById(id);

        var session = sessions[i];
        // busterResources.removeResourceSet(session.resourceSet);
        sessions.splice(i, 1);

        // Make sure it's asynchronous.
        process.nextTick(function () {
            captureServer.bayeux.publish("/session/end", session.serialize());
        });

        // Did we unload the current session?
        if (i == 0) {
            logger.debug("Current session did end.");
            if (readySessions().length > 0) {
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

        var error = bCapServSession.validate(data);
        if (error) {
            logger.error("Invalid session", error);
            return failWithMessage(res, error);
        }

        try {
            var session = createSession(data);
        } catch (e) {
            logger.error("Failed to create session", e);
            res.writeHead(403);
            res.write(e.message);
            res.end();
            return;
        }

        var statusCode = readySessions().length > 1 ? 202 : 201;

        res.writeHead(statusCode, {"Location": session.rootPath});
        res.write(JSON.stringify(session));
        res.end();
    }

    function createSession(data) {
        var session = bCapServSession.create(data, httpServer);
        session.logger = logger;
        sessions.push(session);

        session.on("ready", function () {
            captureServer.bayeux.publish("/session/create", session.serialize());
            if (readySessions().length == 1) {
                logger.debug("Starting newly created session immediately");
                loadCurrentSession();
            } else {
                logger.debug("Queuing newly created session");
            }
        });
        session.on("end", function () {
            unloadSession(session.id);
        });

        return session.serialize();
    }

    function loadCurrentSession() {
        currentSession = sessions[0];
        logger.debug("Broadcasting session start to slaves");
        captureServer.bayeux.publish("/session/start", currentSession.serialize());
        // slaves.forEach(function (slave) {
        //     slave.startSession(sessions[0]);
        // });
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

        captureServer.oncapture(req, res, createSlave());
    }

    function createSlave() {
        var slave = bCapServSlave.create(captureServer, bayeuxServer, resourcesMiddleware, currentSession);
        slave.on("end", function () { unloadSlave(slave); });
        slave.header(headerHeight, headerResourceSet);
        slaves.push(slave);

        return slave;
    }

    function unloadSlave(slave) {
        busterResources.removeResourceSet(slave.resourceSet);
        slaves.splice(slaves.indexOf(slave), 1);
    }

    bayeuxServer = bCapServBayeuxServer.create(logger, captureServer.messagingContextPath);

    return captureServer;
};