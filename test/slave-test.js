var buster = require("buster-node");1
var assert = buster.assert;
var refute = buster.refute;
var ramp = require("../lib/ramp")

var when = require("when");
var th = require("./test-helper.js");

buster.testCase("Slave", {
    setUp: function () {
        return th.setUpHelpers(this, [th.ph, th.rs]);
    },

    tearDown: function () {
        return th.tearDownHelpers(this);
    },

    "should be able to get slaves": function (done) {
        th.capture(this, function (rc) {
            rc.getSlaves().then(
                done(function (slaves) {
                    assert.equals(slaves.length, 1);
                    assert(slaves[0].id);
                    assert.match(slaves[0].userAgent, /phantom/i);
                }),
                th.failWhenCalled
            );
        });
    },

    "should be able to load chains for a slave": function (done) {
        var self = this;

        th.capture(this, function (rc) {
            rc.getSlaves().then(
                function (slaves) {
                    var slave = slaves[0];
                    assert(slave.chainsPath)
                    th.httpGet(self.rs.serverUrl + slave.chainsPath, done(function (res, body) {
                        assert.equals(res.statusCode, 200);
                    }))
                },
                th.failWhenCalled
            );
        });
    }
});
