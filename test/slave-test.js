"use strict";

var buster = require("buster-node");
var assert = buster.referee.assert;
var refute = buster.referee.refute;
var ramp = require("../lib/ramp");

var when = require("when");
var th = require("./test-helper.js");

buster.testCase("Slave", {
    setUp: function () {
        return th.setUpHelpers(this, [th.ph, th.rs]);
    },

    tearDown: function () {
        return th.tearDownHelpers(this);
    },

    "capturing one browser": function () {
        var self = this;

        return th.capture(this)
            .then(function () {
                return th.http("GET", self.rs.serverUrl + "/slaves");
            })
            .then(function (r) {
                var res = r.res;
                var body = r.body;
                assert.equals(res.statusCode, 200);
                body = JSON.parse(body);
                assert.equals(body.length, 1);
                assert(body[0].id);
                assert(body[0].userAgent);
                assert.match(body[0].userAgent, /phantomjs/i);
            });
    },

    "capturing two browsers": function () {
        var self = this;

        return when.all([th.capture(this), th.capture(this)])
            .then(function () {
                return th.http("GET", self.rs.serverUrl + "/slaves");
            })
            .then(function (r) {
                var res = r.res;
                var body = r.body;
                assert.equals(res.statusCode, 200);
                body = JSON.parse(body);
                assert.equals(body.length, 2);
            });
    },

    "should be able to get slaves": function () {
        return th.capture(this)
            .then(function (captured) {
                return captured.rc.getSlaves();
            })
            .then(function (slaves) {
                assert.equals(slaves.length, 1);
                assert(slaves[0].id);
                assert.match(slaves[0].userAgent, /phantom/i);
            });
    },

    "pass slave id as url param": function () {
        this.rs.captureUrl += "?id=123";

        return th.capture(this)
            .then(function (captured) {
                return captured.rc.getSlaves()
            })
            .then(function (slaves) {
                assert.equals(slaves.length, 1);
                assert.equals(slaves[0].id, "123");
            });
    },

    "should be able to load chains for a slave": function () {
        var self = this;

        return th.http("GET", self.rs.serverUrl + "/capture")
            .then(function (e) {
                assert.equals(e.res.statusCode, 302);
                return th.http("GET", self.rs.serverUrl + e.res.headers.location);
            })
            .then(function (e) {
                assert.equals(e.res.statusCode, 200);
                assert.match(e.body, /<frameset/);
            });
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
                                assert.match(slave2Url, /\/slaves\/[^\/]+\/chains/);
                            }));
                        });
                    });

                    // var rc = ramp.createRampClient(test.rs.port);
                    // ensureSlavePresent(rc, slaveId, page, cb);
                });
            });
        });
    },

    "should kill slave when browser dies": function () {
        var self = this;

        this.rs.createRampClient();

        return th.capture(this)
            .then(function (captured) {
                function tryGettingSlaves() {
                    return captured.rc.getSlaves()
                        .then(function (slaves) {
                            if (slaves.length !== 0) {
                                return tryGettingSlaves();
                            }
                            assert(true);
                        });
                }

                self.ph.closePage(captured.page);
                return tryGettingSlaves();
            });
    }
});
