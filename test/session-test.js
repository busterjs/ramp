var buster = require("buster-node");1
var assert = buster.assert;
var refute = buster.refute;
var rampResources = require("ramp-resources");
var ramp = require("../lib/ramp")

var when = require("when");
var th = require("./test-helper.js");

buster.testCase("Session", {
    setUp: function () {
        return th.setUpHelpers(this, [th.ph, th.rs]);
    },

    tearDown: function () {
        return th.tearDownHelpers(this);
    },

    "is created when there are slaves captured": function (done) {
        var self = this;

        th.capture(this, function (rc) {
            rc.createSession().then(
                done(function (sessionClientInitializer) {
                    refute(sessionClientInitializer.getSlaves);
                    assert(sessionClientInitializer.getSession().id)
                }),
                th.failWhenCalled
            )
        });
    },

    "test bed is accessible when session is up and running": function (done) {
        var self = this;

        th.capture(this, function (rc) {
            th.initializeSession(rc.createSession(), function (sessionClient) {
                assert.equals(sessionClient.getSlaves().length, 1);
                assert(sessionClient.getSession().id);

                var testbedUrl = "/sessions/" + sessionClient.getSession().id + "/testbed";
                th.httpGet(self.rs.serverUrl + testbedUrl, done(function (res, body) {
                    assert.equals(res.statusCode, 200);
                }))
            });
        });
    },

    "is created when there are no slaves captured": function (done) {
        var rc = ramp.createRampClient(this.rs.port);
        rc.createSession().then(
            done(function (sessionClientInitializer) {
                assert(sessionClientInitializer.getSession().id)
            }),
            th.failWhenCalled
        );
    },

    "is not initialized when there are no slaves captured": function (done) {
        var rc = ramp.createRampClient(this.rs.port);
        rc.createSession().then(
            function (sessionClientInitializer) {
                sessionClientInitializer.initialize().then(
                    th.failWhenCalled,
                    done(function (err) {
                        assert(/no slaves/i.test(err.message));
                    })
                );
            },
            th.failWhenCalled
        );
    },

    "cannot be created with another session in progress": function (done) {
        th.capture(this, function (rc) {
            rc.createSession().then(
                function (sessionClientInitializer) {
                    assert(sessionClientInitializer.getSession().id);
                    rc.createSession().then(
                        th.failWhenCalled,
                        done(function (err) {
                            assert(err.message);
                        })
                    )
                },
                th.failWhenCalled)
        });
    },

    "can subscribe to events": function (done) {
        var self = this;

        th.capture(this, function (rc) {
            var rs = rampResources.createResourceSet();
            rs.addResource({
                path: "/test.js",
                content: 'buster.emit("some:event", 123);'
            });
            rs.loadPath.append("/test.js");

            th.promiseSuccess(rc.createSession(rs), function (sessionClientInitializer) {
                th.promiseSuccess(
                    sessionClientInitializer.on("some:event", done(function (e) {
                        assert(e.slaveId);
                        assert.equals(e.data, 123);
                    })),
                    function () {
                        sessionClientInitializer.initialize()
                    });
            });
        });
    },

    "can publish events": function (done) {
        var self = this;

        th.capture(this, function (rc) {
            var rs = rampResources.createResourceSet();
            rs.addResource({
                path: "/test.js",
                content: 'buster.on("other:event", function (e) { buster.emit("final:event", e.data)}).then(function () { buster.emit("some:event"); })'
            });
            rs.loadPath.append("/test.js");

            var payload = Math.random().toString()
            th.promiseSuccess(rc.createSession(rs), function (sessionClientInitializer) {
                th.promiseSuccess(
                    when.all([
                        sessionClientInitializer.on("some:event", function (e) {
                            sessionClientInitializer.emit("other:event", payload);
                        }),
                        sessionClientInitializer.on("final:event", done(function (e) {
                            assert(e.slaveId);
                            assert.equals(e.data, payload);
                        }))
                    ]),
                    function () {
                        sessionClientInitializer.initialize()
                    });
            });
        });
    }
});
