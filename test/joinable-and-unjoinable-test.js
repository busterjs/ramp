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

    "joining a joinable session": function (done) {
        var self = this;

        this.p.capture(function (e, phantom) {
            var rs = rampResources.resourceSet.create();
            self.c.createSession(rs).then(function (sessionClient) {
                sessionClient.onSlaveCaptured(done(function (e) {
                    assert.equals(e.slaves.length, 2);
                }));
            });

            self.p.capture(function (e, phantom) {});
        });
    },

    "starting a non-joinable session with no slaves captured": function (done) {
        var rs = rampResources.resourceSet.create();
        this.c.createSession(rs, {joinable: false}).then(function (sessionClient) {
            sessionClient.onAbort(done(function (e) {
                assert(e.error);
            }));
        });
    },

    "// does not join non joinable session": function (done) {
        var self = this;

        this.p.capture(function (e, phantom) {
            var rs = rampResources.resourceSet.create();
            self.c.createSession(rs, {joinable: false}).then(function (sessionClient) {
                self.p.capture(function (e, phantom) {
                    // TODO: Implement this.
                    assert.equals(self.c.slaves.length, 1);
                });
            });
        });
    }
});
