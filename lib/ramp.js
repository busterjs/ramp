module.exports = {
    createServer: function (opts) {
        var rampServer = require("./ramp-server.js");
        return rampServer.createServer(opts || {});
    },

    createRampClient: function (port, host) {
        var rampClient = require("./ramp-client.js");
        return rampClient.createRampClient(port, host);
    },

    get testHelper() {
        return require("./test-helper.js");
    }
};
