var faye = require("buster-faye");

exports.create = function (logger, messagingContextPath) {
    var bayeuxServer = new faye.NodeAdapter({mount: messagingContextPath, timeout: 1});
    bayeuxServer.setLogger = function (newLogger) { logger = newLogger; }
    bayeuxServer.addExtension({
        incoming: function (message, callback) {
            logBayeuxMessage("[BAYEUX IN ]", message)
            return callback(message);
        },

        outgoing: function (message, callback) {
            logBayeuxMessage("[BAYEUX OUT]", message)
            return callback(message);
        }
    });

    function logBayeuxMessage(prefix, message) {
        if (message.channel == "/meta/connect") return;

        logger.debug(prefix, message.channel, message);
    }

    return bayeuxServer;
};