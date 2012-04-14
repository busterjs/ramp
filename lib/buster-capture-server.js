var bCapServServer = require("./server");
var bCapServServerClient = require("./server-client");
var bCapServSessionClient = require("./session-client");

module.exports = {
    createServer: function () {
        return bCapServServer.create();
    },

    createServerClient: function (opts) {
        return bCapServServerClient.create(opts);
    },

    createSessionClient: function (opts) {
        return bCapServSessionClient.create(opts);
    }
};