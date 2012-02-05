var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCapServ = require("./../lib/buster-capture-server");
var bResourcesResourceSet = require("buster-resources").resourceSet;
var faye = require("faye");
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
                h.request({path: this.cs.capturePath}).end();
                bayeuxSubscribeOnce(this.cs.bayeux, "/capture", function (slave) {
                    self.slave = slave;
                    // TODO: find a less hacky way of pretending to be a browser.
                    self.cs.bayeux.publish("/" + slave.id + "/ready", {}).callback(done);
                });
            },

            "yields slave information": function () {
                var s = this.cs.getSlave(this.slave.id);
                assert.defined(s);
                assert.defined(s.id);
                assert.equals(s.id, this.slave.id);
                assert.defined(s.url);
                assert.equals(s.url, this.slave.url);
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
                    var headerSrc = h.domSelect(dom, "frame")[0].attribs.src
                    h.request({path: headerSrc}, function (res, body) {
                        assert.equals(res.statusCode, 200);
                        assert.equals(body, "<p>Hello, World.</p>");
                        done();
                    }).end();
                }).end();
            },

            "creating session returns serialized session": function () {
                var sess = this.cs.createSession({});
                assertIsSerializedSession(sess);
            },

            "creating session over HTTP responds with serialized session": function (done) {
                h.request({path: "/sessions", method: "POST"}, function (res, body) {
                    assertIsSerializedSession(JSON.parse(body));
                    done();
                }).end(JSON.stringify({}));
            },

            "emits event when session is created": function (done) {
                var sess = this.cs.createSession({});
                this.cs.bayeux.subscribe("/session/create", function (session) {
                    assert.equals(sess, session);
                    done();
                });
            },

            "starts session immediately": function (done) {
                var self = this;
                var s = [];

                var handler = function (sess) {
                    s.push(sess);

                    // Callback called twice, once for create, once for start,
                    // with the same session?
                    if (s.length == 2) {
                        assert.defined(s[0]);
                        assert.defined(s[1]);
                        assert.equals(s[0].bayeuxClientPath, s[1].bayeuxClientPath);
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
                var s1 = this.cs.createSession({});
                bayeuxSubscribeOnce(this.cs.bayeux, "/session/start", function () {
                    var s2 = self.cs.createSession({});
                    bayeuxSubscribeOnce(self.cs.bayeux, "/session/create", function (s) {
                        assert.equals(s2, s);
                        assert.equals(self.cs.sessions(), [s1, s2]);
                        done();
                    });
                });
            },

            "starts next session when ending current session": function (done) {
                var self = this;
                var s1 = this.cs.createSession({});
                var s2 = this.cs.createSession({});

                bayeuxSubscribeOnce(this.cs.bayeux, "/session/start", function (sess) {
                    assert.equals(sess.id, s1.id);
                    self.cs.endSession(sess.id);

                    bayeuxSubscribeOnce(self.cs.bayeux, "/session/start", function (sess) {
                        assert.equals(sess.id, s2.id);
                        done();
                    });
                });
            },

            "loads next session when ending current session over HTTP": function (done) {
                var self = this;
                var s1 = this.cs.createSession({});
                var s2 = this.cs.createSession({});

                var i = 0;
                this.cs.bayeux.subscribe("/session/start", function (sess) {
                    switch(++i) {
                    case 1:
                        assert.equals(sess.id, s1.id);
                        h.request({path: sess.path, method: "DELETE"}).end();
                        break;
                    case 2:
                        assert.equals(sess.id, s2.id);
                        done();
                        break;
                    }
                });
            },

            "ending session over HTTP": function (done) {
                var sess = this.cs.createSession({});
                h.request({path: sess.path, method: "DELETE"}, function (res, body) {
                    assert.equals(res.statusCode, 200);
                    done();
                }).end();
            },

            "ending session emits event": function (done) {
                var sess = this.cs.createSession({});
                this.cs.endSession(sess.id);
                this.cs.bayeux.subscribe("/session/end", function (session) {
                    assert.equals(sess, session);
                    done();
                });
            },

            "gets current session programmatically": function (done) {
                var self = this;
                this.cs.createSession({});

                this.cs.bayeux.subscribe("/session/create", function (sess) {
                    assert.equals(sess, self.cs.currentSession());
                    done();
                });
            },

            "gets current session over HTTP": function (done) {
                var sess = this.cs.createSession({});
                h.request({path: "/sessions/current"}, function (res, body) {
                    assert.equals(res.statusCode, 200);
                    assert.equals(sess, JSON.parse(body));
                    done();
                }).end();
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

                bayeuxSubscribeOnce(this.cs.bayeux, "/session/start", function (s) {
                    assert.equals(sess.id, s.id);
                    bayeuxSubscribeOnce(self.cs.bayeux, "/session/start", function (s) {
                        assert.equals(sess.id, s.id);
                        done();
                    });
                });
            },

            "provides messaging to currently running session": function (done) {
                this.cs.createSession({});
                this.cs.bayeux.subscribe("/session/start", function (session) {
                    assertBayeuxMessagingAvailable(bayeuxForSession(session), done);
                });
            },

            "provides messaging to session that isn't current": function (done) {
                var s1 = this.cs.createSession({});
                var s2 = this.cs.createSession({});

                this.cs.bayeux.subscribe("/session/create", function (session) {
                    if (session.id == s2.id) {
                        assertBayeuxMessagingAvailable(bayeuxForSession(session), done);
                    }
                });
            },

            "provides list of sessions": {
                setUp: function (done) {
                    var self = this;
                    this.sessions = [
                        this.cs.createSession({}),
                        this.cs.createSession({}),
                        this.cs.createSession({})
                    ];

                    var i = 0;
                    this.cs.bayeux.subscribe("/session/create", function (session) {
                        if (++i == self.sessions.length) {
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

            "serves resource set for current session": function (done) {
                this.cs.createSession({
                    resourceSet: {
                        resources: [
                            {path: "/", content: "<p>test</p>"},
                            {path: "/foo.js", content: "var foo = 5;"}
                        ]
                    }
                });

                this.cs.bayeux.subscribe("/session/start", function (sess) {
                    h.request({path: sess.resourcesPath}, function (res, body) {
                        assert.equals(res.statusCode, 200);
                        assert.equals(body, "<p>test</p>");

                        h.request(
                            {path: sess.resourcesPath + "/foo.js"},
                            function (res, body) {
                                assert.equals(res.statusCode, 200);
                                assert.equals(body, "var foo = 5;");
                                done();
                            }
                        ).end();
                    }).end();
                });
            },

            "does not serve resource set for queued session": function (done) {
                var self = this;

                var s1 = this.cs.createSession({
                    resourceSet: {
                        resources: [{path: "/", content: "<p>a</p>"}]
                    }
                });
                var s2 = this.cs.createSession({
                    resourceSet: {
                        resources: [{path: "/", content: "<p>b</p>"}]
                    }
                });

                this.cs.bayeux.subscribe("/session/create", function (sess) {
                    if (sess.id == s2.id) {
                        h.request({path: sess.resourcesPath}, function (res, body) {
                            assert.equals(res.statusCode, h.NO_RESPONSE_STATUS_CODE);
                            done();
                        }).end();
                    }
                });
            },

            "starts serving resource set when session is made current": function (done) {
                var self = this;
                var s1 = this.cs.createSession({});
                var s2 = this.cs.createSession({
                    resourceSet: {
                        resources: [{path: "/", content: "<p>a</p>"},]
                    }
                });

                bayeuxSubscribeOnce(this.cs.bayeux, "/session/start", function (sess) {
                    self.cs.endSession(sess.id);

                    bayeuxSubscribeOnce(self.cs.bayeux, "/session/start", function (sess) {
                        assert.equals(s2.id, sess.id);

                        h.request({path: s2.resourcesPath}, function (res, body) {
                            assert.equals(res.statusCode, 200);
                            assert.equals("<p>a</p>", body);
                            done();
                        }).end();
                    });
                });
            },

            "stores sessions in order of creation": function (done) {
                var self = this;

                // TODO: This test is broken. We should do something to the
                // payload that guarantees that it is serialized to resolve
                // s2 before s1.
                var s1 = this.cs.createSession({});
                var s2 = this.cs.createSession({});

                var i = 0;
                this.cs.bayeux.subscribe("/session/create", function () {
                    if (++i == 2) {
                        assert.equals(self.cs.sessions(), [s1, s2]);
                        h.request({path: s1.resourcesPath + "/foo.js"}, function (r, body) {
                            // ...
                            done();
                        }).end();
                    }
                });
            },

            "// stops providing messaging when session is no longer current": function () {
                var sess = this.cs.createSession({});
                var bayeux = bayeuxForSession(sess);
            },

            "and another captured slave": {
                setUp: function (done) {
                    var self = this;
                    h.request({path: this.cs.capturePath}).end();
                    bayeuxSubscribeOnce(this.cs.bayeux, "/capture", function (slave) {
                        self.slave2 = slave;
                        done();
                    });
                },

                "has no common attributes between slaves": function () {
                    refute.equals(this.slave.id, this.slave2.id);
                    refute.equals(this.slave.url, this.slave2.url);
                }
            }
        },

        "does not create session programmatically with no slaves available": function () {
            refute.defined(this.cs.createSession({}));
        },

        "does not create session over HTTP with no slaves available": function (done) {
            h.request({path: "/sessions", method: "POST"}, function (res, body) {
                assert.equals(res.statusCode, 403);
                done();
            }).end(JSON.stringify({}));
        }
    }
});

function assertIsSerializedSession(sess) {
    assert.defined(sess);
    assert.defined(sess.id);
    assert.defined(sess.bayeuxClientPath);
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

function bayeuxForSession(s) {
    return new faye.Client("http://127.0.0.1:" + h.SERVER_PORT + s.bayeuxClientPath);
}

function bayeuxSubscribeOnce(bayeux, url, handler) {
    var wrapped = function () {
        handler.apply(this, arguments);
        bayeux.unsubscribe(url, wrapped);
    };
    return bayeux.subscribe(url, wrapped);
}