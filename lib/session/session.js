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

    respond: function (req, res) {
        if (req.url == this.rootPath + "/env.js") {
            this.hostEnvironmentScript(req, res);
            return true;
        }

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

    hostEnvironmentScript: function (req, res) {
        res.writeHead(200, {"Content-Type": "text/javascript"});
        res.write("var buster = " + JSON.stringify({
            rootPath: this.rootPath,
            resourceContextPath: this.resourceContextPath
        }) + ";");
        res.end();
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
        scripts.push(this.rootPath + "/env.js");
        for (var i = 0, ii = this.load.length; i < ii; i++) {
            scripts.push(this.resourceContextPath + this.load[i]);
        }

        for (var i = 0, ii = scripts.length; i < ii; i++) {
            scriptsHtml += '<script src="' + scripts[i] + '" type="text/javascript"></script>';
        }

        return beforeBodyEnd + scriptsHtml + afterBodyEnd;
    }
};