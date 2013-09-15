var buster = require("buster-node");
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

    "capturing one browser": function (done) {
        var self = this;

        th.capture(this, function () {
            th.http("GET", self.rs.serverUrl + "/slaves", done(function (res, body) {
                assert.equals(res.statusCode, 200);
                var body = JSON.parse(body);
                assert.equals(body.length, 1)
                assert(body[0].id);
                assert(body[0].userAgent);
                assert.match(body[0].userAgent, /phantomjs/i);
            }));
        });
    },

    "capturing two browsers": function (done) {
        var self = this;

        var slaveADeferred = when.defer();
        th.capture(this, slaveADeferred.resolve);

        var slaveBDeferred = when.defer();
        th.capture(this, slaveBDeferred.resolve);

        when.all([slaveADeferred.promise, slaveBDeferred.promise]).then(function () {
            th.http("GET", self.rs.serverUrl + "/slaves", done(function (res, body) {
                assert.equals(res.statusCode, 200);
                var body = JSON.parse(body);
                assert.equals(body.length, 2)
            }))
        });
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
                    return th.http("GET", self.rs.serverUrl + "/capture");
                },
                function (e) {
                    assert.equals(e.res.statusCode, 302);
                    return th.http("GET", self.rs.serverUrl + e.res.headers.location);
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
    },

    "should kill slave when browser dies": function (done) {
        var  self = this;
        var rc = this.rs.createRampClient();

        th.capture(this, function (rc, page) {
            function tryGettingSlaves() {
                rc.getSlaves().then(function (slaves) {
                    if (slaves.length === 0) {
                        assert(true);
                        done();
                    } else {
                        tryGettingSlaves();
                    }
                });
            };

            self.ph.closePage(page);
            tryGettingSlaves();
        });
    }
});
