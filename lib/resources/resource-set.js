var url = require("url");
var scriptServingMiddleware = require("../script-serving-middleware");
var resource = require("./resource");
var scriptInjectionProcessor = require("./processors/script-injector");
var proxyMiddleware = require("../http-proxy");

module.exports = {
    create: function (data) {
        var resourceSet = Object.create(this);

        resourceSet.resources = {};
        resourceSet.load = data.load || [];
        resourceSet.rootResource = data.rootResource;
        resourceSet.contextPath = data.contextPath || "";

        for (var key in data.resources) {
            resourceSet.addResource(key, data.resources[key]);
        }

        resourceSet.setUpRootResource();

        return resourceSet;
    },

    addResource: function (path, data) {
        var r = resource.create(path, data);
        this.resources[path] = r;

        if (path == "/") {
            if (!("Content-Type" in r.headers)) {
                r.headers["Content-Type"] = "text/html";
            }

            var p = Object.create(scriptInjectionProcessor);
            p.scripts = this.rootResourceScripts();
            r.addProcessor(p);
        }
    },

    setUpRootResource: function () {
        if (!("/" in this.resources)) {
            this.assignDefaultRootResource();
        }
    },

    assignDefaultRootResource: function () {
        this.addResource("/", {
            content: "<!DOCTYPE html><html><head></head><body></body></html>"
        });
    },

    /*
     * Takes the data for a resource set. Returns a string with an error message, or
     * nothing if there was no error.
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

        for (var resource in data.resources) {
            if ("content" in data.resources[resource]) {
                if (data.resources[resource].content instanceof Buffer) {
                    continue;
                }

                if (typeof(data.resources[resource].content) == "string") {
                    continue;
                } else {
                    return "The resource '" + resource + "' was not a string."
                }
            }
        }
    },

    respond: function (req, res) {
        if (this.internalScriptServer.respond(req, res)) return true;

        var path, resource;

        for (path in this.resources) {
            resource = this.getResource(path);

            if (this.serveResourceContent(path, resource, req, res)) return true;
            if (this.serveProxyRequest(path, resource, req, res)) return true;
        }
    },

    serveResourceContent: function (path, resource, req, res) {
        if (this.resourceContextPath() + path != req.url) {
            return;
        }

        res.writeHead(200, resource.getHeaders());
        res.write(resource.getContent());
        res.end();
        return true;
    },

    serveProxyRequest: function (path, resource, req, res) {
        if (!resource.proxy ||
            req.url.indexOf(this.resourceContextPath() + path) != 0) {
            return;
        }

        resource.proxy.respond(req, res);
        return true;
    },

    rootResourceScripts: function () {
        var scripts = [];

        for (var i = 0, ii = this.internalScriptServer.scripts.length; i < ii; i++) {
            scripts.push(this.internalsContextPath() + this.internalScriptServer.scripts[i].path);
        }

        for (var i = 0, ii = this.load.length; i < ii; i++) {
            scripts.push(this.resourceContextPath() + this.load[i]);
        }

        return scripts;
    },

    get internalScriptServer() {
        return this._internalScriptServer || this.createInternalScriptServer();
    },

    createInternalScriptServer: function () {
        var self = this;
        var middleware = Object.create(scriptServingMiddleware);
        middleware.contextPath = this.internalsContextPath();
        middleware.requireFile(require.resolve("buster-core"));
        middleware.requireFile(require.resolve("./../browser/cross-frame"));
        middleware.requireFile(require.resolve("./../browser/client-frame-load"));

        return this._internalScriptServer = middleware;
    },

    getResource: function (path) {
        var resource = this.resources[path];

        if (resource.backend && !resource.proxy) {
            var parsed = url.parse(resource.backend);
            resource.proxy = proxyMiddleware.create(
                parsed.hostname, parsed.port, parsed.path);
            resource.proxy.proxyPath = this.resourceContextPath();
        }

        if (resource.combine && !resource.content) {
            resource.content = this.combineResources(resource.combine);
        }

        return resource;
    },

    combineResources: function (resources) {
        var content = "";

        for (var i = 0, l = resources.length; i < l; ++i) {
            content += this.getResource(resources[i]).content + "\n";
        }

        return content;
    },

    resourceContextPath: function () {
        return this.contextPath + "/res";
    },

    internalsContextPath: function () {
        return this.contextPath + "/_";
    }
};
