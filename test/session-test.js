var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var http = require("http");
var vm = require("vm");
var faye = require("faye");
var busterServer = require("./../lib/buster-capture-server");
var bCapServSession = require("./../lib/session")

var h = require("./test-helper");

function waitFor(num, callback) {
    var calls = 0;

    return function () {
        calls += 1;

        if (calls == num) {
            callback();
        }
    };
}

buster.testCase("Session", {
    setUp: function (done) {
        var self = this;
        this.httpServer = http.createServer(function (req, res) {
            res.writeHead(h.NO_RESPONSE_STATUS_CODE);
            res.end();
        });
        this.httpServer.listen(h.SERVER_PORT, function () {
            self.busterServer.oncapture = function (req, res, slave) {
                delete self.busterServer.oncapture;
                self.slave = slave;
                res.end();
                done();
            };
            h.request({path: self.busterServer.capturePath, method: "GET"}, function () {}).end();
        });
        this.busterServer = busterServer.create();
        this.busterServer.attach(this.httpServer);

        this.validSessionPayload = new Buffer(JSON.stringify({
            resourceSet: {
                load: ["/foo.js"],
                resources: {
                    "/foo.js": {
                        content: "var a = 5 + 5;"
                    }
                }
            }
        }), "utf8");
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "with HTTP created session": {
        setUp: function (done) {
            var self = this;
            h.request({path: "/sessions", method: "POST"}, function (res, body) {
                self.res = res;
                self.body = body;
                self.session = self.busterServer.sessions[0];
                done();
            }).end(this.validSessionPayload);
        },

        "test creating session": function () {
            assert.equals(201, this.res.statusCode);
            assert("location" in this.res.headers);
            assert.match(this.res.headers.location, /^\/.+/);

            var response = JSON.parse(this.body);

            assert("rootPath" in response);
            assert.equals(this.res.headers.location, response.rootPath);

            assert("resourceContextPath" in response);
            // resourceContextPath should be prefixed with rootPath.
            var expectedPrefix = response.resourceContextPath.slice(0, response.rootPath.length)
            assert.equals(expectedPrefix, response.rootPath);

            assert("bayeuxClientPath" in response);
            assert("id" in response);
            assert.equals(response.bayeuxClientPath, response.rootPath + "/messaging");

            assert("slaves" in response);
        },

        "test killing sessions": function (done) {
            var self = this;
            var  sessionEnd = this.spy();
            this.session.on("end", sessionEnd);
            
            h.request({path: this.session.rootPath, method: "DELETE"}, function (res, body) {
                assert.equals(200, res.statusCode);
                assert(sessionEnd.calledOnce);

                h.request({path: self.session.resourceSet.contextPath + "/foo.js", method: "GET"}, function (res, body) {
                    assert.equals(h.NO_RESPONSE_STATUS_CODE, res.statusCode);
                    h.request({path: self.session.rootPath, method: "GET"}, function (res, body) {
                        assert.equals(h.NO_RESPONSE_STATUS_CODE, res.statusCode);
                        done();
                    }).end();
                }).end();
            }).end();
        },

        "test creating session with other session in progress": function (done) {
            h.request({path: "/sessions", method: "POST"}, function (res, body) {
                assert.equals(202, res.statusCode);
                done();
            }).end(new Buffer(JSON.stringify({
                resourceSet: {
                    load: [],
                    resources: {"/foo.js": {content: "5 + 5;"}}
                }
            }), "utf8"));
        },

        "test killing first session with second session created": function (done) {
            var self = this;
            var sessionStart = this.spy(this.slave, "startSession");
            h.request({path: "/sessions", method: "POST"}, function (res, body) {
                var newSession = JSON.parse(body);
                h.request({path: self.session.rootPath, method: "DELETE"}, function (res, body) {
                    assert(sessionStart.calledOnce);
                    var sessionInfo = sessionStart.getCall(0).args[0];
                    assert.equals(newSession.rootPath, sessionInfo.rootPath);
                    done();
                }).end();
            }).end(this.validSessionPayload);
        },

        "test killing session that isn't current does nothing but deleting the session": function (done) {
            var sessionStart = this.spy(this.slave, "startSession");
            var sessionEnd = this.spy(this.slave, "endSession");

            h.request({path: "/sessions", method: "POST"}, function (res, body) {
                h.request({path: JSON.parse(body).rootPath, method: "DELETE"}, function () {
                    refute(sessionStart.called);
                    refute(sessionEnd.called);
                    done();
                }).end();
            }).end(this.validSessionPayload);
        },


        "test loads script middleware scripts before resource scripts": function (done) {
            var self = this;
            h.request({path: this.session.resourceSet.contextPath + "/", method: "GET"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                var scriptTags = body.match(/<script.+>/g);
                assert.match(scriptTags[0], '<script src="' + self.session.resourceSet.contextPath  + require.resolve("buster-core") + '"');
                done();
            }).end();
        },

        "test serves script middleware": function (done) {
            h.request({path: this.session.resourceSet.contextPath  + require.resolve("buster-core"), method: "GET"}, function (res, body) {
                assert.equals(200, res.statusCode);
                done();
            }).end();
        },

        "test automatic session takedown": function (done) {
            var url = "http://localhost:" + h.SERVER_PORT + this.session.bayeuxClientPath;

            this.stub(this.session, "end", function () {
                buster.assert(true);
                done();
            });

            var client = new faye.Client(url);
            var publication = client.publish("/session-owner");
            publication.callback(function () {
                client.disconnect();
            });
        },
    },

    "test programmatically created session is created and loaded": function (done) {
        this.stub(this.slave, "startSession", function (session) {
            assert(session.resourceSet.resources.hasOwnProperty("/foo"));
            done();
        });

        this.busterServer.createSession({
            resourceSet: {
                load: [],
                resources: {"foo":{content:""}}
            }
        });
    },

    "test programmatically creating session with none-string or none-buffer as content": function () {
        var self = this;

        assert.exception(function () {
            self.busterServer.createSession({
                resourceSet: {
                    load:[],resources:{"/foo.js":{content: 123}}
                }
            });
        });

        assert.exception(function () {
            self.busterServer.createSession({
                resourceSet: {
                    load:[],resources:{"/foo.js":{content: {}}}
                }
            });
        });
    },

    "test programmatically created session throws on validation error": function () {
        var self = this;
        assert.exception(function () {
            self.busterServer.createSession();
        });
    },

    "test programmatically destroying session": function (done) {
        var session = this.busterServer.createSession({load:[],resources:[]});
        this.busterServer.destroySession(session.id);

        h.request({path: session.resourceSet.contextPath + "/", method: "GET"}, function (res, body) {
            assert.equals(res.statusCode, h.NO_RESPONSE_STATUS_CODE);
            done();
        }).end();
    },

    "test destroying session in queue with HTTP": function (done) {
        var self = this;

        var spy = this.spy(this.slave, "endSession");

        this.busterServer.createSession({load:[],resources:[]});
        this.busterServer.createSession({load:[],resources:[]});
        var session = this.busterServer.createSession({load:[],resources:[]});

        h.request({path: session.rootPath, method: "DELETE"}, function (res, body) {
            // Callback is only called when current session ends.
            assert.equals(0, spy.callCount);

            assert.equals(2, self.busterServer.sessions.length);

            var sessionInList = false;
            for (var i = 0, ii = self.busterServer.sessions.length; i < ii; i++) {
                if (self.busterServer.sessions[i] == session) sessionInList = true;
            }
            refute(sessionInList);

            done();
        }).end();
    },

    "test destroying session in queue programmatically": function () {
        this.busterServer.createSession({load:[],resources:[]});
        this.busterServer.createSession({load:[],resources:[]});
        var session = this.busterServer.createSession({load:[],resources:[]});

        this.busterServer.destroySession(session.id);

        assert.equals(2, this.busterServer.sessions.length);

        var sessionInList = false;
        for (var i = 0, ii = this.busterServer.sessions.length; i < ii; i++) {
            if (this.busterServer.sessions[i] == session) sessionInList = true;
        }
        refute(sessionInList);
    },

    "test creating session with exception from resource system": function (done) {
        var payload = JSON.parse(this.validSessionPayload.toString("utf8"));
        payload.resourceSet.resources["/testtest.js"] = {etag: "an etag that does not exist"};

        h.request({path: "/sessions", method: "POST"}, function (res, body) {
            buster.assert.equals(res.statusCode, 403);
            buster.assert.match(body, "/testtest.js");
            buster.assert.match(body, "an etag that does not exist");
            buster.assert.match(body, "not found");
            done();
        }).end(JSON.stringify(payload));
    },

    "test session does not share messaging with other session": function (done) {
        var sessionA = this.busterServer.createSession({});
        var sessionB = this.busterServer.createSession({});
        assertBayeuxSeparation(sessionA, sessionB, done);
    },

    "test session does not  share messaging with server": function (done) {
        var session = this.busterServer.createSession({});
        assertBayeuxSeparation(session, this.busterServer.bayeux, done);
    },

    "test sessions has publish and subscribe": function (done) {
        var session = this.busterServer.createSession({});
        session.subscribe("/foo", function (e) {
            assert.equals(e, "test");
            done();
        }).callback(function () {
            session.publish("/foo", "test");
        });
    },

    "test session defaults to being resumable": function () {
        var session = this.busterServer.createSession({});
        buster.assert(session.joinable);
    },

    "test setting session to none-joinable": function () {
        var session = this.busterServer.createSession({joinable: false});
        buster.refute(session.joinable);
    },

    "test destroying current session": function () {
        var session = this.busterServer.createSession({});
        var session2 = this.busterServer.createSession({});
        var session3 = this.busterServer.createSession({});
        assert.equals(this.busterServer.sessions, [session, session2, session3]);

        this.busterServer.destroyCurrentSession();
        assert.equals(this.busterServer.sessions, [session2, session3]);

        this.busterServer.destroyCurrentSession();
        assert.equals(this.busterServer.sessions, [session3]);

        this.busterServer.destroyCurrentSession();
        assert.equals(this.busterServer.sessions, []);

        this.busterServer.destroyCurrentSession();
        assert.equals(this.busterServer.sessions, []);
    }
});

// Takes two objects with 'publish' and 'subscribe' methods and tests
// that messages to the one are not visible to the other.
function assertBayeuxSeparation(a, b, done) {
    var timesCalled = 0;
    function onMessage() {
        ++timesCalled;
        if (timesCalled == 2) done();
    }

    a.subscribe("/foo", function (msg) {
        assert.equals(msg, "a");
        onMessage();
    });
    a.publish("/foo", "a");
    a.publish("/bar", "a");

    b.subscribe("/bar", function (msg) {
        assert.equals(msg, "b");
        onMessage();
    });
    b.publish("/foo", "b");
    b.publish("/bar", "b");
}

function assertNotSharedFayeClients(fayeA, fayeB, done) {
    var timesCalled = 0;
    var resultHandler = function () {
        if (++timesCalled == 2) {
            // TODO: The process doesn't die properly. Why not?
            fayeA.disconnect();
            fayeB.disconnect();
            done();
        }
    }

    fayeA.subscribe("/foo", function (x) {
        assert.equals(x, "a");
        resultHandler()
    }).callback(function () {
        fayeA.publish("/foo", "a");
        fayeA.publish("/bar", "a");
    });

    fayeB.subscribe("/bar", function (x) {
        assert.equals(x, "b");
        resultHandler()
    }).callback(function () {
        fayeB.publish("/foo", "b");
        fayeB.publish("/bar", "b");
    });
}