var uuid = require("node-uuid");
var when = require("when");
var httpServerRequestListenerProxy = require("./http-server-request-listener-proxy");
var bCaptureServerPubsubClient = require("./pubsub-client");

module.exports = buster.extend(buster.eventEmitter.create(), {
    create: function (pubsubClient) {
        var instance = Object.create(this);
        instance._id = uuid();
        instance._isReady = false;
        instance.prisonPath = "/slaves/" + instance._id + "/prison";
        return instance;
    },

    attach: function (httpServer, pubsubClient) {
        httpServerRequestListenerProxy.attach(httpServer, this._respond.bind(this));

        this._pubsubClient = pubsubClient;
        this._pubsubClient.on(
            "slave:" + this._id + ":session:loaded",
            this._onSessionLoaded.bind(this)
        );
        this._pubsubClient.on(
            "slave:" + this._id + ":session:unloaded",
            this._onSessionUnloaded.bind(this)
        );
        this._pubsubClient.on(
            "slave:" + this._id + ":imprisoned",
            this._onImprisoned.bind(this)
        );
    },

    prepare: function () {
        var deferred = when.defer();

        if (this._isReady) {
            deferred.resolve();
        } else {
            this._imprisonmentDeferred = deferred;
        }

        return deferred.promise;
    },

    serialize: function () {
        return {
            prisonPath: this.prisonPath
        }
    },

    loadSession: function (session) {
        this._loadSessionDeferred = when.defer();
        this._pubsubClient.emit("slave:" + this._id + ":session:load", session);
        return this._loadSessionDeferred;
    },

    unloadSession: function () {
        this._unloadSessionDeferred = when.defer();
        this._pubsubClient.emit("slave:" + this._id + ":session:unload");
        return this._unloadSessionDeferred;
    },

    _respond: function (req, res) {
        if (req.method === "GET" && req.url == this.prisonPath) {
            res.writeHead(200);
            res.end();
        }
    },

    _onSessionLoaded: function () {
        this._loadSessionDeferred.resolve();
    },

    _onSessionUnloaded: function () {
        this._unloadSessionDeferred.resolve();
    },

    _onImprisoned: function () {
        this._imprisonmentDeferred.resolve();
    }
});