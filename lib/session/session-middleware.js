var buster = require("buster-core");
var busterSessionMiddlewareSession = require("./session");

module.exports = buster.extend(buster.eventEmitter.create(), {
    create: function (busterResources, server) {
        var instance = Object.create(this);
        instance.busterResources = busterResources;
        instance.server = server;
        instance.sessions = [];
        return instance;
    },

    respond: function (req, res) {
        if (req.method == "POST" && req.url == "/sessions") {
            this.logger.debug("Creating session via HTTP");
            createSessionFromRequest.call(this, req, res);
            return true;
        }

        for (var i = 0, ii = this.sessions.length; i < ii; i++) {
            var session =  this.sessions[i];

            if (req.url == session.rootPath && req.method == "DELETE") {
                this.logger.info("Destroying session via HTTP");
                unloadSession.call(this, i);
                res.writeHead(200);
                res.end();
                return true;
            }
        }
    },

    createSession: function (data) {
        var error = busterSessionMiddlewareSession.validate(data);
        if (error) throw new Error(error);
        this.logger.info("Creating session");
        return createSessionWithData.call(this, data);
    },

    destroySession: function (id) {
        for (var i = 0, ii = this.sessions.length; i < ii; i++) {
            var session = this.sessions[i];
            if (session.id == id) {
                this.logger.info("Destroying session");
                this.logger.debug("Session ID", id)
                unloadSession.call(this, i);
                break;
            }
        }
    },

    destroyCurrentSession: function () {
        if (this.sessions.length > 0) {
            this.destroySession(this.sessions[0].id);
        }
    }
});

function unloadSession(i) {
    var session = this.sessions[i];
    this.busterResources.removeResourceSet(session.resourceSet);
    session.destroy();
    this.sessions.splice(i, 1);

    // Did we unload the current session?
    if (i == 0) {
        this.logger.debug("Ending current session");
        this.emit("session:end");
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

    var error = busterSessionMiddlewareSession.validate(data);
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

    var statusCode;
    if (this.sessions.length > 1) {
        statusCode = 202;
    } else {
        statusCode = 201;
    }

    res.writeHead(statusCode, {"Location": session.rootPath});
    res.write(JSON.stringify(buster.extend(session.toJSON(), {
        clients: this.server.capture.capturedClients.map(function (client) {
            return {id: client.id}
        })
    })));
    res.end();
}

function createSessionWithData(data) {
    var self = this;

    var session = busterSessionMiddlewareSession.create(data, this.busterResources);

    session._bayeux.attach(this.server.httpServer);
    session._bayeux.addExtension({
        incoming: function (message, callback) {
            if (message.channel == "/session-owner") {
                self.logger.debug("Setting session owner to " + message.clientId);
                self.sessionOwnerFayeClientId = message.clientId;
            }

            callback(message);
        }
    });
    session._bayeux.bind("disconnect", function (clientId) {
        if (clientId == self.sessionOwnerFayeClientId) {
            self.logger.debug("Deleting current session (" + session.id + "), due to death of session owner " + clientId);
            self.destroySession(session.id);
        }
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
    this.emit("session:start", this.sessions[0]);
}

function failWithMessage(res, message) {
    res.writeHead(500);
    res.write(message + "\n");
    res.end();
}