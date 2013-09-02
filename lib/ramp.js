var rampServer = require("./ramp-server.js");
var rampClient = require("./ramp-client.js");
var testHelper = require("./test-helper.js");

module.exports = {
    createRampServer: function (opts) {
        return rampServer.createRampServer(opts);
    },

    createRampClient: function (port, host) {
        return rampClient.createRampClient(port, host);
    },

    testHelper: testHelper
};
