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
                        this.sessions.splice(i, 1);
                        this.emit("session:end");
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

        var session = {};
        session.rootPath = "/sessions/" + (++this.sessionId);
        this.sessions.push(session);

        var requestBody = "";
        req.on("data", function (chunk) { requestBody += chunk.toString("utf8") });
        req.on("end", function () {
            var data = JSON.parse(requestBody);
            session.resources = data.resources;
            session.load = data.load;
            session.rootResource = data.rootResource;
            session.resourceContextPath = session.rootPath + "/resources";

            if (!("/" in session.resources)) {
                session.resources["/"] = {
                    content: "<!DOCTYPE html><html><head></head><body></body></html>",
                    headers: {"Content-Type": "text/html"}
                };
            }

            session.resources["/"].content = self.injectScriptsIntoHtml(session, session.resources["/"].content);

            res.writeHead(self.sessions.length > 1 ? 202 : 201, {"Location": session.rootPath});
            res.write(JSON.stringify({
                rootPath: session.rootPath,
                resourceContextPath: session.resourceContextPath
            }));
            res.end();
        });
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