var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var captureMiddleware = require("./../lib/capture/capture-middleware");
var captureMiddlewareClient = require("./../lib/capture/captured-client");
var multicastMiddleware = require("buster-multicast").multicastMiddleware;
var resourceMiddleware = require("./../lib/resources/resource-middleware");
var busterServer = require("./../lib/buster-server");

var fs = require("fs");
var http = require("http");
var h = require("./test-helper");

buster.testCase("Client middleware", {
    setUp: function (done) {
        var self = this;
        this.busterServer = busterServer.create();
        this.cm = this.busterServer.capture;
        this.httpServer = http.createServer(function (req, res) {
            if (self.busterServer.respond(req, res)) return;

            res.writeHead(h.NO_RESPONSE_STATUS_CODE);
            res.end();
        });
        this.httpServer.listen(h.SERVER_PORT, done);
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "test creating/capturing client": function (done) {
        this.stub(captureMiddlewareClient, "startSession");
        this.cm.oncapture =  function (req, res, client) {
            assert(typeof(client), "object");
            assert.isFalse(client.startSession.called);
            done();
        };
        this.cm.captureClient();
    },

    "test capturing client with session in progress": function (done) {
        this.cm.startSession({});
        this.stub(captureMiddlewareClient, "startSession");
        this.cm.oncapture = function (req, res, client) {
            assert(client.startSession.calledOnce);
            done();
        };
        this.cm.captureClient();
    },

    "test different clients gets different URLs": function (done) {
        var clients = [];
        this.cm.oncapture = function (req, res, client) {
            clients.push(client);

            if (clients.length == 2) {
                refute.equals(clients[0].url, clients[1].url);
                done();
            }
        };

        this.cm.captureClient();
        this.cm.captureClient();
    },

    "test default capture URL": function (done) {
        this.cm.oncapture = function (req, res, client) {
            res.end();
            done();
        };

        h.request({ path: this.cm.captureUrl, method: "GET" }, function () {}).end();
        assert(true);
    },

    "test custom capture URL": function (done) {
        this.cm.oncapture = function (req, res, client) {
            res.end();
            done();
        };

        this.cm.captureUrl = "/";
        h.request({ path: this.cm.captureUrl, method: "GET" }, function () {}).end();
        assert(true);
    },

    "test creating client without oncapture handler": function (done) {
        try {
            this.cm.captureClient();
        } catch (e) {
            assert.match(e.message, "'oncapture' handler");
            assert.equals(this.cm.capturedClients.length, 0);
            done();
        }
    },

    "test first client on new server gets different id": function (done) {
        var otherCm = Object.create(captureMiddleware);
        otherCm.multicastMiddleware = Object.create(multicastMiddleware);
        otherCm.resourceMiddleware = Object.create(resourceMiddleware);
        var clients = [];
        var captureHandler = function (req, res, client) {
            clients.push(client);

            if (clients.length == 2) {
                refute.equals(clients[0].id, clients[1].id);
                done();
            }
        };

        this.cm.oncapture = captureHandler;
        this.cm.captureClient();
        otherCm.oncapture = captureHandler;
        otherCm.captureClient();
    },

    "with a client": {
        setUp: function (done) {
            var self = this;
            this.cm.oncapture = function (req, res, client) {
                delete self.cm.oncapture;
                self.client = client;
                done();
            };
            this.cm.captureClient();
        },

        "test getting client index page": function (done) {
            var self = this;
            h.request({path: this.client.url}, function (res, body) {
                assert.equals(res.statusCode, 200);
                assert.equals(res.headers["content-type"], "text/html");
                assert.match(body, "<frameset");
                assert.match(body, /\<frame .*src=..+control_frame\.html./);
                assert.equals(body.match(/\<frame/g).length - 1, 2);
                assert.match(body, self.client.url + "/control_frame.html");
                done();
            }).end();
        },

        "test serves env.js": function (done) {
            var self = this;
            h.request({path: this.client.url + "/env.js"}, function (res, body) {
                assert.equals(res.statusCode, 200);
                assert.equals(res.headers["content-type"], "application/javascript");

                // Clean scope
                var scope = {};
                require("vm").runInNewContext(body, scope);
                assert("buster" in scope);
                assert("env" in scope.buster);
                assert.equals(typeof(scope.buster.env), "object");
                assert.equals(scope.buster.env.multicastUrl, self.client.url + "/createMulticast");
                assert.equals(self.client.id, scope.buster.env.clientId);

                // Scope where buster is already defined
                var scope = {buster: {}};
                require("vm").runInNewContext(body, scope);
                assert("buster" in scope);
                assert("env" in scope.buster);
                assert.equals(typeof(scope.buster.env), "object");
                assert.equals(scope.buster.env.multicastUrl, self.client.url + "/createMulticast");
                done();
            }).end();
        },

        "test setting custom env variables": function (done) {
            this.client.env.foo = "bar";

            h.request({path: this.client.url + "/env.js"}, function (res, body) {
                assert.equals(res.statusCode, 200);
                assert.equals(res.headers["content-type"], "application/javascript");

                var scope = {};
                require("vm").runInNewContext(body, scope);
                assert.equals("bar", scope.buster.env.foo);
                done();
            }).end();
        },

        "test control_frame.html loads all scripts": function (done) {
            var self = this;
            this.client.resourceSet.load = [
                "/foo.js",
                "/bar.js",
                "/baz/maz.js"
            ];

            h.request({path: this.client.url + "/control_frame.html"}, function (res, body) {
                assert.equals(res.statusCode, 200);
                assert.equals(res.headers["content-type"], "text/html");
                assert.match(body, self.client.url + "/foo.js");
                assert.match(body, self.client.url + "/bar.js");
                assert.match(body, self.client.url + "/baz/maz.js");
                done();
            }).end();
        },

        "test client serves all scripts": function (done) {
            var self = this;

            this.client.resourceSet.load = ["/foo.js", "/bar/baz.js"];
            this.client.resourceSet.addResource("/foo.js", {content:"doing it"});
            this.client.resourceSet.addResource("/bar/baz.js", {content:"buster yo"});

            h.request({path: this.client.url + "/foo.js", method: "GET"}, function (res, body) {
                assert.equals(200, res.statusCode);
                assert.equals("doing it", body);

                h.request({path: self.client.url + "/bar/baz.js", method: "GET"}, function (res, body) {
                    assert.equals(200, res.statusCode);
                    assert.equals("buster yo", body);
                    done();
                }).end();
            }).end();
        },

        "test client serves all built-in scripts": function (done) {
            var self = this;
            var numResponses = 0;
            var handler = function (res, script) {
                assert.equals(200, res.statusCode, "Built-in script '" + script + "' failed to load");
                numResponses++;
                if (numResponses == self.client.resourceSet.load.length) done();
            }

            for (var i = 0, ii = this.client.resourceSet.load.length; i < ii; i++) {
                (function (script) {
                    h.request({path: self.client.url + script, method: "GET"}, function (res, body) {
                        handler(res, script);
                    }).end();
                }(this.client.resourceSet.load[i]));
            }
        },

        "test binding to session middleware": function () {
            var session = {foo: "test"};
            var sessionMiddleware = Object.create(buster.eventEmitter);
            this.cm.bindToSessionMiddleware(sessionMiddleware);

            this.stub(this.cm, "startSession");
            sessionMiddleware.emit("session:start", session);
            assert(this.cm.startSession.calledOnce);
            assert(this.cm.startSession.calledWithExactly(session));

            this.stub(this.cm, "endSession");
            sessionMiddleware.emit("session:end");
            assert(this.cm.endSession.calledOnce);
        },

        "test emits session:start to client when multicast and session is present": function () {
            var session = {};
            var multicast = {emitToClient: this.spy(), clientId: 123};
            this.client.startSession(session);
            this.client.attachMulticast(multicast);

            assert(multicast.emitToClient.calledOnce);
            assert(multicast.emitToClient.calledWithExactly(123, "session:start", session));
        },

        "test responds to multicast middleware client creation": function (done) {
            var self = this;
            h.request({path: this.client.createMulticastUrl, method: "POST"}, function (res, body) {
                assert.typeOf(self.client.multicast, "object");
                done();
            }).end();
        },
    }
});