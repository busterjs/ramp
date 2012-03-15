var buster = require("buster-core");
var br = require("buster-resources");
var bCapServBayeuxServer = require("./buster-capture-server-bayeux-server");
var httpServerRequestListenerProxy = require("./http-server-request-listener-proxy");
var bCapServSession = require("./session");
var bCapServSessionQueue = require("./session-queue");
var bCapServSlave = require("./slave");
var URL = require("url");
var when = require("when");
var faye = require("faye");

var NOOP = function(){};

exports.create = function () {
    var httpServer;
    var headerHeight;
    var headerResourceSet;
    var bayeuxServer;
    var logger = {"error":NOOP,"warn":NOOP,"log":NOOP,"info":NOOP,"debug":NOOP};
    var resourcesMiddleware = br.resourceMiddleware.create("");
    var resourceCache = br.resourceSetCache.create();
    var sessionQueue = bCapServSessionQueue.create();

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
            sessionQueue.slaves.forEach(function (slave) {
                slave.header(headerHeight, headerResourceSet);
            });
        },

        createSession: function (data) {
            var deferred = when.defer();
            createSession(data).then(function (session) {
                deferred.resolve(session.serialize());
            }, function (err) {
                deferred.reject(err);
            });
            return deferred.promise;
        },

        endSession: function (id) {
            var session = sessionQueue.sessions.filter(function (sess) {
                return sess.id == id;
            })[0];

            if (session) {
                sessionQueue.dequeue(session);
            }
        },

        currentSession: function () {
            var s = sessionQueue.currentSession()
            return s && s.serialize();
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
            return sessionQueue.sessions.map(function (s) { return s.serialize(); });
        },

        slaves: function () {
            return sessionQueue.slaves.map(function (s) { return s.serialize(); });
        }
    };

    function respond(req, res) {
        var url = URL.parse(req.url);

        if (req.method == "GET" && url.pathname == captureServer.capturePath) {
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
            respondWithFullBody(req, res, createSessionWithRequestBody);
            return true;
        }

        if (req.method == "GET" && url.pathname == "/resources") {
            listKnownResources(res);
            return true;
        }

        if (resourcesMiddleware.respond(req, res)) return true;

        if (sessionQueue.sessions.some(function(session) {
            return session.respond(req, res, url.pathname);
        })) return true;

        if (sessionQueue.slaves.some(function(slave) {
            return slave.respond(req, res, url.pathname);
        })) return true;

        if (/^\/slaves\/[^\/]+\/browser$/.test(url.pathname)) {
            captureSlave(req, res);
            return true;
        }
    }

    function listKnownResources(res) {
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
        var currentSession = sessionQueue.currentSession();

        if (currentSession) {
            res.writeHead(200, {"Content-Type": "application/json"});
            res.write(JSON.stringify(currentSession.serialize()));
        } else {
            res.writeHead(404);
        }

        res.end();
    }

    // Calls CB when the entire request body has been received.
    function respondWithFullBody(req, res, cb) {
        var requestBody = "";
        req.setEncoding("utf8");
        req.on("data", function (chunk) { requestBody += chunk; });
        req.on("end", function () { cb(requestBody, req, res); });
    }

    function createSessionWithRequestBody(requestBody, req, res) {
        try {
            var data = JSON.parse(requestBody);
        } catch(e) {
            failWithMessage(res, "Invalid JSON");
            return;
        }

        createSession(data).then(function (session) {
            var sessionIsCurrent = session === sessionQueue.currentSession();
            var statusCode = sessionIsCurrent ? 201 : 202;

            var serializedSession = session.serialize();
            res.writeHead(statusCode, {"Location": serializedSession.rootPath});
            res.write(JSON.stringify(serializedSession));
            res.end();
        }, function (err) {
            failWithMessage(res, err.toString());
        });
    }

    function createSession(data) {
        var serializedSessionPromise = when.defer();

        bCapServSession.create(data, httpServer).then(function (session) {
            var state = sessionQueue.enqueue(session);
            switch (state) {
            case bCapServSessionQueue.ENQUEUE_STARTED:
            case bCapServSessionQueue.ENQUEUE_QUEUED:
                captureServer.bayeux.publish("/session/create", {
                    session: session.serialize()
                });
                serializedSessionPromise.resolve(session);
                break;
            case bCapServSessionQueue.ENQUEUE_FAILED:
                serializedSessionPromise.reject("No slaves captured, session not created");
                break;
            }
        }, function (err) {
            serializedSessionPromise.reject(err);
        });

        return serializedSessionPromise;
    }

    function failWithMessage(res, message) {
        res.writeHead(400);
        res.write(message + "\n");
        res.end();
    }

    function captureSlave(req, res) {
        var slave = bCapServSlave.create(captureServer, bayeuxServer, resourcesMiddleware, sessionQueue, req.headers["user-agent"], logger);
        slave.header(headerHeight, headerResourceSet);
        slave.on("ready", function () {
            captureServer.oncapture(req, res, slave);
            sessionQueue.addSlave(slave);
            captureServer.bayeux.publish("/capture", slave.serialize());
        });
    }

    bayeuxServer = bCapServBayeuxServer.create(logger, captureServer.messagingContextPath);

    sessionQueue.prepare = function (e) {
        var deferred = when.defer();

        resourceCache.inflate(e.session.resourceSet).then(function (rs) {
            resourcesMiddleware.mount(e.session.resourcesPath, rs);
            deferred.resolve();
        }, function (err) {
            deferred.reject(err);
        });

        return deferred.promise;
    };

    sessionQueue.on("loaded", function (e) {
        captureServer.bayeux.publish("/session/start", {
            session: e.session.serialize(),
            slaves: e.slaves.map(function (slave) {
                return {userAgent: slave.userAgent, id: slave.id};
            })
        });
    });

    sessionQueue.on("unloaded", function (e) {
        resourcesMiddleware.unmount(e.session.resourcesPath);
        captureServer.bayeux.publish("/session/end", {session: e.session.serialize()});
    });

    return captureServer;
};

exports.createSessionMessenger = function (messagingUrl, session) {
    var bayeux = new faye.Client(messagingUrl);
    var contextPath = session.bayeuxContextPath;

    return {
        publish: function (path, data) {
            return bayeux.publish(contextPath + path, data);
        },

        subscribe: function (path, cb) {
            return bayeux.subscribe(contextPath + path, cb);
        },

        disconnect: function () {
            return bayeux.disconnect();
        }
    };
}