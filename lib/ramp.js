var rampServer = require("./ramp-server.js");
var rampClient = require("./ramp-client.js");
var testHelper = require("./test-helper.js");

module.exports = {
    createServer: function (opts) {
        return rampServer.createServer(opts || {});
    },

    createRampClient: function (port, host) {
        return rampClient.createRampClient(port, host);
    },

    testHelper: testHelper
};
