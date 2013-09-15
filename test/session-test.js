var buster = require("buster-node");
var assert = buster.assert;
var refute = buster.refute;
var rampResources = require("ramp-resources");
var ramp = require("../lib/ramp")

var when = require("when");
var mori = require("mori");
var when_pipeline = require("when/pipeline");
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
                    assert(sessionClientInitializer.initialize);
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
                refute(sessionClient.initialize);
                assert.equals(sessionClient.getInitialSlaves().length, 1);
                assert(sessionClient.getSession().id);

                var testbedUrl = sessionClient.getSession().resourcesPath + "/";
                th.http("GET", self.rs.serverUrl + testbedUrl, done(function (res, body) {
                    assert.equals(res.statusCode, 200);
                }))
            });
        });
    },

    "is created when there are no slaves captured": function (done) {
        var rc = this.rs.createRampClient();
        rc.createSession().then(
            done(function (sessionClientInitializer) {
                assert(sessionClientInitializer.getSession().id)
            }),
            th.failWhenCalled
        );
    },

    "is not initialized when there are no slaves captured": function (done) {
        var rc = this.rs.createRampClient();
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
                        assert.equals(e.event, "some:event");
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
    },


    "can subscribe to all events": function (done) {
        var self = this;

        th.capture(this, function (rc, page, slaveId) {
            var rs = rampResources.createResourceSet();
            rs.addResource({
                path: "/test.js",
                content: 'buster.emit("some:event", 123); buster.emit("other/event-:", 456);'
            });
            rs.loadPath.append("/test.js");

            th.promiseSuccess(rc.createSession(rs), function (sessionClientInitializer) {
                var spy = self.spy();
                th.promiseSuccess(
                    sessionClientInitializer.on(function (eventName, e) {
                        spy(eventName, e);

                        if (spy.calledTwice) {
                            assert.calledWith(spy, "some:event", {slaveId: slaveId, data: 123, event: "some:event"});
                            assert.calledWith(spy, "other/event-:", {slaveId: slaveId, data: 456, event: "other/event-:"});
                            done();
                        }
                    }),
                    function () {
                        sessionClientInitializer.initialize()
                    });
            });
        });
    },

    "can get current session": function (done) {
        th.capture(this, function (rc) {
            th.promiseSuccess(
                when_pipeline([
                    function () {
                        return rc.createSession()
                    },
                    function (sessionClientInitializer) {
                        return sessionClientInitializer.initialize()
                    }
                ]),
                function (sessionClient) {
                    th.promiseSuccess(rc.getCurrentSession(), done(function (session) {
                        assert(session);
                        assert.equals(session, sessionClient.getSession());
                    }));
                });
        });
    },

    "can get current session when no session is running": function (done) {
        th.capture(this, function (rc) {
            th.promiseSuccess(rc.getCurrentSession(), done(function (session) {
                assert.isNull(session);
            }));
        });
    },

    "can end session": function (done) {
        th.capture(this, function (rc, page) {
            th.promiseSuccess(
                when_pipeline([
                    function () {
                        return rc.createSession()
                    },
                    function (sessionClientInitializer) {
                        return sessionClientInitializer.initialize()
                    },
                    function (sessionClient) {
                        return sessionClient.endSession();
                    },
                ]),
                function () {
                    th.promiseSuccess(rc.getCurrentSession(), function (session) {
                        assert.isNull(session);

                        // NOTE: This test relies on timing - we should fix it so it polls src until it
                        // changes, it might not have changed yet at this point.
                        page.evaluate("function () { return document.getElementById('session_frame').src }", done(function (src) {
                            assert.match(src, /\/slave_idle/);
                        }));
                    });
                });
        });
    },

    "session inaccessible when ended": function (done) {
        var self = this;

        th.capture(this, function (rc, page) {
            th.promiseSuccess(
                when_pipeline([
                    function () {
                        return rc.createSession()
                    },
                    function (sessionClientInitializer) {
                        return sessionClientInitializer.initialize()
                    }
                ]),
                function (sessionClient) {
                    var session = sessionClient.getSession();

                    th.promiseSuccess(sessionClient.endSession(), function () {
                        th.http("GET", self.rs.serverUrl + session.resourcesPath + "/", done(function (res, body) {
                            assert.equals(res.statusCode, 418);
                        }));
                    });
                });
        });
    },

    "session caches resources": function (done) {
        var resourceSpy = this.spy();

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

        th.capture(this, function (rc, page) {
            th.promiseSuccess(
                when_pipeline([
                    function () {
                        return rc.createSession(rs, {cache: true})
                    },
                    function (sessionClientInitializer) {
                        return sessionClientInitializer.initialize()
                    },
                    function (sessionClient) {
                        sessionClient.endSession();
                    },
                    function () {
                        return rc.createSession(rs, {cache: true})
                    },
                    function (sessionClientInitializer) {
                        return sessionClientInitializer.initialize()
                    },
                ]),
                done(function (sessionClient) {
                    assert.calledOnce(resourceSpy);
                }));
        });
    },

    "purging cache": function (done) {
        var resourceSpy = this.spy();

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

        th.capture(this, function (rc, page) {
            th.promiseSuccess(
                when_pipeline([
                    function () {
                        return rc.createSession(rs, {cache: true})
                    },
                    function (sessionClientInitializer) {
                        return sessionClientInitializer.initialize()
                    },
                    function (sessionClient) {
                        sessionClient.endSession();
                    },
                    function () {
                        return rc.purgeAllCaches();
                    },
                    function () {
                        return rc.createSession(rs, {cache: true})
                    },
                    function (sessionClientInitializer) {
                        return sessionClientInitializer.initialize()
                    },
                ]),
                done(function (sessionClient) {
                    assert.calledTwice(resourceSpy);
                }));
        });
    },

    "initializing with no slaves means there's no currently running session": function (done) {
        var rc = this.rs.createRampClient();

        th.promiseFailure(
            when_pipeline([
                function () {
                    return rc.createSession()
                },
                function (sessionClientInitializer) {
                    return sessionClientInitializer.initialize()
                }
            ]),
            function (err) {
                assert(/no slaves/i.test(err.message));
                th.promiseSuccess(rc.getCurrentSession(), done(function (session) {
                    assert.isNull(session);
                }));
            });
    },

    "makes buster.env.contextPath available": function (done) {
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

        th.capture(this, function (rc, page) {
            th.promiseSuccess(
                when_pipeline([
                    function () {
                        return rc.createSession(rs);
                    },
                    function (sessionClientInitializer) {
                        return when_pipeline([
                            function () {
                                return sessionClientInitializer.on("nicelydone", done(function (e) {
                                    assert.equals(e.data, 123);
                                }));
                            },
                            function () {
                                return sessionClientInitializer.initialize();
                            }
                        ])
                    }
                ]))
        });
    },

    "makes buster.env.id available": function (done) {
        var rs = rampResources.createResourceSet();
        rs.addResource({
            path: "/foo.js",
            content: 'buster.emit("blackjazz", buster.env.id)'
        });
        rs.loadPath.append("/foo.js");

        th.capture(this, function (rc, page, slaveId) {
            th.promiseSuccess(
                when_pipeline([
                    function () {
                        return rc.createSession(rs);
                    },
                    function (sessionClientInitializer) {
                        return when_pipeline([
                            function () {
                                return sessionClientInitializer.on("blackjazz", done(function (e) {
                                    assert.equals(e.data, slaveId);
                                }));
                            },
                            function () {
                                return sessionClientInitializer.initialize();
                            }
                        ])
                    }
                ]))
        });
    },

    "emits event when slave dies": function (done) {
        var self = this;
        th.capture(this, function (rc, page, slaveId) {
            th.promiseSuccess(
                when_pipeline([
                    function () {
                        return rc.createSession()
                    },
                    function (sessionClientInitializer) {
                        return when_pipeline([
                            function () {
                                return sessionClientInitializer.onSlaveDeath(function (e) {
                                    assert.equals(e.slaveId, slaveId);

                                    th.promiseSuccess(rc.getSlaves(), done(function (slaves) {
                                        assert.equals(slaves.length, 0);
                                    }));
                                })
                            },
                            function () {
                                return sessionClientInitializer.initialize()
                            }
                        ])
                    }
                ]),
                function () {
                    self.ph.closePage(page);
                });
        });
    },

    "emits event when session is aborted": function (done) {
        var self = this;
        th.capture(this, function (rc, page, slaveId) {
            th.promiseSuccess(
                when_pipeline([
                    function () {
                        return rc.createSession()
                    },
                    function (sessionClientInitializer) {
                        return when_pipeline([
                            function () {
                                return sessionClientInitializer.onSessionAbort(function (e) {
                                    done();
                                })
                            },
                            function () {
                                return sessionClientInitializer.initialize()
                            }
                        ])
                    }
                ]),
                function (sessionClient) {
                    var url = sessionClient.getSession().sessionUrl
                    th.http("DELETE", self.rs.serverUrl + url, function (res, body) {
                        assert.equals(res.statusCode, 200);
                    });
                });
        });
    }
});
