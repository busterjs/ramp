var bCore = require("buster-core");
var when = require("when");
var http = require("http");
var net = require("net");
var bCapServPubsubClient = require("./pubsub-client.js");
var bCapServSessionClient = require("./session-client.js");
var buster = require("buster");

module.exports = {
    create: function (port, host) {
        var instance = buster.create(this);
        instance.serverHost = host;
        instance.serverPort = port;

        instance._pubsubClient = bCapServPubsubClient.create({
            host: host,
            port: port
        });
        instance.disconnect = instance._pubsubClient.disconnect;
        instance.on = instance._pubsubClient.on;
        instance.emit = instance._pubsubClient.emit;

        return instance;
    },

    connect: function () {
        var d = when.defer();
        var socket = new net.Socket();
        socket.connect(this.serverPort, this.serverHost);

        socket.on("connect", function () {
            socket.destroy();
            this._pubsubClient.connect().then(d.resolve, d.reject);
        }.bind(this));

        socket.on("error", function (e) { d.reject(e); });
        return d.promise;
    },

    createSession: function (resourceSet, opts) {
        var self = this;
        var deferred = when.defer();
        opts = opts || {};

        if (opts.cache) {
            delete opts.cache;
            this._request("GET", "/resources", function (res, body) {
                if (res.statusCode === 200) {
                    self._createSession(resourceSet, opts, JSON.parse(body), deferred);
                } else {
                    deferred.reject("Unable to get caches from server, unknown reason.");
                }
            }).end();
        } else {
            self._createSession(resourceSet, opts, null, deferred);
        }

        return deferred.promise;
    },

    _createSession: function (resourceSet, opts, cacheManifest, deferred) {
        var self = this;
        resourceSet.serialize(cacheManifest).then(function (sResourceSet) {
            opts.resourceSet = sResourceSet;
            self._request("POST", "/sessions", function (res, body) {
                body = JSON.parse(body);

                if (res.statusCode === 201) {
                    var sessionClient = bCapServSessionClient._create(
                        body,
                        self._pubsubClient
                    );
                    deferred.resolve(sessionClient);
                } else {
                    deferred.reject(body);
                }
            }).end(JSON.stringify(opts));
        }, deferred.reject);
    },

    clearCache: function () {
        var deferred = when.defer();

        this._request("DELETE", "/resources", function (res, body) {
            deferred.resolve();
        }).end();

        return deferred.promise;
    },

    setHeader: function (resourceSet, height) {
        var deferred = when.defer();
        var req = this._request("POST", "/header", function (res, body) {
            deferred.resolve();
        });
        resourceSet.serialize().then(function (srs) {
            req.end(JSON.stringify({
                resourceSet: srs,
                height: height
            }));
        }, deferred.reject);

        return deferred.promise;
    },

    _request: function (method, path, cb) {
        opts = {};
        opts.method = method;
        opts.path = path;
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
