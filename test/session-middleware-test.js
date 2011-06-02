var buster = require("buster");
var http = require("http");
var vm = require("vm");
var sinon = require("sinon");
var busterSessionMiddleware = require("./../lib/session/session-middleware");
var multicastMiddleware = require("buster-multicast").multicastMiddleware;
var busterResourceMiddleware = require("./../lib/resources/resource-middleware");

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

buster.testCase("Session middleware", {
    setUp: function (done) {
        var self = this;
        this.multicastMiddleware = Object.create(multicastMiddleware);

        this.sessionMiddleware = Object.create(busterSessionMiddleware);
        this.sessionMiddleware.multicast = this.multicastMiddleware.createClient();
        this.sessionMiddleware.resourceMiddleware = Object.create(busterResourceMiddleware);
        this.httpServer = http.createServer(function (req, res) {
            if (self.sessionMiddleware.respond(req, res)) return true;
            if (self.multicastMiddleware.respond(req, res)) return true;

            res.writeHead(h.NO_RESPONSE_STATUS_CODE);
            res.end();
        });
        this.httpServer.listen(h.SERVER_PORT, done);

        this.validSessionPayload = new Buffer(JSON.stringify({
            load: ["/foo.js"],
            resources: {
                "/foo.js": {
                    content: "var a = 5 + 5;"
                }
            }
        }), "utf8");
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "test emits event with session info when creating session": function (done) {
        var sessionStart = sinon.spy();
        this.sessionMiddleware.on("session:start", sessionStart);
        h.request({path: "/sessions", method: "POST"}, function (res, body) {
            buster.assert(sessionStart.calledOnce);
            var sessionInfo = sessionStart.getCall(0).args[0];
            buster.assert.equals("object", typeof(sessionInfo));
            done();
        }).end(this.validSessionPayload);
    },

    "test posting malformed data": function (done) {
        var self = this;
        h.request({path: "/sessions", method: "POST"}, function (res, body) {
            buster.assert.equals(500, res.statusCode);
            buster.assert.match(body, /invalid JSON/i);
            buster.assert.equals(0, self.sessionMiddleware.sessions.length);
            done();
        }).end("{not json}!");
    },

    "test posting data without resources": function (done) {
        var self = this;
        h.request({path: "/sessions", method: "POST"}, function (res, body) {
            buster.assert.equals(500, res.statusCode);
            buster.assert.match(body, /missing.+resources/i);
            buster.assert.equals(0, self.sessionMiddleware.sessions.length);
            done();
        }).end('{"load":[]}');
    },

    "test posting data without load": function (done) {
        var self = this;
        h.request({path: "/sessions", method: "POST"}, function (res, body) {
            buster.assert.equals(500, res.statusCode);
            buster.assert.match(body, /missing.+load/i);
            buster.assert.equals(0, self.sessionMiddleware.sessions.length);
            done();
        }).end('{"resources":[]}');
    },

    "test posting data with load entry not represented in resources": function (done) {
        var self = this;
        h.request({path: "/sessions", method: "POST"}, function (res, body) {
            buster.assert.equals(500, res.statusCode);
            buster.assert.match(body, /load.+\/foo\.js.+resources/i);
            buster.assert.equals(0, self.sessionMiddleware.sessions.length);
            done();
        }).end('{"load":["/foo.js"],"resources":[]}');
    },

    "with HTTP created session": {
        setUp: function (done) {
            var self = this;
            h.request({path: "/sessions", method: "POST"}, function (res, body) {
                self.res = res;
                self.sessionHttpData = JSON.parse(body);
                self.session = self.sessionMiddleware.sessions[0];
                done();
            }).end(this.validSessionPayload);
        },

        "test creating session": function () {
            buster.assert.equals(201, this.res.statusCode);
            buster.assert("location" in this.res.headers);
            buster.assert.match(this.res.headers.location, /^\/.+/);

            buster.assert("rootPath" in this.sessionHttpData);
            buster.assert.equals(this.res.headers.location, this.sessionHttpData.rootPath);

            buster.assert("resourceContextPath" in this.sessionHttpData);
            // resourceContextPath should be prefixed with rootPath.
            var expectedPrefix = this.sessionHttpData.resourceContextPath.slice(0, this.sessionHttpData.rootPath.length)
            buster.assert.equals(expectedPrefix, this.sessionHttpData.rootPath);

            buster.assert("multicastUrl" in this.sessionHttpData);
            buster.assert.equals(this.sessionHttpData.multicastUrl, this.sessionMiddleware.multicast.url);
            buster.assert("multicastClientId" in this.sessionHttpData);
            buster.assert.equals(this.sessionHttpData.multicastClientId, this.sessionMiddleware.multicast.clientId);
        },

        "test killing sessions": function (done) {
            var self = this;
            var sessionEnd = sinon.spy();
            this.sessionMiddleware.on("session:end", sessionEnd);
            h.request({path: this.session.rootPath, method: "DELETE"}, function (res, body) {
                buster.assert.equals(200, res.statusCode);
                buster.assert(sessionEnd.calledOnce);

                h.request({path: self.session.resourceContextPath + "/foo.js", method: "GET"}, function (res, body) {
                    buster.assert.equals(h.NO_RESPONSE_STATUS_CODE, res.statusCode);
                    h.request({path: self.session.rootPath, method: "GET"}, function (res, body) {
                        buster.assert.equals(h.NO_RESPONSE_STATUS_CODE, res.statusCode);
                        done();
                    }).end();
                }).end();
            }).end();
        },

        "test creating session with other session in progress": function (done) {
            h.request({path: "/sessions", method: "POST"}, function (res, body) {
                buster.assert.equals(202, res.statusCode);
                done();
            }).end(new Buffer(JSON.stringify({
                load: [],
                resources: {"/foo.js": {content: "5 + 5;"}}
            }), "utf8"));
        },

        "test killing first session with second session created": function (done) {
            var self = this;
            var sessionStart = sinon.spy();
            this.sessionMiddleware.on("session:start", sessionStart);
            h.request({path: "/sessions", method: "POST"}, function (res, body) {
                var newSession = JSON.parse(body);
                h.request({path: self.session.rootPath, method: "DELETE"}, function (res, body) {
                    buster.assert(sessionStart.calledOnce);
                    var sessionInfo = sessionStart.getCall(0).args[0];
                    buster.assert.equals(newSession.rootPath, sessionInfo.rootPath);
                    done();
                }).end();
            }).end(this.validSessionPayload);
        },

        "test killing session that isn't current does nothing but deleting the session": function (done) {
            var sessionStart = sinon.spy();
            this.sessionMiddleware.on("session:start", sessionStart);
            var sessionEnd = sinon.spy();
            this.sessionMiddleware.on("session:end", sessionEnd);

            h.request({path: "/sessions", method: "POST"}, function (res, body) {
                h.request({path: JSON.parse(body).rootPath, method: "DELETE"}, function () {
                    buster.assert.isFalse(sessionStart.called);
                    buster.assert.isFalse(sessionEnd.called);
                    done();
                }).end();
            }).end(this.validSessionPayload);
        }
    },

    "test programmatically created session is created and loaded": function (done) {
        this.sessionMiddleware.on("session:start", function (session) {
            buster.assert(session.resourceSet.resources.hasOwnProperty("foo"));
            done();
        });

        this.sessionMiddleware.createSession({load:[],resources:{"foo":{}}});
    },

    "test programmatically creating session with none-string or none-buffer as content": function () {
        var self = this;

        buster.assert.exception(function () {
            self.sessionMiddleware.createSession({load:[],resources:{"/foo.js":{content: 123}}});
        });

        buster.assert.exception(function () {
            self.sessionMiddleware.createSession({load:[],resources:{"/foo.js":{content: {}}}});
        });
    },

    "test programmatically created session throws on validation error": function () {
        var self = this;
        buster.assert.exception(function () {
            self.sessionMiddleware.createSession({});
        });
    },

    "test programmatically destroying session": function (done) {
        var session = this.sessionMiddleware.createSession({load:[],resources:[]});
        this.sessionMiddleware.destroySession(session.id);

        h.request({path: session.resourceContextPath + "/", method: "GET"}, function (res, body) {
            buster.assert.equals(res.statusCode, h.NO_RESPONSE_STATUS_CODE);
            done();
        }).end();
    },

    "test destroying session in queue with HTTP": function (done) {
        var self = this;

        var spy = sinon.spy.create();
        this.sessionMiddleware.on("session:end", spy);

        this.sessionMiddleware.createSession({load:[],resources:[]});
        this.sessionMiddleware.createSession({load:[],resources:[]});
        var session = this.sessionMiddleware.createSession({load:[],resources:[]});

        h.request({path: session.rootPath, method: "DELETE"}, function (res, body) {
            // Callback is only called when current session ends.
            buster.assert.equals(0, spy.callCount);

            buster.assert.equals(2, self.sessionMiddleware.sessions.length);

            var sessionInList = false;
            for (var i = 0, ii = self.sessionMiddleware.sessions.length; i < ii; i++) {
                if (self.sessionMiddleware.sessions[i] == session) sessionInList = true;
            }
            buster.assert.isFalse(sessionInList);

            done();
        }).end();
    },

    "test destroying session in queue programmatically": function () {
        this.sessionMiddleware.createSession({load:[],resources:[]});
        this.sessionMiddleware.createSession({load:[],resources:[]});
        var session = this.sessionMiddleware.createSession({load:[],resources:[]});

        this.sessionMiddleware.destroySession(session.id);

        buster.assert.equals(2, this.sessionMiddleware.sessions.length);

        var sessionInList = false;
        for (var i = 0, ii = this.sessionMiddleware.sessions.length; i < ii; i++) {
            if (this.sessionMiddleware.sessions[i] == session) sessionInList = true;
        }
        buster.assert.isFalse(sessionInList);
    },

    "test has messaging": function (done) {
        var self = this;
        h.request({path: this.sessionMiddleware.multicast.url, method: "POST"}, function (res, body) {
            buster.assert.equals(201, res.statusCode);

            h.request({path: self.sessionMiddleware.multicast.url, method: "GET"}, function (res, body) {
                buster.assert.equals(200, res.statusCode);
                var data = JSON.parse(body);
                buster.assert.equals(1, data.length);
                buster.assert.equals("foo", data[0].topic);
                buster.assert.equals("bar", data[0].data);
                done();
            }).end();
        }).end(new Buffer('[{"topic":"foo","data":"bar"}]', "utf8"));
    }
});
