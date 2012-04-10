var server = require("./server");
var serverClient = require("./server-client");
var sessionClient = require("./session-client");

module.exports = {
    createServer: function () {
        return server.create();
    },

    createServerClient: function (opts) {
        return serverClient.create(opts);
    },

    createSessionClient: function (opts) {
        return sessionClient.create(opts);
    }
};