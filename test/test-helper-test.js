var buster = require("buster-node");
var assert = buster.referee.assert;
var ramp = require("../lib/ramp");

var when = require("when");
var th = require("./test-helper.js");

buster.testCase("Test helper", {
    setUp: function () {
        return th.setUpHelpers(this, [th.ph, th.rs]);
    },

    tearDown: function () {
        return th.tearDownHelpers(this);
    },

    "should be able to capture mock slave": function () {
        // note: this gives random failures

        var self = this;
        var rc = this.rs.createRampClient();
        var capturedSlave;

        return ramp.testHelper.captureSlave(self.rs.port, "My User Agent")
            .then(function (actualCapturedSlave) {
                assert(actualCapturedSlave.slave, "No slave returned by captureSlave()");
                capturedSlave = actualCapturedSlave;
                return rc.getSlaves();
            })
            .then(function (slaves) {
                assert.equals(slaves.length, 1);
                assert(slaves[0], "No slave returned by getSlaves()");
                assert.equals(capturedSlave.slave, slaves[0]);
                assert.equals(capturedSlave.slave.userAgent, "My User Agent");
            })
            .then(function () {
                capturedSlave.teardown();

                function pollSlaves() {
                    return rc.getSlaves().then(function (slaves) {
                        if (slaves.length === 0) {
                            return true;
                        } else {
                            return pollSlaves();
                        }
                    });
                }

                return pollSlaves();
            })
    }
});
