var when = require("when");
var http = require("http");
var URL = require("url");
var buster = require("buster-core");

module.exports = {
    create: function (host, port) {
        var instance = Object.create(this);
        instance.serverHost = host;
        instance.serverPort = port;
        return instance;
    },

    createSession: function (sessionData) {
        var deferred = when.defer();

        var opts = {
            method: "POST",
            path: "/sessions"
        };
        var req = this._request(opts, function (res, body) {
            try {
                body = JSON.parse(body)
            } catch (e) {
                body = {}
            }

            if (res.statusCode == 201) {
                deferred.resolve(body);
            } else {
                deferred.reject(body);
            }
        })
        req.end(JSON.stringify(sessionData));

        return deferred.promise;
    },

    _request: function (opts, cb) {
        opts.host = this.serverHost;
        opts.port = this.serverPort;

        return http.request(opts, function (res) {
            var body = "";
            res.setEncoding("utf8");
            res.on("data", function (chunk) { body += chunk; });
            res.on("end", function () { cb(res, body); });
        });
    }
};