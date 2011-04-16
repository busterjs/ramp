var scriptServingMiddleware = require("./../script-serving-middleware");

module.exports = {
    create: function (sessionId, data) {
        var session = Object.create(this);
        session.id = sessionId;

        session.resources = data.resources;
        session.load = data.load;
        session.rootResource = data.rootResource;
        session.rootPath = "/sessions/" + session.id;
        session.resourceContextPath = session.rootPath + "/resources";

        if (!("/" in session.resources)) {
            session.resources["/"] = {
                content: "<!DOCTYPE html><html><head></head><body></body></html>",
                headers: {"Content-Type": "text/html"}
            };
        }

        session.resources["/"].content = session.injectScriptsIntoHtml(session.resources["/"].content);

        return session;
    },

    /*
     * Takes the data for a session. Returns a string with an error message, or
     * nothing (undefined) if there was no error.
     */
    validate: function (data) {
        if (!data.hasOwnProperty("resources")) {
            return "Missing property 'resources'.";
        }

        if (!data.hasOwnProperty("load")) {
            return "Missing property 'load'.";
        }

        for (var i = 0, ii = data.load.length; i < ii; i++) {
            var resourceFound = false;
            for (var resource in data.resources) {
                if (data.load[i] == resource) resourceFound = true;
            }

            if (!resourceFound) {
                return "'load' entry '" + data.load[i] + "' missing corresponding 'resources' entry.";
            }
        }
    },

    respond: function (req, res) {
        if (this.scriptServingMiddleware.respond(req, res)) return true;

        for (var resourcePath in this.resources) {
            if (this.resourceContextPath + resourcePath == req.url) {
                var resource = this.resources[resourcePath];
                res.writeHead(200, this.headersForResource(resourcePath, resource));
                res.write(resource.content);
                res.end();
                return true;
            }
        }
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

    injectScriptsIntoHtml: function (html) {
        var bodyTag = "</body>";
        var beforeBodyEnd = html.slice(0, html.indexOf(bodyTag));
        var afterBodyEnd = html.slice(beforeBodyEnd.length + bodyTag.length);
        var scriptsHtml = "";

        var scripts = [];

        for (var i = 0, ii = this.scriptServingMiddleware.scripts.length; i < ii; i++) {
            scripts.push(this.rootPath + this.scriptServingMiddleware.scripts[i].path);
        }

        for (var i = 0, ii = this.load.length; i < ii; i++) {
            scripts.push(this.resourceContextPath + this.load[i]);
        }

        for (var i = 0, ii = scripts.length; i < ii; i++) {
            scriptsHtml += '<script src="' + scripts[i] + '" type="text/javascript"></script>\n';
        }

        return beforeBodyEnd + scriptsHtml + afterBodyEnd;
    },

    get scriptServingMiddleware() {
        return this._scriptServingMiddleware || this.createScriptServingMiddleware();
    },

    createScriptServingMiddleware: function () {
        var self = this;
        var middleware = Object.create(scriptServingMiddleware);
        middleware.contextPath = this.rootPath;
        middleware.requireFile(require.resolve("buster-core"));
        middleware.requireFile(require.resolve("./../browser/cross-frame"));
        middleware.requireFile(require.resolve("./../browser/client-frame-load"));

        return this._scriptServingMiddleware = middleware;
     }
};