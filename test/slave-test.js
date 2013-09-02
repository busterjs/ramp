var buster = require("buster-node");1
var assert = buster.assert;
var refute = buster.refute;
var ramp = require("../lib/ramp")

var when = require("when");
var when_pipeline = require("when/pipeline");
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

        th.promiseSuccess(
            when_pipeline([
                function () {
                    return th.httpGet(self.rs.serverUrl + "/capture");
                },
                function (e) {
                    assert.equals(e.res.statusCode, 302);
                    return th.httpGet(self.rs.serverUrl + e.res.headers.location);
                },
                function (e) {
                    assert.equals(e.res.statusCode, 200);
                    assert.match(e.body, /\<frameset/);
                }
            ]).then(done));
    },

    "should create new slave when loading chains for already active slave": function (done) {
        var self = this;

        this.ph.createPage(function (page1) {
            page1.open(self.rs.captureUrl, function (status) {
                page1.get("url", function (slave1Url) {
                    self.ph.createPage(function (page2) {
                        page2.open(slave1Url, function (status) {
                            page2.get("url", done(function (slave2Url) {
                                refute.equals(slave1Url, slave2Url);
                                assert.match(slave2Url, /\/slaves\/[^\/]+\/chains/)
                            }));
                        });
                    });

                    // var rc = ramp.createRampClient(test.rs.port);
                    // ensureSlavePresent(rc, slaveId, page, cb);
                });
            });
        });
    }
});
