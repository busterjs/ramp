var faye = require("faye");

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
        instance._serverSideFayeClient = instance._fayeAdapter.getClient();
        return instance;
    },

    setLogger: function (logger) {
        this.logger = logger;
    },

    getClient: function () {
        return this._serverSideFayeClient;
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