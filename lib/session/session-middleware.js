var busterEventEmitter = require("buster-event-emitter");

module.exports = {
    respond: function (req, res) {
        if (req.method == "POST" && req.url == "/sessions") {
            this.createSession(req, res);
            return true;
        }

        for (var i = 0, ii = this.sessions.length; i < ii; i++) {
            var session =  this.sessions[i];

            if (req.url == session.rootPath + "/env.js") {
                this.hostEnvironmentScript(session, req, res);
                return true;
            }

            var startsWithSessionRoot = req.url.slice(0, session.rootPath.length) == session.rootPath;
            if (startsWithSessionRoot) {
                if (req.url == session.rootPath) {
                    if (req.method == "DELETE") {
                        this.unloadSession(i);
                        res.writeHead(200);
                        res.end();
                        return true;
                    }
                } else {
                    return this.serveResourceIfExists(session, req, res);
                }
            }
        }
    },

    createSession: function (req, res) {
        var self = this;
        if (!("sessionId" in this)) this.sessionId = 0;

        var requestBody = "";
        req.on("data", function (chunk) { requestBody += chunk.toString("utf8") });
        req.on("end", function () {
            try {
                var data = JSON.parse(requestBody);
            } catch(e) {
                return self.failWithMessage(res, "Invalid JSON");
            }

            if (!data.hasOwnProperty("resources")) {
                return self.failWithMessage(res, "Missing property 'resources'.");
            }

            if (!data.hasOwnProperty("load")) {
                return self.failWithMessage(res, "Missing property 'load'.");
            }

            for (var i = 0, ii = data.load.length; i < ii; i++) {
                var resourceFound = false;
                for (var resource in data.resources) {
                    if (data.load[i] == resource) resourceFound = true;
                }

                if (!resourceFound) {
                    return self.failWithMessage(res, "'load' entry '" + data.load[i] + "' missing corresponding 'resources' entry.");
                }
            }

            var session = {};
            session.resources = data.resources;
            session.load = data.load;
            session.rootResource = data.rootResource;
            self.sessions.push(session);
            session.rootPath = "/sessions/" + (++self.sessionId);
            session.resourceContextPath = session.rootPath + "/resources";

            if (!("/" in session.resources)) {
                session.resources["/"] = {
                    content: "<!DOCTYPE html><html><head></head><body></body></html>",
                    headers: {"Content-Type": "text/html"}
                };
            }

            session.resources["/"].content = self.injectScriptsIntoHtml(session, session.resources["/"].content);

            var statusCode;
            if (self.sessions.length > 1) {
                statusCode = 202;
            } else {
                statusCode = 201;
                self.loadSession();
            }

            res.writeHead(statusCode, {"Location": session.rootPath});
            res.write(JSON.stringify({
                rootPath: session.rootPath,
                resourceContextPath: session.resourceContextPath
            }));
            res.end();
        });
    },

    loadSession: function () {
        this.emit("session:start", this.sessions[0]);
    },

    unloadSession: function (i) {
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

    serveResourceIfExists: function (session, req, res) {
        for (var resourcePath in session.resources) {
            if (session.resourceContextPath + resourcePath == req.url) {
                var resource = session.resources[resourcePath];
                res.writeHead(200, this.headersForResource(resourcePath, resource));
                res.write(resource.content);
                res.end();
                return true;
            }
        }

        return false;
    },

    headersForResource: function (resourcePath, resource) {
        var headers = {};

        if ("headers" in resource) {
            for (var header in resource.headers) {
                headers[header] = resource.headers[header];
            }
        } else {
            headers["Content-Type"] = "text/javascript";
        }

        return headers;
    },

    hostEnvironmentScript: function (session, req, res) {
        res.writeHead(200, {"Content-Type": "text/javascript"});
        res.write("var buster = " + JSON.stringify({
            rootPath: session.rootPath,
            resourceContextPath: session.resourceContextPath
        }) + ";");
        res.end();
    },

    injectScriptsIntoHtml: function (session, html) {
        var bodyTag = "</body>";
        var beforeBodyEnd = html.slice(0, html.indexOf(bodyTag));
        var afterBodyEnd = html.slice(beforeBodyEnd.length + bodyTag.length);
        var scriptsHtml = "";

        var scripts = [];
        scripts.push(session.rootPath + "/env.js");
        for (var i = 0, ii = session.load.length; i < ii; i++) {
            scripts.push(session.resourceContextPath + session.load[i]);
        }

        for (var i = 0, ii = scripts.length; i < ii; i++) {
            scriptsHtml += '<script src="' + scripts[i] + '" type="text/javascript"></script>';
        }

        return beforeBodyEnd + scriptsHtml + afterBodyEnd;
    },

    get sessions() {
        if (!this._sessions) this._sessions = [];
        return this._sessions;
    }
};

for (var k in busterEventEmitter) module.exports[k] = busterEventEmitter[k];