var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var rampResources = require("ramp-resources");
var h = require("./test-helper");

buster.testCase("Events", {
    setUp: function (done) {
        this.serverBundle = h.createServerBundle(0, this, done);
    },

    tearDown: function (done) {
        this.serverBundle.tearDown(done);
    },

    "test posting events from session": function (done) {
        var self = this;

        this.p.capture(function (e, phantom) {
            var rs = rampResources.resourceSet.create();
            rs.addResource({
                path: "/test.js",
                content: 'buster.emit("some:event", 123);'
            });
            rs.loadPath.append("/test.js");

            self.c.createSession(rs).then(function (sessionClient) {
                sessionClient.on("some:event", done(function (e) {
                    assert.equals(e.data, 123);
                }));
            });
        });
    },

    "test subscribing to events from session": function (done) {
        var self = this;
        this.p.capture(function (e, phantom) {
            var rs = rampResources.resourceSet.create();
            rs.addResource({
                path: "/test.js",
                content: [
                    'buster.on("some:event", function (e) {',
                    '    buster.emit("other:event", e.data);',
                    '});'].join("\n")
            });
            rs.loadPath.append("/test.js");

            self.c.createSession(rs).then(function (sessionClient) {
                sessionClient.onLoad(function () {
                    sessionClient.on("other:event", done(function (e) {
                        assert.equals(e.data, 123);
                    }));
                    sessionClient.emit("some:event", 123);
                });
            });
        });
    },
});
