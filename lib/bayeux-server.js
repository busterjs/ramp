var faye = require("faye");

    var pubsubClients = {};

module.exports = {
    create: function (logger, messagingContextPath) {
        var instance = Object.create(this);
        instance._logger = logger;

        instance._fayeAdapter = new faye.NodeAdapter({mount: messagingContextPath});
        instance._fayeAdapter.addExtension({
            incoming: function (message, callback) {
                logBayeuxMessage(instance._logger, "[BAYEUX IN ]", message)
                return callback(message);
            },

            outgoing: function (message, callback) {
                logBayeuxMessage(instance._logger, "[BAYEUX OUT]", message)
                return callback(message);
            }
        });

        instance._pubsubClients = {};
        instance._fayeAdapter.getClient().subscribe("/initialize/*", function (){});
        instance._fayeAdapter.addExtension({
            incoming: function (message, callback) {
                if (/^\/initialize/.test(message.channel)) {
                    instance._pubsubClients[message.data.id] = {
                        fayeClientId: message.clientId
                    };
                }
                callback(message);
            }
        });

        return instance;
    },

    setLogger: function (logger) {
        this.logger = logger;
    },

    getClient: function () {
        return this._fayeAdapter.getClient();
    },

    attach: function (httpServer) {
        this._fayeAdapter.attach(httpServer);
    },

    // UNTESTED BELOW. Will refactor very soon anyway.
    addExtension: function (extension) {
        this._fayeAdapter.addExtension(extension);
    },

    removeExtension: function (extension) {
        this._fayeAdapter.removeExtension(extension);
    },

    bind: function (event, handler) {
        this._fayeAdapter.bind(event, handler);
    },

    unbind: function (event, handler) {
        this._fayeAdapter.unbind(event, handler);
    }
};

function logBayeuxMessage(logger, prefix, message) {
    if (message.channel == "/meta/connect") return;

    logger.debug(prefix, message.channel, message);
}