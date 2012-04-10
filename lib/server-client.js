var when = require("when");
var http = require("http");
var URL = require("url");
var buster = require("buster-core");
var bResources = require("buster-resources");
var bCaptureServerPubsubClient = require("./pubsub-client.js");

module.exports = {
    create: function (opts) {
        var instance = Object.create(this);
        instance.serverHost = opts.host;
        instance.serverPort = opts.port;

        instance._pubsubClient = bCaptureServerPubsubClient.create({
            host: opts.host,
            port: opts.port,
            fayeClient: opts.fayeClient
        });
        instance._pubsubClient.extend(instance);

        return instance;
    },

    createSession: function (sessionData) {
        var self = this;
        var deferred = when.defer();

        if (sessionData.resourceSet) {
            this._getCachedResources(sessionData.cache).then(function (cache) {
                delete sessionData.cache;
                sessionData.resourceSet.serialize(cache).then(function (rsSrl) {
                    sessionData.resourceSet = rsSrl;
                    self._sessionToServer(sessionData, deferred);
                }, function (err) {
                    deferred.reject(err);
                });
            }, function (err) {
                deferred.reject(err);
            });
        } else {
            this._sessionToServer(sessionData, deferred);
        }

        return deferred.promise;
    },

    _sessionToServer: function (sessionData, deferred) {
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