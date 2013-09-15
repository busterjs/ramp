var buster = require("buster-node");
var assert = buster.assert;
var refute = buster.refute;

var ramp = require("./../lib/ramp");
var th = require("./test-helper.js");

buster.testCase("Slave reloading on server restart", {
    setUp: function () {
        return th.setUpHelpers(this, [th.ph]);
    },

    tearDown: function () {
        return th.tearDownHelpers(this);
    },

    "should work": function (done) {
        var self = this;

        th.spawnServer(0, function (port, rampServerUrl, process) {
            // Pretending to be th.rs.
            self.rs = {captureUrl: rampServerUrl + "/capture", port: port, createRampClient: function () {
                return ramp.createRampClient(port);
            }};

            th.capture(self, function (rc, page) {
                process.kill("SIGKILL");
                process.on("exit", function () {
                    th.spawnServer(port, function (port, rampServerUrl, process) {
                        var rc2 = ramp.createRampClient(port);

                        function tryGettingSlaves() {
                            rc2.getSlaves().then(function (slaves) {
                                if (slaves.length === 1) {
                                    assert(true);
                                    done();
                                } else {
                                    tryGettingSlaves();
                                }
                            }, function () {
                                tryGettingSlaves();
                            });
                        };

                        tryGettingSlaves();
                    });
                })
            });
        });
    }
})
