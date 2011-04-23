var http = require("http");

module.exports = {
    create: function (host, port, path) {
        var proxy = Object.create(this);
        proxy.host = host;
        proxy.port = port;
        proxy.path = path || "";

        return proxy;
    },

    respond: function (req, res) {
        var backendRequest = http.request({
            host: this.host,
            port: this.port,
            path: this.path + req.url.replace(this.proxyPathRegexp, ""),
            method: req.method,
            headers: req.headers
        });

        req.on("data", function (chunk) {
            backendRequest.write(chunk);
        });

        req.on("end", function () {
            backendRequest.end();
            this.proxyBackendResponse(backendRequest, res);
        }.bind(this));

        backendRequest.on("error", function () {
            res.writeHead(503, { "Content-Type": "text/plain" });
            res.end("Proxy server at http://" + this.host + ":" + this.port +
                    this.path + " is unavailable");
        });
    },

    proxyBackendResponse: function (backendRequest, response) {
        backendRequest.on("response", function (res) {
            response.writeHead(res.statusCode, this.getHeaders(res));

            res.on("data", function (chunk) {
                response.write(chunk);
            });

            res.on("end", function () {
                response.end();
            });
        }.bind(this));
    },

    getHeaders: function (response) {
        var headers = response.headers;
        var location = headers.location;

        if (location) {
            location = this.proxyPath + headers.location;
            headers.location = location.replace(this.contextPathRegexp, "");
        }

        return headers;
    },

    get contextPathRegexp() {
        if (!this._regexp) {
            this._regexp = new RegExp("^" + this.path);
        }

        return this._regexp;
    },

    get path() {
        return this._path || "";
    },

    set path(path) {
        this._path = (path || "").replace(/\/?$/, "");
    },

    get proxyPathRegexp() {
        if (!this._proxyRegexp) {
            this._proxyRegexp = new RegExp("^" + this.proxyPath);
        }

        return this._proxyRegexp;
    },

    get proxyPath() {
        return this._proxyPath || "";
    },

    set proxyPath(path) {
        this._proxyPath = (path || "").replace(/\/?$/, "");
    }
};
