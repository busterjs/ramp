var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCaptureServer = require("../lib/buster-capture-server");
var server = require("../lib/server");

buster.testCase("buster-capture-server", {
    "should create server": function () {
        var s = bCaptureServer.createServer();
        assert(server.isPrototypeOf(s));
    }
});