var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var rampResources = require("ramp-resources");
var h = require("./helpers/test-helper");

buster.testRunner.timeout = 4000;
buster.testCase("Joinable and unjoinable", {
    setUp: function (done) {
        this.serverBundle = h.createServerBundle(0, this, done);
    },

    tearDown: function (done) {
        this.serverBundle.tearDown(done);
    },

    "starting a session with no slaves captured": function (done) {
        var rs = rampResources.resourceSet.create();
        this.c.createSession(rs, {}).then(function (sessionClient) {
            sessionClient.onAbort(done(function (e) {
                assert(e.error);
            }));
        });
    }
});
