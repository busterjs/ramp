var buster = require("buster");
var http = require("http");
var vm = require("vm");
var sinon = require("sinon");
var busterSessionMiddleware = require("./../lib/session/session-middleware");

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
        this.sessionMiddleware = Object.create(busterSessionMiddleware);
        this.httpServer = http.createServer(function (req, res) {
            if (!self.sessionMiddleware.respond(req, res)) {
                res.writeHead(h.NO_RESPONSE_STATUS_CODE);
                res.end();
            };
        });
        this.httpServer.listen(h.SERVER_PORT, done);

        this.validSessionPayload = new Buffer(JSON.stringify({
            load: ["/foo.js"],
            resources: {
                "/foo.js": {
                    content: "var a = 5 + 5;"
                },
                "/foo.min.js": {
                    content: "var a = 5 + 5;",
                    minify: true
                },
                "/bar/baz.js": {
                    content: "var b = 5 + 5; // Yes",
                    headers: {"Content-Type": "text/custom"}
                },
                "/other": {
                    backend: "http://localhost:" + h.PROXY_PORT + "/"
                },
                "/bundle.js": {
                    combine: ["/foo.js", "/bar/baz.js"],
                    headers: { "Expires": "Sun, 15 Mar 2012 22:22 37 GMT" }
                },
                "/bundle.min.js": {
                    combine: ["/bundle.js"],
                    minify: true
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

    "test returns temporary work-in-progress list of known resources": function (done) {
        h.request({path: "/resources", method: "GET"}, function (res, body) {
            buster.assert.equals(200, res.statusCode);
            buster.assert.equals(body, "[]");
            done();
        }).end();
    },

    "with HTTP created session": {
        setUp: function (done) {
            var self = this;
            h.request({path: "/sessions", method: "POST"}, function (res, body) {
                self.res = res;
                self.session = JSON.parse(body);
                done();
            }).end(this.validSessionPayload);
        },

        "test creating session": function () {
            buster.assert.equals(201, this.res.statusCode);
            buster.assert("location" in this.res.headers);
            buster.assert.match(this.res.headers.location, /^\/.+/);

            buster.assert("rootPath" in this.session);
            buster.assert.equals(this.res.headers.location, this.session.rootPath);

            buster.assert("resourceContextPath" in this.session);
            // resourceContextPath should be prefixed with rootPath.
            var expectedPrefix = this.session.resourceContextPath.slice(0, this.session.rootPath.length)
            buster.assert.equals(expectedPrefix, this.session.rootPath);
        },

        "test hosts resources": function (done) {
            h.request({path: this.session.resourceContextPath + "/foo.js", method: "GET"}, function (res, body) {
                buster.assert.equals(200, res.statusCode);
                buster.assert.equals("var a = 5 + 5;", body);
                buster.assert.equals("text/javascript", res.headers["content-type"]);
                done();
            }).end();
        },

        "test hosts resources with custom headers": function (done) {
            h.request({path: this.session.resourceContextPath + "/bar/baz.js", method: "GET"}, function (res, body) {
                buster.assert.equals(200, res.statusCode);
                buster.assert.equals("text/custom", res.headers["content-type"]);
                done();
            }).end();
        },

        "test provides default root resource": function (done) {
            h.request({path: this.session.resourceContextPath + "/", method: "GET"}, function (res, body) {
                buster.assert.equals(200, res.statusCode);
                buster.assert.equals("text/html", res.headers["content-type"]);
                done();
            }).end();
        },

        "test does not serve none existing resources": function (done) {        
            h.request({path: this.session.resourceContextPath + "/does/not/exist.js", method: "GET"}, function (res, body) {
                buster.assert.equals(h.NO_RESPONSE_STATUS_CODE, res.statusCode);
                done();
            }).end();
        },

        "test inserts session scripts into root resource": function (done) {
            var self = this;
            h.request({path: this.session.resourceContextPath + "/", method: "GET"}, function (res, body) {
                buster.assert.match(body, '<script src="' + self.session.resourceContextPath  + '/foo.js"');
                done();
            }).end();
        },

        "test inserts script middleware scripts into root resource": function (done) {
            var self = this;
            h.request({path: this.session.resourceContextPath + "/", method: "GET"}, function (res, body) {
                buster.assert.match(body, '<script src="' + self.session.rootPath  + require.resolve("buster-core") + '"');
                done();
            }).end();
        },

        "test loads script middleware scripts before resource scripts": function (done) {
            var self = this;
            h.request({path: this.session.resourceContextPath + "/", method: "GET"}, function (res, body) {
                var scriptTags = body.match(/<script.+>/g);
                buster.assert.match(scriptTags[0], '<script src="' + self.session.rootPath  + require.resolve("buster-core") + '"');
                done();
            }).end();
        },

        "test serves script middleware": function (done) {
            h.request({path: this.session.rootPath  + require.resolve("buster-core"), method: "GET"}, function (res, body) {
                buster.assert.equals(200, res.statusCode);
                done();
            }).end();
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
        },

        "proxy requests": {
            setUp: function (done) {
                this.proxyBackend = http.createServer(function (req, res) {
                    res.writeHead(200, { "X-Buster-Backend": "Yes" });
                    res.end("PROXY: " + req.url);
                });

                this.proxyBackend.listen(h.PROXY_PORT, done);
            },

            tearDown: function (done) {
                this.proxyBackend.on("close", done);
                this.proxyBackend.close();
            },

            "should proxy requests to /other": function (done) {
                h.request({
                    path: this.session.resourceContextPath + "/other/file.js",
                    method: "GET"
                }, function (res, body) {
                    buster.assert.equals(200, res.statusCode);
                    buster.assert.equals(body, "PROXY: /other/file.js");
                    buster.assert.equals(res.headers["x-buster-backend"], "Yes");
                    done();
                }).end();
            }
        },

        "bundles": {
            "should serve combined contents with custom header": function (done) {
                h.request({
                    path: this.session.resourceContextPath + "/bundle.js",
                    method: "GET"
                }, function (res, body) {
                    buster.assert.equals(200, res.statusCode);
                    buster.assert.equals(body, "var a = 5 + 5;var b = 5 + 5; // Yes");
                    buster.assert.match(res.headers, {
                        "expires": "Sun, 15 Mar 2012 22:22 37 GMT"
                    });

                    done();
                }).end();
            },

            "should serve combined contents minified": function (done) {
                h.request({
                    path: this.session.resourceContextPath + "/bundle.min.js",
                    method: "GET"
                }, function (res, body) {
                    buster.assert.equals(200, res.statusCode);
                    buster.assert.equals(body, "var a=10,b=10");
                    done();
                }).end();
            },

            "should serve single resource contents minified": function (done) {
                h.request({
                    path: this.session.resourceContextPath + "/foo.min.js",
                    method: "GET"
                }, function (res, body) {
                    buster.assert.equals(200, res.statusCode);
                    buster.assert.equals(body, "var a=10");
                    done();
                }).end();
            }
        }
    },

    "test programmatically created session is created and loaded": function (done) {
        this.sessionMiddleware.on("session:start", function (session) {
            buster.assert(session.resources.hasOwnProperty("foo"));
            done();
        });

        this.sessionMiddleware.createSession({load:[],resources:{"foo":{}}});
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
    }
});
