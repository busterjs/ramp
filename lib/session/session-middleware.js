var buster = require("buster-core");
var busterSessionMiddlewareSession = require("./session");

module.exports = {
    respond: function (req, res) {
        if (req.method == "POST" && req.url == "/sessions") {
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
        this.logger.debug("Session data", data)
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

    get sessions() {
        if (!this._sessions) this._sessions = [];
        return this._sessions;
    }
};

for (var k in buster.eventEmitter) module.exports[k] = buster.eventEmitter[k];

function unloadSession(i) {
    var session = this.sessions[i];
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
    this.logger.debug("Creating session via HTTP request");
    
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
    res.write(JSON.stringify(session.toJSON()));
    res.end();
}

function createSessionWithData(data) {
    var session = busterSessionMiddlewareSession.create(data, this.resourceMiddleware, this.server);
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