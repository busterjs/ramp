var bCore = require("buster-core");
var when = require("when");
var http = require("http");
var bCapServPubsubClient = require("./pubsub-client.js");

module.exports = {
    create: function (port, host) {
        var instance = Object.create(this);
        instance.serverHost = host;
        instance.serverPort = port;

        instance._pubsubClient = bCapServPubsubClient.create({
            host: host,
            port: port
        });
        instance._pubsubClient.extend(instance);

        return instance;
    },

    createSession: function (resourceSet, opts) {
        var self = this;
        var deferred = when.defer();
        opts = opts || {};

        this._getCachedResources(opts.cache).then(function (cache) {
            delete opts.cache;
            resourceSet.serialize(cache).then(function (serializedResourceSet) {
                self._sessionToServer(serializedResourceSet, opts, deferred);
            }, function (err) {
                deferred.reject(err);
            });
        }, function (err) {
            deferred.reject(err);
        });

        return deferred.promise;
    },

    _sessionToServer: function (serializedResourceSet, sessionOpts, deferred) {
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

        var sessionData = {};
        buster.extend(sessionData, sessionOpts);
        buster.extend(sessionData, {resourceSet: serializedResourceSet});

        req.end(JSON.stringify(sessionData));
    },

    _getCachedResources: function (performCache) {
        var deferred = when.defer();

        if (performCache) {
            var opts = {
                method: "GET",
                path: "/resources"
            };
            this._request(opts, function (res, body) {
                // deferred.resolve();
                deferred.resolve(JSON.parse(body));
            }).end();
        } else {
            deferred.resolve();
        }

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
