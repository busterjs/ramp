var buster = require("buster");
var http = require("http");
var vm = require("vm");
var sinon = require("sinon");
var busterSessionMiddleware = require("./../lib/session/session-middleware");

var h = require("./test-helper");

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
                    content: "5 + 5;"
                },
                "/bar/baz.js": {
                    content: "5 + 5;",
                    headers: {"Content-Type": "text/custom"}
                }
            }
        }), "utf8")
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

    "with created session": {
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
                buster.assert.equals("5 + 5;", body);
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

        "test provides session environment script": function (done) {
            var self = this;
            h.request({path: this.session.rootPath + "/env.js", method: "GET"}, function (res, body) {
                buster.assert.equals(200, res.statusCode);
                buster.assert.equals("text/javascript", res.headers["content-type"]);

                var ctx = {};
                vm.runInNewContext(body, ctx);
                buster.assert.equals("object", typeof ctx.buster);
                buster.assert.equals(self.session.rootPath, ctx.buster.rootPath);
                buster.assert.equals(self.session.resourceContextPath, ctx.buster.resourceContextPath);

                done();
            }).end();
        },

        "test inserts buster scripts and session scripts into root resource": function (done) {
            var self = this;
            h.request({path: this.session.resourceContextPath + "/", method: "GET"}, function (res, body) {
                buster.assert.match(body, '<script src="' + self.session.rootPath  + '/env.js"');
                buster.assert.match(body, '<script src="' + self.session.resourceContextPath  + '/foo.js"');
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
        }
    }
});