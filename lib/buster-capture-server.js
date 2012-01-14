var buster = require("buster-core");
var bResources = require("buster-resources");
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

    var captureServer = {
        messagingContextPath: "/sessions/messaging",
        capturePath: "/capture",

        get sessions() {
            return sessions;
        },

        get slaves() {
            return slaves;
        },

        get logger() {
            return logger;
        },

        set logger(newLogger) {
            logger = newLogger;
            bayeuxServer.setLogger(newLogger);
        },

        header: function (height, resourceSetOpts) {
            if (headerResourceSet !== undefined) busterResources.removeResourceSet(headerResourceSet);

            headerHeight = height;
            resourceSetOpts.contextPath = "/slaveHeader";
            headerResourceSet = busterResources.createResourceSet(resourceSetOpts);
            return headerResourceSet;
        },

        createSession: function (data) {
            var error = bCapServSession.validate(data);
            if (error) throw new Error(error);
            logger.info("Creating session");
            return createSessionWithData(data);
        },

        destroySession: function (id) {
            var i = getSessionIndexById(id);
            if (i >= -1) {
                logger.info("Destroying session");
                logger.debug("Session ID", id)
                sessions[i].end();
            }
        },

        destroyCurrentSession: function () {
            if (sessions.length > 0) {
                this.destroySession(sessions[0].id);
            }
        },

        get bayeux() {
            return bayeuxServer.getClient();
        },

        attach: function (_httpServer) {
            httpServer = _httpServer;
            bayeuxServer.attach(httpServer);
            httpServerRequestListenerProxy.attach(httpServer, respond);

            httpServer.on("close", function () {
                this.bayeux.disconnect();
            }.bind(this));
        }
    }

    function respond(req, res) {
        var url = URL.parse(req.url);

        if (req.method == "GET" && url.pathname == captureServer.capturePath) {
            logger.info("Capturing new slave");
            captureSlave(req, res);
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
        }

        for (var i = 0, ii = slaves.length; i < ii; i++) {
            if (slaves[i].respond(req, res, url.pathname)) return true;
        }

        for (var i = 0, ii = sessions.length; i < ii; i++) {
            if (sessions[i].respond(req, res, url.pathname)) return true;
        }

        if (busterResources.getResourceViaHttp(req, res)) return true;
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

    function getSessionIndexById(id) {
        for (var i = 0, ii = sessions.length; i < ii; i++) {
            var session = sessions[i];
            if (session.id == id) {
                return i;
            }
        }
    }

    function unloadSession(id) {
        var i = getSessionIndexById(id);

        var session = sessions[i];
        // TODO: Session should remove its own resource set
        busterResources.removeResourceSet(session.resourceSet);
        sessions.splice(i, 1);

        // Did we unload the current session?
        if (i == 0) {
            logger.debug("Current session did end.");
            if (sessions.length > 0) {
                logger.debug("Starting queued session.");
                loadCurrentSession();
            }
        }
    }

    function createSessionFromRequest(req, res) {
        var requestBody = "";
        req.on("data", function (chunk) { requestBody += chunk.toString("utf8") });
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
            var session = createSessionWithData(data);
        } catch (e) {
            logger.error("Failed to create session", e);
            res.writeHead(403);
            res.write(e.message);
            res.end();
            return;
        }

        var statusCode = sessions.length > 1 ? 202 : 201;

        res.writeHead(statusCode, {"Location": session.rootPath});
        res.write(JSON.stringify(buster.extend(session.toJSON(), {
            slaves: slaves.map(function (slave) {
                return {id: slave.id}
            })
        })));
        res.end();
    }

    function createSessionWithData(data) {
        var resourceSet = busterResources.createResourceSet();
        var session = bCapServSession.create(data, resourceSet, httpServer);
        session.logger = logger;
        session.on("end", function () {
            unloadSession(session.id);
        });

        sessions.push(session);
        if (sessions.length == 1) {
            logger.debug("Starting newly created session immediately");
            loadCurrentSession();
        } else {
            logger.debug("Queuing newly created session");
        }

        return session;
    }

    function loadCurrentSession() {
        logger.debug("Broadcasting session start to slaves");
        for (var i = 0, ii = slaves.length; i < ii; i++) {
            slaves[i].startSession(sessions[0]);
        }
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

        var slave = bCapServSlave.create(captureServer, bayeuxServer, busterResources,
                                         headerResourceSet, headerHeight,
                                         sessions[0]);
        slave.on("end", function () {
            unloadSlave(slave);
        });
        slaves.push(slave);
        captureServer.oncapture(req, res, slave);
    }

    function unloadSlave(slave) {
        for (var i = 0, ii = slaves.length; i < ii; i++) {
            if (slaves[i] === slave) {
                slaves.splice(i, 1);
                break;
            }
        }
    }

    bayeuxServer = bCapServBayeuxServer.create(logger, captureServer.messagingContextPath);

    return captureServer;
};