var buster = require("buster");
var clientMiddleware = require("./../lib/capture/client-middleware");
var clientMiddlewareClient = require("./../lib/capture/client");

var fs = require("fs");
var http = require("http");
var h = require("./test-helper");

buster.testCase("Client middleware", {
    setUp: function (done) {
        var self = this;
        this.cm = clientMiddleware.create();
        this.httpServer = http.createServer(function (req, res) {
            if (!self.cm.respond(req, res)) {
                res.writeHead(h.NO_RESPONSE_STATUS_CODE);
                res.end();
            }
        });
        this.httpServer.listen(h.SERVER_PORT, done);
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "test creating/capturing client": function () {
        this.stub(clientMiddlewareClient, "startSession");
        var client = this.cm.createClient();
        buster.assert(typeof(client), "object");
        buster.assert.isFalse(client.startSession.called);
    },

    "test capturing client with session in progress": function () {
        this.cm.startSession({});
        this.stub(clientMiddlewareClient, "startSession");
        var client = this.cm.createClient();
        buster.assert(client.startSession.calledOnce);
    },

    "test different clients gets different URLs": function () {
        var clientOne = this.cm.createClient();
        var clientTwo = this.cm.createClient();

        buster.assert.notEquals(clientOne.url, clientTwo.url);
    },

    "with a client": {
        setUp: function () {
            var self = this;
            this.client = this.cm.createClient();
        },

        "test getting client index page": function (done) {
            var self = this;
            h.request({path: this.client.url}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(res.headers["content-type"], "text/html");
                buster.assert.match(body, "<frameset");
                buster.assert.match(body, /\<frame .*src=..+buster\.html./);
                buster.assert.equals(body.match(/\<frame/g).length - 1, 2);
                buster.assert.match(body, self.client.url + "/buster.html");
                done();
            }).end();
        },

        "test serves env.js": function (done) {
            var self = this;
            h.request({path: this.client.url + "/env.js"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(res.headers["content-type"], "text/javascript");

                // Clean scope
                var scope = {};
                require("vm").runInNewContext(body, scope);
                buster.assert("buster" in scope);
                buster.assert("env" in scope.buster);
                buster.assert.equals(typeof(scope.buster.env), "object");
                buster.assert.equals(scope.buster.env.multicastUrl, self.client.multicast.url);

                // Scope where buster is already defined
                var scope = {buster: {}};
                require("vm").runInNewContext(body, scope);
                buster.assert("buster" in scope);
                buster.assert("env" in scope.buster);
                buster.assert.equals(typeof(scope.buster.env), "object");
                buster.assert.equals(scope.buster.env.multicastUrl, self.client.multicast.url);
                done();
            }).end();
        },

        "test setting custom env variables": function (done) {
            this.client.env.foo = "bar";

            h.request({path: this.client.url + "/env.js"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(res.headers["content-type"], "text/javascript");

                var scope = {};
                require("vm").runInNewContext(body, scope);
                buster.assert.equals("bar", scope.buster.env.foo);
                done();
            }).end();
        },

        "test client has messaging": function (done) {
            // We're kind of testing the messaging middleware here, but what
            // the hey. It's important that a client has messaging so we're
            // adding a full integration test for that.
            var self = this;
            h.request({path: self.client.multicast.url, method: "POST"}, function (res, body) {
                buster.assert.equals(201, res.statusCode);

                h.request({path: self.client.multicast.url, method: "GET"}, function (res, body) {
                    buster.assert.equals(200, res.statusCode);
                    var data = JSON.parse(body);
                    buster.assert.equals(1, data.length);
                    buster.assert.equals("foo", data[0].topic);
                    buster.assert.equals("bar", data[0].data);
                    done();
                }).end();
            }).end(new Buffer('[{"topic":"foo","data":"bar"}]', "utf8"));
        },

        "test buster.html loads all scripts": function (done) {
            var self = this;
            this.client.scriptServingMiddleware._scripts = [
                {path: "/foo.js", read:function(){}},
                {path: "/bar.js", read:function(){}},
                {path: "/baz/maz.js", read:function(){}}
            ];

            h.request({path: this.client.url + "/buster.html"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(res.headers["content-type"], "text/html");
                buster.assert.match(body, self.client.url + "/foo.js");
                buster.assert.match(body, self.client.url + "/bar.js");
                buster.assert.match(body, self.client.url + "/baz/maz.js");
                done();
            }).end();
        },

        "test client serves all scripts": function (done) {
            var self = this;
            this.client.scriptServingMiddleware._scripts = [
                {
                    path: "/foo.js",
                    read: function (done) { done("doing it"); }
                },
                {
                    path: "/bar/baz.js",
                    read: function (done) { done("buster yo"); }
                }
            ];

            h.request({path: this.client.url + "/foo.js", method: "GET"}, function (res, body) {
                buster.assert.equals(200, res.statusCode);
                buster.assert.equals("doing it", body);

                h.request({path: self.client.url + "/bar/baz.js", method: "GET"}, function (res, body) {
                    buster.assert.equals(200, res.statusCode);
                    buster.assert.equals("buster yo", body);
                    done();
                }).end();
            }).end();
        },

        "test client serves all built-in scripts": function (done) {
            var self = this;
            var numResponses = 0;
            var handler = function (res, script) {
                buster.assert.equals(200, res.statusCode, "Built-in script '" + script.path + "' failed to load");
                numResponses++;
                if (numResponses == self.client.scriptServingMiddleware.scripts.length) done();
            }

            for (var i = 0, ii = this.client.scriptServingMiddleware.scripts.length; i < ii; i++) {
                (function (script) {
                    h.request({path: self.client.url + script.path, method: "GET"}, function (res, body) {
                        handler(res, script);
                    }).end();
                }(this.client.scriptServingMiddleware.scripts[i]));
            }
        },

        "test binding to session middleware": function (done) {
            var self = this;
            var sessionMiddleware = Object.create(buster.eventEmitter);
            this.cm.bindToSessionMiddleware(sessionMiddleware);

            var msgUrl = this.client.multicast.url;
            sessionMiddleware.emit("session:start", {foo: "test"});
            h.request({path: msgUrl, method: "GET"}, function (res, body) {
                buster.assert.equals(JSON.parse(body)[0].data.foo, "test");

                sessionMiddleware.emit("session:end");
                h.request({path: msgUrl, method: "GET"}, function (res, body) {
                    done();
                }).end();
            }).end();
        }
    }
});