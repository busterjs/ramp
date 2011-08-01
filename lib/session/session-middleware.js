var buster = require("buster-core");
var busterSessionMiddlewareSession = require("./session");

module.exports = {
    respond: function (req, res) {
        if (req.method == "POST" && req.url == "/sessions") {
            this.createSessionFromRequest(req, res);
            return true;
        }

        for (var i = 0, ii = this.sessions.length; i < ii; i++) {
            var session =  this.sessions[i];

            if (req.url == session.rootPath && req.method == "DELETE") {
                this.unloadSession(i);
                res.writeHead(200);
                res.end();
                return true;
            }
        }
    },

    createSessionFromRequest: function (req, res) {
        var self = this;

        var requestBody = "";
        req.on("data", function (chunk) { requestBody += chunk.toString("utf8") });
        req.on("end", function () {
            self.createSessionWithRequestBody(requestBody, req, res);
        });
    },

    createSessionWithRequestBody: function (requestBody, req, res) {
        try {
            var data = JSON.parse(requestBody);
        } catch(e) {
            return this.failWithMessage(res, "Invalid JSON");
        }

        var error = busterSessionMiddlewareSession.validate(data);
        if (error) return this.failWithMessage(res, error);

        try {
            var session = this.createSessionWithData(data);
        } catch (e) {
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
    },

    createSessionWithData: function (data) {
        if (!("sessionId" in this)) this.sessionId = 0;
        var session = busterSessionMiddlewareSession.create(++this.sessionId, data, this.resourceMiddleware, this.multicast);
        this.sessions.push(session);
        if (this.sessions.length == 1) this.loadSession();
        return session;
    },

    createSession: function (data) {
        var error = busterSessionMiddlewareSession.validate(data);
        if (error) throw new Error(error);
        return this.createSessionWithData(data);
    },

    destroySession: function (id) {
        for (var i = 0, ii = this.sessions.length; i < ii; i++) {
            var session = this.sessions[i];
            if (session.id == id) {
                this.unloadSession(i);
                break;
            }
        }
    },

    loadSession: function () {
        this.emit("session:start", this.sessions[0]);
    },

    unloadSession: function (i) {
        this.resourceMiddleware.removeResourceSet(this.sessions[i].resourceSet);
        this.sessions.splice(i, 1);

        // Did we unload the current session?
        if (i == 0) {
            this.emit("session:end");
            if (this.sessions.length > 0) {
                this.loadSession();
            }
        }
    },

    failWithMessage: function (res, message) {
        res.writeHead(500);
        res.write(message + "\n");
        res.end();
    },

    get sessions() {
        if (!this._sessions) this._sessions = [];
        return this._sessions;
    }
};

for (var k in buster.eventEmitter) module.exports[k] = buster.eventEmitter[k];