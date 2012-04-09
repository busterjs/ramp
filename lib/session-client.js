var when = require("when");
var bCaptureServerPubsubClient = require("./pubsub-client.js");

module.exports = {
    create: function (opts) {
        var instance = Object.create(this);
        instance._opts = opts;
        instance._pubsubClient = bCaptureServerPubsubClient.create({
            host: instance._opts.host,
            port: instance._opts.port,
            contextPath: instance._opts.session.messagingPath,
            onConnect: function () {
                this._onInitialize()
            }.bind(instance)
        });
        instance._pubsubClient.extend(instance);
        return instance;
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