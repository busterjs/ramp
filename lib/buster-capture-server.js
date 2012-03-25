var server = require("./server");
var serverClient = require("./server-client");
var sessionClient = require("./session-client");

module.exports = {
    createServer: function () {
        return server.create();
    },

    createServerClient: function (host, port) {
        return serverClient.create(host, port);
    },

    createSessionClient: function (host, port, opts) {
        return sessionClient.create(host, port, opts);
    }
};