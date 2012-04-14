if (typeof module === "object" && typeof require === "function") {
    var when = require("when");
    buster.captureServer.pubsubClient = require("./pubsub-client.js");
}

(function () {
    buster.captureServer = buster.captureServer || {};
    buster.captureServer.sessionClient = {
        create: function (opts) {
            var instance = Object.create(this);
            instance._opts = opts;
            instance._pubsubClient = buster.captureServer.pubsubClient.create({
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
                isOwner: this._opts.owner === true,
                pubsubClientId: this._pubsubClient.id
            };
        },

        _onInitialize: function () {
            this._pubsubClient.emit("initialize", this._getInitData());
        }
    };

    if (typeof module === "object" && typeof require === "function") {
        module.exports = buster.captureServer.sessionClient;
    }
}());