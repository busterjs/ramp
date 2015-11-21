var buster = require("buster-node");
var assert = buster.referee.assert;
var refute = buster.referee.refute;
var rampResources = require("ramp-resources");
var ramp = require("../lib/ramp");

var when = require("when");
var th = require("./test-helper.js");

buster.testCase("Session", {
    setUp: function () {
        return th.setUpHelpers(this, [th.ph, th.rs]);
    },

    tearDown: function () {
        return th.tearDownHelpers(this);
    },

    "is created when there are slaves captured": function () {
        return th.capture(this)
            .then(function (captured) {
                return captured.rc.createSession()
            })
            .then(function (sessionClientInitializer) {
                assert(sessionClientInitializer.initialize);
                assert(sessionClientInitializer.getSession().id);
            });
    },

    "test bed is accessible when session is up and running": function () {
        var self = this;

        return th.capture(this)
            .then(function (captured) {
                return captured.rc.createSession();
            })
            .then(function (sessionClientInitializer) {
                return sessionClientInitializer.initialize();
            })
            .then(function (sessionClient) {
                refute(sessionClient.initialize);
                assert.equals(sessionClient.getInitialSlaves().length, 1);
                assert(sessionClient.getSession().id);

                var testbedUrl = sessionClient.getSession().resourcesPath + "/";
                return when.promise(function (resolve) {
                    th.http("GET", self.rs.serverUrl + testbedUrl, resolve);
                });

            })
            .then(function (res) {
                assert.equals(res.statusCode, 200);
            });
    },

    "is created when there are no slaves captured": function () {
        var rc = this.rs.createRampClient();
        return rc.createSession().then(function (sessionClientInitializer) {
            assert(sessionClientInitializer.getSession().id);
        });
    },

    "is not initialized when there are no slaves captured": function () {
        var rc = this.rs.createRampClient();
        return rc.createSession()
            .then(function (sessionClientInitializer) {
                return sessionClientInitializer.initialize();
            })
            .then(function () {
                assert(false, "Should not get here");
            })
            .catch(function (err) {
                assert.match(err.message, /no slaves/i);
            });
    },

    "cannot be created with another session in progress": function () {
        var captured;
        return th.capture(this)
            .then(function (c) {
                captured = c;
                return captured.rc.createSession();
            })
            .then(function (sessionClientInitializer) {
                assert(sessionClientInitializer.getSession().id);
                return captured.rc.createSession();
            })
            .then(function () {
                assert(false, "Should not get here");
            })
            .catch(function (err) {
                assert.match(err.message, /session is already in progress/i);
            });
    },

    "can subscribe to events": function () {
        return th.capture(this)
            .then(function (captured) {
                var rs = rampResources.createResourceSet();
                rs.addResource({
                    path: "/test.js",
                    content: 'buster.emit("some:event", 123);'
                });
                rs.loadPath.append("/test.js");

                return captured.rc.createSession(rs);
            })
            .then(function (sessionClientInitializer) {
                var onEventPromise = new when.promise(function (resolve) {
                    sessionClientInitializer.on("some:event", resolve);
                });

                return sessionClientInitializer.initialize().then(function () {
                    return onEventPromise;
                });
            })
            .then(function (e) {
                assert(e.slaveId);
                assert.equals(e.data, 123);
                assert.equals(e.event, "some:event");
            });
    },

    "can publish events": function () {
        var payload = Math.random().toString();

        return th.capture(this)
            .then(function (captured) {
                var rs = rampResources.createResourceSet();
                rs.addResource({
                    path: "/test.js",
                    content: 'buster.on("other:event", function (e) { buster.emit("final:event", e.data)}).then(function () { buster.emit("some:event"); })'
                });
                rs.loadPath.append("/test.js");

                return captured.rc.createSession(rs);
            })
            .then(function (sessionClientInitializer) {

                sessionClientInitializer.on("some:event", function (e) {
                    sessionClientInitializer.emit("other:event", payload);
                });

                var onFinalEventPromise = new when.promise(function (resolve) {
                    sessionClientInitializer.on("final:event", resolve);
                });

                return sessionClientInitializer.initialize().then(function () {
                    return onFinalEventPromise;
                });
            })
            .then(function (e) {
                assert(e.slaveId);
                assert.equals(e.data, payload);
            });
    },


    "can subscribe to all events": function () {
        var spy = this.spy();
        var captured;

        return th.capture(this)
            .then(function (c) {
                captured = c;

                var rs = rampResources.createResourceSet();
                rs.addResource({
                    path: "/test.js",
                    content: 'buster.emit("some:event", 123); buster.emit("other/event-:", 456);'
                });
                rs.loadPath.append("/test.js");

                return captured.rc.createSession(rs);
            })
            .then(function (sessionClientInitializer) {

                var onEventTwicePromise = new when.promise(function (resolve) {
                    sessionClientInitializer.on(function (eventName, e) {
                        spy(eventName, e);

                        if (spy.calledTwice) {
                            resolve();
                        }
                    });
                });

                return when.all([sessionClientInitializer.initialize(), onEventTwicePromise]);
            })
            .then(function () {
                assert.calledWith(spy, "some:event", {
                    slaveId: captured.slaveId,
                    data: 123,
                    event: "some:event"
                });
                assert.calledWith(spy, "other/event-:", {
                    slaveId: captured.slaveId,
                    data: 456,
                    event: "other/event-:"
                });
            });
    },

    "can get current session": function () {
        var sessionClient, captured;

        return th.capture(this)
            .then(function (c) {
                captured = c;
                return captured.rc.createSession();
            })
            .then(function (sessionClientInitializer) {
                return sessionClientInitializer.initialize()
            })
            .then(function (s) {
                sessionClient = s;
                return captured.rc.getCurrentSession();
            })
            .then(function (session) {
                assert(session);
                assert.equals(session, sessionClient.getSession());
            });
    },

    "can get current session when no session is running": function () {
        return th.capture(this)
            .then(function (captured) {
                return captured.rc.getCurrentSession();
            })
            .then(function (session) {
                assert.isNull(session);
            });
    },

    "can end session": function () {
        var captured;

        return th.capture(this)
            .then(function (c) {
                captured = c;
                return captured.rc.createSession();
            })
            .then(function (sessionClientInitializer) {
                return sessionClientInitializer.initialize()
            })
            .then(function (sessionClient) {
                return sessionClient.endSession();
            })
            .then(function () {
                return captured.rc.getCurrentSession();
            })
            .then(function (session) {
                assert.isNull(session);

                return when.promise(function (resolve) {
                    // NOTE: This test relies on timing - we should fix it so it polls src until it
                    // changes, it might not have changed yet at this point.
                    captured.page.evaluate("function () { return document.getElementById('session_frame').src }", resolve);
                });
            })
            .then(function (src) {
                assert.match(src, /\/slave_idle/);
            });
    },

    "session inaccessible when ended": function () {
        var self = this;
        var session;

        return th.capture(this)
            .then(function (captured) {
                return captured.rc.createSession();
            })
            .then(function (sessionClientInitializer) {
                return sessionClientInitializer.initialize()
            })
            .then(function (sessionClient) {
                session = sessionClient.getSession();
                return sessionClient.endSession();
            })
            .then(function () {
                return when.promise(function (resolve) {
                    th.http("GET", self.rs.serverUrl + session.resourcesPath + "/", resolve);
                });
            })
            .then(function (res) {
                assert.equals(res.statusCode, 418);
            });
    },

    "session caches resources": function () {
        var resourceSpy = this.spy();
        var captured;

        var rs = rampResources.createResourceSet();
        rs.addResource({
            path: "/test.js",
            etag: "123abc",
            content: function () {
                resourceSpy();
                return "5 + 5;"
            }
        });
        rs.loadPath.append("/test.js");

        return th.capture(this)
            .then(function (c) {
                captured = c;
                return captured.rc.createSession(rs, {cache: true});
            })
            .then(function (sessionClientInitializer) {
                return sessionClientInitializer.initialize()
            })
            .then(function (sessionClient) {
                sessionClient.endSession();
            })
            .then(function () {
                return captured.rc.createSession(rs, {cache: true})
            })
            .then(function (sessionClientInitializer) {
                return sessionClientInitializer.initialize()
            })
            .then(function () {
                assert.calledOnce(resourceSpy);
            });
    },

    "purging cache": function () {
        var resourceSpy = this.spy();
        var captured;

        var rs = rampResources.createResourceSet();
        rs.addResource({
            path: "/test.js",
            etag: "123abc",
            content: function () {
                resourceSpy();
                return "5 + 5;"
            }
        });
        rs.loadPath.append("/test.js");

        return th.capture(this)
            .then(function (c) {
                captured = c;
                return captured.rc.createSession(rs, {cache: true})
            })
            .then(function (sessionClientInitializer) {
                return sessionClientInitializer.initialize()
            })
            .then(function (sessionClient) {
                sessionClient.endSession();
            })
            .then(function () {
                return captured.rc.purgeAllCaches();
            })
            .then(function () {
                return captured.rc.createSession(rs, {cache: true})
            })
            .then(function (sessionClientInitializer) {
                return sessionClientInitializer.initialize()
            })
            .then(function () {
                assert.calledTwice(resourceSpy);
            });
    },

    "initializing with no slaves means there's no currently running session": function () {
        var rc = this.rs.createRampClient();

        return rc.createSession()
            .then(function (sessionClientInitializer) {
                return sessionClientInitializer.initialize();
            })
            .then(function () {
                assert(false, "Should not get here");
            })
            .catch(function (err) {
                assert.match(err.message, /no slaves/);
                return rc.getCurrentSession();
            })
            .then(function (session) {
                assert.isNull(session);
            });
    },

    "makes buster.env.contextPath available": function () {
        var rs = rampResources.createResourceSet();
        rs.addResource({
            path: "/foo.js",
            content: 'var e = document.createElement("script"); e.src = buster.env.contextPath + "/bar.js"; document.body.appendChild(e);'
        });
        rs.addResource({
            path: "/bar.js",
            content: 'buster.emit("nicelydone", 123);'
        });
        rs.loadPath.append("/foo.js");

        return th.capture(this)
            .then(function (captured) {
                return captured.rc.createSession(rs);
            })
            .then(function (sessionClientInitializer) {
                var onNicelyDonePromise = new when.promise(function (resolve) {
                    sessionClientInitializer.on("nicelydone", resolve);
                });

                return sessionClientInitializer.initialize().then(function () {
                    return onNicelyDonePromise;
                });
            })
            .then(function (e) {
                assert.equals(e.data, 123);
            });
    },

    "makes buster.env.id available": function () {
        var captured;

        var rs = rampResources.createResourceSet();
        rs.addResource({
            path: "/foo.js",
            content: 'buster.emit("blackjazz", buster.env.id)'
        });
        rs.loadPath.append("/foo.js");

        return th.capture(this)
            .then(function (c) {
                captured = c;
                return captured.rc.createSession(rs);
            })
            .then(function (sessionClientInitializer) {
                var onBlackjazzPromise = new when.promise(function (resolve) {
                    sessionClientInitializer.on("blackjazz", resolve);
                });

                return sessionClientInitializer.initialize().then(function () {
                    return onBlackjazzPromise;
                });
            })
            .then(function (e) {
                assert.equals(e.data, captured.slaveId);
            });
    },

    "emits event when slave dies": function () {
        var self = this;
        var captured;

        return th.capture(this)
            .then(function (c) {
                captured = c;
                return captured.rc.createSession();
            })
            .then(function (sessionClientInitializer) {
                var onDeathPromise = new when.promise(function (resolve) {
                    sessionClientInitializer.onSlaveDeath(resolve);
                });

                return when.all([
                    onDeathPromise,
                    sessionClientInitializer.initialize(),
                    self.ph.closePage(captured.page)
                ]);
            })
            .then(function (all) {
                var e = all[0];
                assert.equals(e.slaveId, captured.slaveId);

                return captured.rc.getSlaves();
            })
            .then(function (slaves) {
                assert.equals(slaves.length, 0);
            });
    },

    "emits event when session is aborted": function (done) {
        var self = this;
        var sessionClientInitializer;

        th.capture(this)
            .then(function (captured) {
                return captured.rc.createSession();
            })
            .then(function (s) {
                sessionClientInitializer = s;
                return sessionClientInitializer.onSessionAbort(function (e) {
                    assert(e);
                    done();
                });
            })
            .then(function () {
                return sessionClientInitializer.initialize().then(function (sessionClient) {
                    var url = sessionClient.getSession().sessionUrl;
                    th.http("DELETE", self.rs.serverUrl + url, function (res, body) {
                        assert.equals(res.statusCode, 200);
                    });
                });
            });
    },

    "test bed is the same with static paths": function () {
        var testbedUrlA;
        var testbedUrlB;
        var captured;

        return th.capture(this)
            .then(function (c) {
                captured = c;
                return captured.rc.createSession(null, {staticResourcesPath: true});
            })
            .then(function (sessionClientInitializer) {
                return sessionClientInitializer.initialize()
            })
            .then(function (sessionClient) {
                testbedUrlA = sessionClient.getSession().resourcesPath;
                return sessionClient.endSession()
            })
            .then(function () {
                return captured.rc.createSession(null, {staticResourcesPath: true});
            })
            .then(function (sessionClientInitializer) {
                return sessionClientInitializer.initialize()
            })
            .then(function (sessionClient) {
                testbedUrlB = sessionClient.getSession().resourcesPath;
                assert(testbedUrlA);
                assert(testbedUrlB);
                assert.equals(testbedUrlA, testbedUrlB, "For static sessions, the path should be the same");
            })
    }
});
