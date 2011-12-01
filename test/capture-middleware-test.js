var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var captureMiddleware = require("./../lib/capture/capture-middleware");
var captureMiddlewareClient = require("./../lib/capture/captured-client");
var resourceMiddleware = require("./../lib/resources/resource-middleware");
var busterServer = require("./../lib/buster-capture-server");

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

        this.busterServer = busterServer.create();
        this.busterServer.attach(this.httpServer);
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
            refute(client.startSession.called);
            res.end();
            done();
        };

        h.request({path: this.cm.capturePath, method: "GET"}, function () {}).end();
    },

    "test capturing client with session in progress": function (done) {
        this.cm.startSession({});
        this.stub(captureMiddlewareClient, "startSession");
        this.cm.oncapture = function (req, res, client) {
            assert(client.startSession.calledOnce);
            res.end();
            done();
        };
        h.request({path: this.cm.capturePath, method: "GET"}, function () {}).end();
    },

    "test capturing client with none-joinable session in progress": function (done) {
        var self = this;
        this.stub(captureMiddlewareClient, "startSession");

        this.cm.oncapture = function (req, res, client) {
            res.end();
        };

        h.request({path: this.cm.capturePath, method: "GET"}, function () {
            // Start the session as soon as the first client is captured
            self.cm.startSession({joinable: false});

            // TODO: test that the 2nd client is the one that isn't started.
            h.request({path: self.cm.capturePath, method: "GET"}, function () {
                assert(captureMiddlewareClient.startSession.calledOnce);
                done();
            }).end();
        }).end();
    },

    "test different clients gets different URLs": function (done) {
        var clients = [];
        this.cm.oncapture = function (req, res, client) {
            clients.push(client);
            res.end();

            if (clients.length == 2) {
                refute.equals(clients[0].url, clients[1].url);
                done();
            }
        };

        h.request({path: this.cm.capturePath, method: "GET"}, function () {}).end();
        h.request({path: this.cm.capturePath, method: "GET"}, function () {}).end();
    },

    "test default capture URL": function (done) {
        this.cm.oncapture = function (req, res, client) {
            res.end();
            done();
        };

        h.request({ path: this.cm.capturePath, method: "GET" }, function () {}).end();
        assert(true);
    },

    "test custom capture URL": function (done) {
        this.cm.oncapture = function (req, res, client) {
            res.end();
            done();
        };

        this.cm.capturePath = "/foo";
        h.request({ path: "/foo", method: "GET" }, function () {}).end();
        assert(true);
    },

    "test creating client without oncapture handler": function (done) {
        var self = this;

        h.request({path: this.cm.capturePath, method: "GET"}, function (res, body) {
            assert.equals(res.statusCode, 500);
            assert.match(body, "'oncapture' handler");
            assert.equals(self.cm.capturedClients.length, 0);
            done()
        }).end();
    },

    "test first client on new server gets different id": function (done) {
        var otherCm = Object.create(captureMiddleware);
        otherCm.server = this.busterServer;
        otherCm.resourceMiddleware = Object.create(resourceMiddleware);

        var clients = [];
        var captureHandler = function (req, res, client) {
            clients.push(client);
            res.end();

            if (clients.length == 2) {
                refute.equals(clients[0].id, clients[1].id);
                done();
            }
        };

        this.cm.oncapture = captureHandler;
        h.request({path: this.cm.capturePath, method: "GET"}, function () {}).end();

        otherCm.oncapture = captureHandler;
        h.request({path: otherCm.capturePath, method: "GET"}, function () {}).end();
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
                res.end();
                done();
            };

            h.request({path: this.cm.capturePath, method: "GET"}, function () {
            }).end();
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
                res.end();
                done();
            };

            h.request({path: this.cm.capturePath, method: "GET"}, function () {
            }).end();
        },

        "should remove client resource set when destroying": function (done) {
            var self = this;
            h.request({path: this.client.url + "/env.js"}, function (res, body) {
                assert.equals(res.statusCode, 200);

                self.cm.destroyClient(self.client);

                h.request({path: self.client.url  + "/env.js"}, function (res, body) {
                    assert.equals(res.statusCode, h.NO_RESPONSE_STATUS_CODE);
                    done();
                }).end();
            }).end();

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
        },

        "serving env.js": {
            setUp: function (done) {
                var self = this;
                h.request({path: this.client.url + "/env.js"}, function (res, body) {
                    self.res = res;
                    self.body = body;

                    done();
                }).end();
            },

            "test responds with 200 OK": function () {
                assert.equals(this.res.statusCode, 200);
            },

            "test serves with correct content-type": function () {
                assert.equals(this.res.headers["content-type"], "application/javascript");
            },

            "test in clean scope": function () {
                var scope = {};
                require("vm").runInNewContext(this.body, scope);

                assert("buster" in scope);
                assert("env" in scope.buster);
                assert.equals(typeof(scope.buster.env), "object");
                assert.equals(scope.buster.env.bayeuxPath, "/sessions/messaging");
                assert.equals(this.client.id, scope.buster.env.clientId);
            },

            "test in scope where buster is already defined": function () {
                var scope = {buster: {}};
                require("vm").runInNewContext(this.body, scope);
                assert("buster" in scope);
                assert("env" in scope.buster);
                assert.equals(typeof(scope.buster.env), "object");
                assert.equals(scope.buster.env.bayeuxPath, "/sessions/messaging");
            }
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
            var sessionMiddleware = this.busterServer.session;

            this.stub(this.cm, "startSession");
            sessionMiddleware.emit("session:start", session);
            assert(this.cm.startSession.calledOnce);
            assert(this.cm.startSession.calledWithExactly(session));

            this.stub(this.cm, "endSession");
            sessionMiddleware.emit("session:end");
            assert(this.cm.endSession.calledOnce);
        },

        "test publishes /session/start when session is present and is ready": function (done) {
            this.busterServer.bayeux.subscribe("/" + this.client.id + "/session/start", function (sess) {
                assert.equals(sess, {foo: "bar"});
                done();
            });

            this.client.startSession({toJSON: function () { return {foo: "bar"}}});
            this.client.bayeuxClient.publish("/" + this.client.id + "/ready", "abc123");
        },

        "test ready event broadcasts session": function (done) {
            this.busterServer.bayeux.subscribe("/" + this.client.id + "/session/start", function (sess) {
                assert(true);
                done();
            });

            this.client.currentSession = {toJSON: function () { return {foo: "bar"}}};
            this.busterServer.bayeux.publish("/" + this.client.id + "/ready", "abc123");
        }
    },

    "with multiple clients": {
        setUp: function (done) {
            var self = this;
            var i = 0;

            this.cm.oncapture = function (req, res, client) {
                switch (++i) {
                case 1:
                    self.clientA = client;
                    break;
                case 2:
                    self.clientB = client;
                    break;
                case 3:
                    self.clientC = client;
                    done()
                    break;
                }

                res.end();
            };

            h.request({path: this.cm.capturePath, method: "GET"}, function () {}).end();
            h.request({path: this.cm.capturePath, method: "GET"}, function () {}).end();
            h.request({path: this.cm.capturePath, method: "GET"}, function () {}).end();
        },

        "test destroying one client": function () {
            this.stub(this.clientB, "destroy");
            this.cm.destroyClient(this.clientB);

            assert.equals(this.cm.capturedClients.length, 2);
            assert.equals(this.cm.capturedClients.indexOf(this.clientB), -1);
            assert(this.clientB.destroy.calledOnce);
        },

        "test destroying client by bayeux client id": function () {
            this.stub(this.clientB, "destroy");
            this.clientA.bayeuxClientId = "123abc";
            this.clientB.bayeuxClientId = "456abc";
            this.clientC.bayeuxClientId = "123def";

            this.cm.destroyClientByBayeuxClientId("456abc");

            assert.equals(this.cm.capturedClients.length, 2);
            assert.equals(this.cm.capturedClients.indexOf(this.clientB), -1);
            assert(this.clientB.destroy.calledOnce);
        },

        "test creating session lists clients": function (done) {
            var self = this;
            h.request({path: "/sessions", method: "POST"}, function (res, body) {
                var response = JSON.parse(body);

                assert.match(response.clients, [
                    {id: self.clientA.id}, {id: self.clientB.id}, {id: self.clientC.id}
                ]);
                
                done();
            }).end(new Buffer(JSON.stringify({
                resourceSet: {load: [],resources: {}}
            }), "utf8"));
        }
    }
});