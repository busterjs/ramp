var faye = require("faye");
var when = require("when");
var bCaptureServerPubsubClient = require("./pubsub-client.js");

module.exports = {
    create: function (opts) {
        var instance = Object.create(this);
        instance._opts = opts;
        return instance;
    },

    connect: function () {
        var deferred = when.defer();

        this._pubsubClient = bCaptureServerPubsubClient.create({
            host: this._opts.host,
            port: this._opts.port,
            contextPath: this._opts.session.messagingPath
        });

        this._pubsubClient.connect().then(function () {
            this._onInitialize();
            deferred.resolve();
        }.bind(this), deferred.reject);

        return deferred.promise;
    },

    emit: function (eventName, message) {
        this._pubsubClient.emit(eventName, message);
    },

    on: function (eventName, handler) {
        this._pubsubClient.on(eventName, handler);
    },

    disconnect: function () {
        this._pubsubClient.disconnect();
    },

    end: function () {
        this._pubsubClient.emit("end");
    },

    _getInitData: function () {
        return {
            isOwner: this._opts.owner === true
        };
    },

    _onInitialize: function () {
        this._pubsubClient.emit("initialize", this._getInitData());
    }
};