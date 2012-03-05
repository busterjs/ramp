var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCapServ = require("./../lib/buster-capture-server");
var bResourcesResourceSet = require("buster-resources").resourceSet;
var when = require("when");
var http = require("http");
var h = require("./test-helper");

buster.testCase("Capture server", {
    setUp: function (done) {
        this.httpServer = http.createServer(function (req, res) {
            res.writeHead(h.NO_RESPONSE_STATUS_CODE);
            res.end();
        });
        this.httpServer.listen(h.SERVER_PORT, done);

        this.cs = bCapServ.create();
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "attached to http server": {
        setUp: function () {
            this.cs.attach(this.httpServer);
        },

        "emits event when capturing slave": function (done) {
            h.request({path: this.cs.capturePath}).end();
            this.cs.bayeux.subscribe("/capture", function (slave) {
                assert.defined(slave);
                done();
            });
        },

        "with captured slave": {
            setUp: function (done) {
                var self = this;
                h.request({
                    path: this.cs.capturePath,
                    headers: { "User-Agent": "Mozilla/5.0 (Android; Linux armv7l; rv:10.0) Gecko/20120129 Firefox/10.0 Fennec/10.0" }
                }).end();
                h.bayeuxSubscribeOnce(this.cs.bayeux, "/capture", function (slave) {
                    self.slave = slave;

                    // A slave is required to emit unloaded when a session ends
                    self.cs.bayeux.subscribe("/" + slave.id + "/session/end", function () {
                        self.cs.bayeux.publish("/" + slave.id + "/session/unloaded", {});
                    });

                    // A slave is required to notify when session has loaded
                    self.cs.bayeux.subscribe("/" + slave.id + "/session/start", function (s) {
                        self.cs.bayeux.publish("/" + slave.id + "/session/" + s.id + "/ready", {});
                    });

                    self.cs.bayeux.publish(slave.becomesReadyPath, {}).callback(done);
                });
            },

            "yields slave information": function () {
                var self = this;
                var s = this.cs.slaves().filter(function (s) { return s.id == self.slave.id })[0];
                assert.defined(s);
                assert.defined(s.id);
                assert.equals(s.id, this.slave.id);
                assert.defined(s.url);
                assert.equals(s.url, this.slave.url);
            },

            "slave has user agent": function () {
                assert.match(this.slave.userAgent, "Firefox");
            },

            "serves slave page": function (done) {
                var self = this;
                h.request({path: this.slave.url}, function (res, body) {
                    assert.equals(res.statusCode, 200);
                    assert.match(res.headers["content-type"], "text/html");
                    done();
                }).end();
            },

            "serves slave page with header": function (done) {
                var self = this;

                var rs = bResourcesResourceSet.create();
                rs.addResource({
                    path: "/",
                    content: "<p>Hello, World.</p>"
                });
                this.cs.header(80, rs);
                h.request({path: this.slave.url}, function (res, body) {
                    var dom = h.parseDOM(body);
                    var headerSrc = h.domSelect(dom, "frame")[0].attribs.src;
                    h.request({path: headerSrc}, function (res, body) {
                        assert.equals(res.statusCode, 200);
                        assert.equals(body, "<p>Hello, World.</p>");
                        done();
                    }).end();
                }).end();
            },

            "creating session resolves with serialized session": function (done) {
                var promise = this.cs.createSession({});
                promise.then(function (sess) {
                    assertIsSerializedSession(sess);
                    done();
                });
            },

            "creating session over HTTP responds with serialized session": function (done) {
                h.request({path: "/sessions", method: "POST"}, function (res, body) {
                    assertIsSerializedSession(JSON.parse(body));
                    done();
                }).end(JSON.stringify({}));
            },

            "creating session programmatically with invalid resource set": function (done) {
                var promise = this.cs.createSession({
                    resourceSet: {
                        resources: [
                            {noPathHere: "/foo"}
                        ]
                    }
                });
                promise.then(function () {}, function (err) {
                    assert.defined(err);
                    done();
                });
            },

            "creating session over HTTP with invalid resource set": function (done) {
                h.request({path: "/sessions", method: "POST"}, function (res, body) {
                    assert.equals(res.statusCode, 403);
                    assert.defined(body);
                    done();
                }).end(JSON.stringify({
                    resourceSet: {
                        resources: [
                            {noPathHere: "/foo"}
                        ]
                    }
                }));
            },

            "emits event when session is created": function (done) {
                this.cs.createSession({});
                this.cs.bayeux.subscribe("/session/create", function (session) {
                    assert(true);
                    done();
                });
            },

            "starts session immediately": function (done) {
                var self = this;
                var s = [];

                var handler = function (e) {
                    s.push(e);

                    // Callback called twice, once for create, once for start,
                    // with the same session?
                    if (s.length == 2) {
                        assert.defined(s[0]);
                        assert.defined(s[1]);
                        assert.equals(s[0].session.bayeuxClientPath, s[1].session.bayeuxClientPath);
                        done();
                    }
                };
                handler.timesCalled = 0;

                this.cs.createSession({});
                this.cs.bayeux.subscribe("/session/create", handler);
                this.cs.bayeux.subscribe("/session/start", handler);
            },

            "queues new sessions created while a session is running": function (done) {
                var self = this;
                this.cs.createSession({});
                h.bayeuxSubscribeOnce(this.cs.bayeux, "/session/start", function (e1) {
                    self.cs.createSession({});
                    h.bayeuxSubscribeOnce(self.cs.bayeux, "/session/create", function (e2) {
                        refute.equals(e1.session, e2.session);
                        assert.equals(self.cs.sessions(), [e1.session, e2.session]);
                        refute.equals(e2.session, self.cs.currentSession());
                        done();
                    });
                });
            },

            "starts next session when ending current session": function (done) {
                var self = this;
                this.cs.createSession({});

                h.bayeuxSubscribeOnce(this.cs.bayeux, "/session/start", function (e1) {
                    assert.equals(self.cs.sessions().length, 1);
                    assert.equals(self.cs.currentSession(), e1.session);
                    self.cs.endSession(e1.session.id);
                    self.cs.createSession({});

                    h.bayeuxSubscribeOnce(self.cs.bayeux, "/session/start", function (e2) {
                        refute.equals(e1.session, e2.session);
                        assert.equals(self.cs.currentSession(), e2.session);
                        done();
                    });
                });
            },

            "loads next session when ending current session over HTTP": function (done) {
                var self = this;
                this.cs.createSession({});
                this.cs.createSession({});
                var sessions = [];

                var i = 0;
                this.cs.bayeux.subscribe("/session/start", function (e) {
                    sessions.push(e.session);
                    switch(++i) {
                    case 1:
                        assert.equals(e.session.id, sessions[0].id);
                        h.request({path: e.session.path, method: "DELETE"}).end();
                        break;
                    case 2:
                        assert.equals(e.session.id, sessions[1].id);
                        done();
                        break;
                    }
                });
            },

            "ending session over HTTP": function (done) {
                this.cs.createSession({}).then(function (session) {
                    h.request({path: session.path, method: "DELETE"}, function (res, body) {
                        assert.equals(res.statusCode, 200);
                        done();
                    }).end();
                });
            },

            "ending session emits event": function (done) {
                var self = this;
                this.cs.createSession({});

                h.bayeuxSubscribeOnce(this.cs.bayeux, "/session/start", function (e1) {
                    self.cs.bayeux.subscribe("/session/end", function (e2) {
                        assert.equals(e1.session, e2.session);
                        done();
                    });

                    self.cs.endSession(e1.session.id);
                });
            },

            "gets current session programmatically": function (done) {
                var self = this;
                this.cs.createSession({});

                this.cs.bayeux.subscribe("/session/create", function (e) {
                    assert.equals(e.session, self.cs.currentSession());
                    done();
                });
            },

            "gets current session over HTTP": function (done) {
                this.cs.createSession({}).then(function (sess) {
                    h.request({path: "/sessions/current"}, function (res, body) {
                        assert.equals(res.statusCode, 200);
                        assert.equals(sess, JSON.parse(body));
                        done();
                    }).end();
                });
            },

            "gets current session programmatically when there is none": function () {
                refute.defined(this.cs.currentSession());
            },

            "gets current session over HTTP when there is none": function (done) {
                h.request({path: "/sessions/current"}, function (res, body) {
                    assert.equals(res.statusCode, 404);
                    done();
                }).end();
            },

            "// emits session start when subscribing while in progress": function (done) {
                var self = this;
                var sess = this.cs.createSession({});

                h.bayeuxSubscribeOnce(this.cs.bayeux, "/session/start", function (e) {
                    assert.equals(sess.id, e.session.id);
                    h.bayeuxSubscribeOnce(self.cs.bayeux, "/session/start", function (e) {
                        assert.equals(sess.id, e.session.id);
                        done();
                    });
                });
            },

            "provides messaging to currently running session": function (done) {
                this.cs.createSession({});
                this.cs.bayeux.subscribe("/session/start", function (e) {
                    assertBayeuxMessagingAvailable(h.bayeuxForSession(e.session), done);
                });
            },

            "provides messaging to session that isn't current": function (done) {
                var self = this;
                this.cs.createSession({});
                this.cs.createSession({}).then(function (session) {
                    refute.equals(self.cs.currentSession(), session);
                    assertBayeuxMessagingAvailable(h.bayeuxForSession(session), done);
                });
            },

            "provides list of sessions": {
                setUp: function (done) {
                    var self = this;
                    this.sessions = [];
                    this.cs.createSession({}),
                    this.cs.createSession({}),
                    this.cs.createSession({})

                    this.cs.bayeux.subscribe("/session/create", function (e) {
                        self.sessions.push(e.session);
                        if (self.sessions.length == 3) {
                            done();
                        }
                    });
                },

                "programmatically": function () {
                    assert.equals(this.cs.sessions(), this.sessions);
                },

                "over HTTP": function (done) {
                    var self = this;
                    h.request({path: "/sessions"}, function (res, body) {
                        assert.equals(res.statusCode, 200);
                        assert.equals(JSON.parse(body), self.sessions);
                        done();
                    }).end();
                }
            },

            "resource sets": {
                setUp: function (done) {
                    this.cs.createSession({
                        resourceSet: {
                            resources: [
                                {path: "/", content: "<p>test</p>", etag: "1234"},
                                {path: "/foo.js", content: "var foo = 5;", etag: "2345"}
                            ]
                        }
                    });

                    this.cs.bayeux.subscribe("/session/start", done(function (e) {
                        this.sess = e.session;
                    }.bind(this)));
                },

                "serves resource set for current session": function (done) {
                    h.request({path: this.sess.resourcesPath}, function (res, body) {
                        assert.equals(res.statusCode, 200);
                        assert.match(body, "<p>test</p>");

                        h.request(
                            {path: this.sess.resourcesPath + "/foo.js"},
                            done(function (res, body) {
                                assert.equals(res.statusCode, 200);
                                assert.equals(body, "var foo = 5;");
                            })
                        ).end();
                    }.bind(this)).end();
                },

                "serves resource set cache manifests": function (done) {
                    h.request({path: "/resources"}, done(function (res, body) {
                        assert.equals(res.statusCode, 200);
                        assert.match(JSON.parse(body), {
                            "/": ["1234"],
                            "/foo.js": ["2345"]
                        });
                    })).end();
                }
            },

            "does not serve resource set for queued session": function (done) {
                var self = this;

                this.cs.createSession({
                    resourceSet: {
                        resources: [{path: "/", content: "<p>a</p>"}]
                    }
                });

                this.cs.createSession({
                    resourceSet: {
                        resources: [{path: "/", content: "<p>b</p>"}]
                    }
                }).then(function (sess) {
                    h.request({path: sess.resourcesPath}, function (res, body) {
                        assert.equals(res.statusCode, h.NO_RESPONSE_STATUS_CODE);
                        done();
                    }).end();
                });
            },

            "starts serving resource set when session is made current": function (done) {
                var self = this;
                this.cs.createSession({});

                this.cs.createSession({
                    resourceSet: {
                        resources: [{path: "/", content: "<p>a</p>"}]
                    }
                });

                h.bayeuxSubscribeOnce(self.cs.bayeux, "/session/start", function (e1) {
                    self.cs.endSession(e1.session.id);

                    h.bayeuxSubscribeOnce(self.cs.bayeux, "/session/start", function (e2) {
                        h.request({path: e2.session.resourcesPath}, function (res, body) {
                            assert.equals(res.statusCode, 200);
                            assert.match(body, "<p>a</p>");
                            done();
                        }).end();
                    });
                });
            },

            "stops serving resource set when current session ends": function (done) {
                var self = this;
                this.cs.createSession({});

                h.bayeuxSubscribeOnce(this.cs.bayeux, "/session/start", function (e) {
                    self.cs.endSession(e.session.id);
                    h.request({path: e.session.resourcesPath + "/"}, function (res, body) {
                        assert.equals(h.NO_RESPONSE_STATUS_CODE, res.statusCode);
                        done();
                    }).end();
                });
            },

            "stores sessions in order of creation": function (done) {
                var self = this;

                // TODO: This test is broken. We should do something to the
                // payload that guarantees that it is serialized to resolve
                // s2 before s1.
                this.cs.createSession({}).then(function (s1) {
                    self.cs.createSession({}).then(function (s2) {
                        assert.equals(self.cs.sessions(), [s1, s2]);
                        h.request({path: s1.resourcesPath + "/foo.js"}, function (r, body) {
                            // ...
                            done();
                        }).end();
                    });
                });
            },

            "// stops providing messaging when session is no longer current": function () {
                var sess = this.cs.createSession({});
                var bayeux = h.bayeuxForSession(sess);
            },

            "and another captured slave": {
                setUp: function (done) {
                    var self = this;
                    h.request({path: this.cs.capturePath}).end();
                    h.bayeuxSubscribeOnce(this.cs.bayeux, "/capture", function (slave) {
                        self.slave2 = slave;
                        done();
                    });
                },

                "has no common attributes between slaves": function () {
                    refute.equals(this.slave.id, this.slave2.id);
                    refute.equals(this.slave.url, this.slave2.url);
                }
            },

            "with shared resource sessions": {
                setUp: function (done) {
                    var self = this;
                    when.all([
                        this.cs.createSession({
                            sharedResourcePath: true,
                            resourceSet: {
                                resources: [
                                    {path: "/foo", content: "a"}
                                ]
                            }
                        }),
                        this.cs.createSession({
                            sharedResourcePath: true,
                            resourceSet: {
                                resources: [
                                    {path: "/foo", content: "b"}
                                ]
                            }
                        })
                    ]).then(function (sessions) {
                        self.s1 = sessions[0];
                        self.s2 = sessions[1];
                        done();
                    });
                },

                "shares only resource path": function () {
                    assert.defined(this.s1.resourcesPath);
                    assert.equals(this.s1.resourcesPath, this.s2.resourcesPath);
                    refute.equals(this.s1.id, this.s2.id);
                    refute.equals(this.s1.path, this.s2.path);
                    refute.equals(this.s1.bayeuxContextPath, this.s2.bayeuxContextPath);
                },

                "serves resources for current resource set": function (done) {
                    var self = this;
                    h.request({
                        path: this.s1.resourcesPath + "/foo"
                    }, function (res, body) {
                        assert.equals(res.statusCode, 200);
                        assert.equals("a", body);
                        self.cs.endSession(self.s1.id);
                        h.bayeuxSubscribeOnce(self.cs.bayeux, "/session/start", function () {
                            h.request({
                                path: self.s2.resourcesPath + "/foo"
                            }, function (res, body) {
                                assert.equals(res.statusCode, 200);
                                assert.equals("b", body);
                                done();
                            }).end();
                        });
                    }).end();
                }
            }
        },

        "does not create unjoinable session programmatically with no slaves available": function (done) {
            this.cs.createSession({joinable: false}).then(
                function () {},
                done(function (err) {
                    assert.match(err, "no slaves captured");
                    assert(true);
                })
            );
        },

        "does not create unjoinable session over HTTP with no slaves available": function (done) {
            h.request({path: "/sessions", method: "POST"}, function (res, body) {
                assert.equals(res.statusCode, 403);
                done();
            }).end(JSON.stringify({joinable: false}));
        },

        "creates session programmatically with no slaves available": function (done) {
            this.cs.createSession({}).then(function (session) {
                assertIsSerializedSession(session);
                done();
            });
        },

        "creates session over HTTP with no slaves available": function (done) {
            h.request({path: "/sessions", method: "POST"}, function (res, body) {
                assert.equals(res.statusCode, 201);
                assertIsSerializedSession(JSON.parse(body));
                done();
            }).end(JSON.stringify({}));
        }
    }
});

function assertIsSerializedSession(sess) {
    assert.defined(sess);
    assert.defined(sess.id);
    assert.defined(sess.path);
    assert.defined(sess.bayeuxContextPath);
    assert.defined(sess.resourcesPath);
}

function assertBayeuxMessagingAvailable(bayeux, done) {
    bayeux.subscribe("/foo", function (msg) {
        assert.equals(msg, "123abc");
        bayeux.disconnect();
        done();
    }).callback(function () {
        bayeux.publish("/foo", "123abc");
    });
}