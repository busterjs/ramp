var buster = require("buster-node");
var assert = buster.assert;
var refute = buster.refute;
var rampResources = require("ramp-resources");
var ramp = require("../lib/ramp")

var when = require("when");
var mori = require("mori");
var when_pipeline = require("when/pipeline");
var th = require("./test-helper.js");

buster.testCase("Test helper", {
    setUp: function () {
        return th.setUpHelpers(this, [th.ph, th.rs]);
    },

    tearDown: function () {
        return th.tearDownHelpers(this);
    },

    "should be able to capture mock slave": function (done) {
        var self = this;
        var rc = this.rs.createRampClient();
        var capturedSlave;

        th.promiseSuccess(
            when_pipeline([
                function () {
                    return ramp.testHelper.captureSlave(self.rs.port, "My User Agent");
                },
                function (actualCapturedSlave) {
                    capturedSlave = actualCapturedSlave;
                    return rc.getSlaves();
                },
                function (slaves) {
                    assert.equals(slaves.length, 1);
                    assert.equals(capturedSlave.slave, slaves[0]);
                    assert.equals(capturedSlave.slave.userAgent, "My User Agent");
                }
            ]),
            function () {
                capturedSlave.teardown();

                function pollSlaves() {
                    rc.getSlaves().then(
                        function (slaves) {
                            if (slaves.length === 0) {
                                done();
                            } else {
                                pollSlaves();
                            }
                        });
                }
                pollSlaves();
            })
    }
});
