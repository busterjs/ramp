var url = require("url");
var scriptServingMiddleware = require("../script-serving-middleware");
var proxyMiddleware = require("../http-proxy");
var parser = require("uglify-js").parser;
var uglify = require("uglify-js").uglify;

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

        var path, resource;

        for (path in this.resources) {
            resource = this.getResource(path);

            if (this.serveResourceContent(path, resource, req, res)) {
                return true;
            } else if (this.serveProxyRequest(path, resource, req, res)) {
                return true;
            }
        }
    },

    serveResourceContent: function (path, resource, req, res) {
        if (typeof resource.content != "string" ||
            this.resourceContextPath + path != req.url) {
            return;
        }

        res.writeHead(200, this.headersForResource(path, resource));
        res.write(resource.content);
        res.end();
        return true;
    },

    serveProxyRequest: function (path, resource, req, res) {
        if (!resource.proxy ||
            req.url.indexOf(this.resourceContextPath + path) != 0) {
            return;
        }

        resource.proxy.respond(req, res);
        return true;
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
    },

    getResource: function (path) {
        var resource = this.resources[path];

        if (resource.backend && !resource.proxy) {
            var parsed = url.parse(resource.backend);
            resource.proxy = proxyMiddleware.create(
                parsed.hostname, parsed.port, parsed.path);
            resource.proxy.proxyPath = this.resourceContextPath;
        }

        if (resource.combine && !resource.content) {
            resource.content = this.combineResources(resource.combine);
        }

        if (resource.minify) {
            resource.content = this.minify(resource.content);
        }

        return resource;
    },

    combineResources: function (resources) {
        var content = "";

        for (var i = 0, l = resources.length; i < l; ++i) {
            content += this.getResource(resources[i]).content;
        }

        return content;
    },

    minify: function (content) {
        var ast = parser.parse(content);
        ast = uglify.ast_mangle(ast);
        ast = uglify.ast_squeeze(ast);

        return uglify.gen_code(ast);
    }
};
