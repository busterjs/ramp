var bane = require("bane");
var faye = require("faye");
var PubSubClient = require("./pubsub-client");
var when = require("when");

var NOOP = function () {};

function logBayeuxMessage(logger, prefix, message) {
    if (message.channel === "/meta/connect") { return; }
    logger.debug(prefix, message.channel, message);
}

module.exports = bane.createEventEmitter({
    logger: { error: NOOP, warn: NOOP, log: NOOP, info: NOOP, debug: NOOP },

    create: function (messagingContextPath) {
        var instance = Object.create(this);

        instance._fayeAdapter = new faye.NodeAdapter({
            mount: messagingContextPath,
            timeout: 1
        });
        instance._fayeAdapter.addExtension({
            incoming: function (message, callback) {
                logBayeuxMessage(instance.logger, "[BAYEUX IN ]", message);
                return callback(message);
            },

            outgoing: function (message, callback) {
                logBayeuxMessage(instance.logger, "[BAYEUX OUT]", message);
                return callback(message);
            }
        });

        instance._pubSubClients = {};

        instance._listenToPubsubClientInitialization();
        instance._listenToFayeDisconnect();

        return instance;
    },

    createClient: function (opts) {
        return new PubSubClient(this._fayeAdapter.getClient(), opts);
    },

    attach: function (httpServer) {
        this._fayeAdapter.attach(httpServer);
    },

    onDisconnect: function (clientId) {
        var deferred = when.defer();

        var clientData = this._pubSubClients[clientId];
        if (clientData) {
            clientData.onDisconnectDeferreds.push(deferred);
        } else {
            deferred.resolve();
        }

        return deferred.promise;
    },

    _listenToPubsubClientInitialization: function () {
        this._fayeAdapter.getClient().subscribe("/initialize/*", function () {});
        this._fayeAdapter.addExtension({
            incoming: function (message, callback) {
                if (/^\/initialize/.test(message.channel)) {
                    this._pubSubClients[message.data.id] = {
                        fayeClientId: message.clientId,
                        onDisconnectDeferreds: []
                    };
                }

                callback(message);
            }.bind(this)
        });
    },

    _listenToFayeDisconnect: function () {
        this._fayeAdapter.bind("disconnect", function (fayeClientId) {
            for (var clientId in this._pubSubClients) {
                var clientData = this._pubSubClients[clientId];
                if (clientData.fayeClientId === fayeClientId) {
                    clientData.onDisconnectDeferreds.forEach(function (d) {
                        d.resolve();
                    });
                    delete this._pubSubClients[clientId];
                    this.emit("client:disconnect", clientId);
                }
            }
        }.bind(this));
    }
});
