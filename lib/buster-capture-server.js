var buster = require("buster-core");
var faye = require("faye");
var busterResources = require("buster-resources");
var bCapServSession = require("./session");
var capturedClient = require("./capture/captured-client");
var URL = require("url");

var NOOP = function(){};

module.exports = {
    messagingContextPath: "/sessions/messaging",
    capturePath: "/capture",

    create: function () {
        var instance = Object.create(this);
        instance.busterResources = Object.create(busterResources);
        instance.sessions = [];
        instance.capturedClients = [];
        instance.temporarySessionEventEmitter = buster.eventEmitter.create();
        bindToSessionMiddleware.call(instance, instance.temporarySessionEventEmitter);
        setupBayeux.call(instance);
        instance.logger = {"error":NOOP,"warn":NOOP,"log":NOOP,"info":NOOP,"debug":NOOP};
        return instance;
    },

    respond: function (req, res) {
        var url = URL.parse(req.url);

        if (url.pathname == this.capturePath) {
            this.logger.info("Capturing new client");
            captureClient.call(this, req, res);
            return true;
        }

        for (var i = 0, ii = this.capturedClients.length; i < ii; i++) {
            if (this.capturedClients[i].respond(req, res, url.pathname)) return true;
        }

        if (req.method == "POST" && req.url == "/sessions") {
            this.logger.debug("Creating session via HTTP");
            createSessionFromRequest.call(this, req, res);
            return true;
        }

        for (var i = 0, ii = this.sessions.length; i < ii; i++) {
            if (this.sessions[i].respond(req, res)) return true;
        }

        if (req.method == "GET" && req.url == "/resources") {
            listKnownResources.call(this, res);
            return true;
        }

        if (req.method == "DELETE" && req.url == "/resources") {
            resourceGc.call(this, res);
        }

        if (this.busterResources.getResourceViaHttp(req, res)) return true;
    },

    header: function (height, resourceSetOpts) {
        this.headerHeight = height;
        resourceSetOpts.contextPath = "/clientHeader";
        this.headerResourceSet = this.busterResources.createResourceSet(resourceSetOpts);
        return this.headerResourceSet;
    },

    createSession: function (data) {
        var error = bCapServSession.validate(data);
        if (error) throw new Error(error);
        this.logger.info("Creating session");
        return createSessionWithData.call(this, data);
    },

    destroySession: function (id) {
        var i = getSessionIndexById.call(this, id);
        if (i >= -1) {
            this.logger.info("Destroying session");
            this.logger.debug("Session ID", id)
            this.sessions[i].end();
        }
    },

    destroyCurrentSession: function () {
        if (this.sessions.length > 0) {
            this.destroySession(this.sessions[0].id);
        }
    },

    get bayeux() {
        return this.bayeuxServer.getClient();
    },

    attach: function (httpServer) {
        this.httpServer = httpServer;

        var self = this;
        this.bayeuxServer.attach(httpServer);
        proxyThroughRespond(httpServer, this);

        httpServer.on("close", function () {
            self.bayeux.disconnect();
        });
    }
}

function proxyThroughRespond(httpServer, middleware) {
    var requestListeners = httpServer.listeners("request");
    httpServer.removeAllListeners("request");

    httpServer.on("request", function (req, res) {
        if (middleware.respond(req, res)) return;

        for (var i = 0, ii = requestListeners.length; i < ii; i++) {
            requestListeners[i](req, res);
        }
    });
}

function setupBayeux() {
    var self = this;
    this.bayeuxServer = new faye.NodeAdapter({mount: this.messagingContextPath, timeout: 1});

    this.bayeuxServer.addExtension({
        incoming: function (message, callback) {
            logBayeuxMessage.call(self, "[BAYEUX IN ]", message)
            return callback(message);
        },

        outgoing: function (message, callback) {
            logBayeuxMessage.call(self, "[BAYEUX OUT]", message)
            return callback(message);
        }
    });
}

function logBayeuxMessage(prefix, message) {
    if (message.channel == "/meta/connect") return;

    this.logger.debug(prefix, message.channel, message);
}

function resourceGc(res) {
    this.logger.debug("Performing resource garbage collection");
    this.busterResources.gc();
    res.writeHead(200);
    res.end();
}

function listKnownResources(res) {
    this.logger.debug("Listing known resources");
    res.writeHead(200);
    res.write(JSON.stringify(this.busterResources.getCachedResources()));
    res.end();
}

function getSessionIndexById(id) {
    for (var i = 0, ii = this.sessions.length; i < ii; i++) {
        var session = this.sessions[i];
        if (session.id == id) {
            return i;
        }
    }
}

function unloadSession(id) {
    var i = getSessionIndexById.call(this, id);

    var session = this.sessions[i];
    // TODO: Session should remove its own resource set
    this.busterResources.removeResourceSet(session.resourceSet);
    this.sessions.splice(i, 1);

    // Did we unload the current session?
    if (i == 0) {
        this.logger.debug("Ending current session");
        this.temporarySessionEventEmitter.emit("session:end");
        if (this.sessions.length > 0) {
            this.logger.debug("Starting queued session");
            loadSession.call(this);
        }
    }
}

function createSessionFromRequest(req, res) {
    var self = this;

    var requestBody = "";
    req.on("data", function (chunk) { requestBody += chunk.toString("utf8") });
    req.on("end", function () {
        createSessionWithRequestBody.call(self, requestBody, req, res);
    });
}

function createSessionWithRequestBody(requestBody, req, res) {
    try {
        var data = JSON.parse(requestBody);
    } catch(e) {
        this.logger.error("Invalid JSON", requestBody);
        return failWithMessage(res, "Invalid JSON");
    }

    var error = bCapServSession.validate(data);
    if (error) {
        this.logger.error("Invalid session", error);
        return failWithMessage(res, error);
    }

    try {
        var session = createSessionWithData.call(this, data);
    } catch (e) {
        this.logger.error("Failed to create session", e);
        res.writeHead(403);
        res.write(e.message);
        res.end();
        return;
    }

    var statusCode = this.sessions.length > 1 ? 202 : 201;

    res.writeHead(statusCode, {"Location": session.rootPath});
    res.write(JSON.stringify(buster.extend(session.toJSON(), {
        clients: this.capturedClients.map(function (client) {
            return {id: client.id}
        })
    })));
    res.end();
}

function createSessionWithData(data) {
    var self = this;

    var resourceSet = this.busterResources.createResourceSet();
    var session = bCapServSession.create(data, resourceSet, this.httpServer);
    session.logger = this.logger;
    session.on("end", function () {
        unloadSession.call(self, session.id);
    });

    this.sessions.push(session);
    if (this.sessions.length == 1) {
        this.logger.debug("Starting newly created session immediately");
        loadSession.call(this);
    } else {
        this.logger.debug("Queuing newly created session");
    }

    return session;
}

function loadSession() {
    this.temporarySessionEventEmitter.emit("session:start", this.sessions[0]);
}

function failWithMessage(res, message) {
    res.writeHead(500);
    res.write(message + "\n");
    res.end();
}


function captureClient(req, res) {
    if (typeof(this.oncapture) != "function") {
        res.writeHead(500);
        res.write("Client was created with no 'oncapture' handler.");
        res.end();
        return;
    }

    var client = capturedClient.create(this, this.busterResources,
                                       this.headerResourceSet, this.headerHeight,
                                       this.currentSession);
    client.on("end", function () {
        unloadClient.call(this, client);
    }.bind(this));
    this.capturedClients.push(client);
    this.oncapture(req, res, client);
}

function unloadClient(client) {
    for (var i = 0, ii = this.capturedClients.length; i < ii; i++) {
        if (this.capturedClients[i] === client) {
            this.capturedClients.splice(i, 1);
            break;
        }
    }
}

function bindToSessionMiddleware(sessionMiddleware) {
    sessionMiddleware.on("session:start", function (session) {
        startSession.call(this, session);
    }.bind(this));

    sessionMiddleware.on("session:end", function () {
        endSession.call(this);
    }.bind(this));
}

function startSession(session) {
    this.logger.debug("Broadcasting session start to captured clients");
    this.currentSession = session;
    for (var i = 0, ii = this.capturedClients.length; i < ii; i++) {
        this.capturedClients[i].startSession(session);
    }
};

function endSession() {
    this.logger.debug("Broadcasting session end to captured clients");
    this.currentSession = null;
    for (var i = 0, ii = this.capturedClients.length; i < ii; i++) {
        this.capturedClients[i].endSession();
    }
};