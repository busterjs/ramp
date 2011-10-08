var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var captureMiddleware = require("./../lib/capture/capture-middleware");
var captureMiddlewareClient = require("./../lib/capture/captured-client");
var resourceMiddleware = require("./../lib/resources/resource-middleware");
var busterServer = require("./../lib/buster-server");

var fs = require("fs");
var http = require("http");
var h = require("./test-helper");

buster.testCase("Client middleware", {
    setUp: function (done) {
        var self = this;
        this.httpServer = http.createServer(function (req, res) {
            res.writeHead(h.NO_RESPONSE_STATUS_CODE);
            res.end();
        });

        this.httpServer.listen(h.SERVER_PORT, done);

        this.busterServer = busterServer.create(self.httpServer);
        this.cm = this.busterServer.capture;
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

        this.cm.captureUrl = "/foo";
        h.request({ path: "/foo", method: "GET" }, function () {}).end();
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
        otherCm.server = this.busterServer;
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

    "client with header resource": {
        setUp: function (done) {
            var self = this;

            this.cm.header(80, {
                resources: {"/": {content: "Hello, World!"}}
            });

            this.cm.oncapture = function (req, res, client) {
                delete self.cm.oncapture;
                self.client = client;
                done();
            };
            this.cm.captureClient();
        },

        "test serves frameset": function (done) {
            h.request({path: this.client.url, method: "GET"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.match(body, '<frame src="/clientHeader/" />');
                buster.assert.match(body, '<frameset rows="0px,80px,*"');
                done();
            }).end();
        },

        "test creates resource set": function (done) {
            h.request({path: "/clientHeader/", method: "GET"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(body, "Hello, World!");
                done();
            }).end();
        }
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

        "index page": {
            setUp: function (done) {
                var self = this;
                h.request({path: this.client.url}, function (res, body) {
                    self.res = res;
                    self.body = body;
                    done();
                }).end();
            },

            "should be served as text/html": function () {
                assert.equals(this.res.statusCode, 200);
                assert.equals(this.res.headers["content-type"], "text/html");
            },

            "should serve frameset": function () {
                assert.match(this.body, "<frameset");
            },

            "should serve control frame": function () {
                assert.match(this.body, '<frame src="' + this.client.url + '/control_frame.html" id="control_frame" />');
            },

            "should serve session frame with no session loaded": function () {
                assert.match(this.body, '<frame id="client_frame" />');
            },
        }

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
                assert.equals(scope.buster.env.bayeuxUrl, "http://0.0.0.0:" + h.SERVER_PORT + "/sessions/messaging");
                assert.equals(self.client.id, scope.buster.env.clientId);

                // Scope where buster is already defined
                var scope = {buster: {}};
                require("vm").runInNewContext(body, scope);
                assert("buster" in scope);
                assert("env" in scope.buster);
                assert.equals(typeof(scope.buster.env), "object");
                assert.equals(scope.buster.env.bayeuxUrl, "http://0.0.0.0:" + h.SERVER_PORT + "/sessions/messaging");
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

        "test publishes /session/start when session is present and is ready": function (done) {
            this.busterServer.bayeux.subscribe("/" + this.client.id + "/session/start", function () {
                assert(true);
                done();
            });

            this.client.startSession({foo: "bar"});
            this.client.ready();
        },

        "test ready event broadcasts session": function (done) {
            this.client.ready = function () {
                assert(true);
                done();
            };

            this.busterServer.bayeux.publish("/" + this.client.id + "/ready", 1);
        }
    }
});