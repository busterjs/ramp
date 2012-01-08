var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var bCapServSlave = require("./../lib/slave");
var busterServer = require("./../lib/buster-capture-server");
var faye = require("faye");

var fs = require("fs");
var http = require("http");
var h = require("./test-helper");

buster.testCase("Slaves", {
    setUp: function (done) {
        var self = this;
        this.httpServer = http.createServer(function (req, res) {
            res.writeHead(h.NO_RESPONSE_STATUS_CODE);
            res.end();
        });

        this.httpServer.listen(h.SERVER_PORT, done);

        this.busterServer = busterServer.create();
        this.busterServer.attach(this.httpServer);
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "test creating/capturing slave": function (done) {
        this.stub(bCapServSlave, "startSession");
        this.busterServer.oncapture =  function (req, res, slave) {
            assert(typeof(slave), "object");
            refute(slave.startSession.called);
            res.end();
            done();
        };

        h.request({path: this.busterServer.capturePath, method: "GET"}, function () {}).end();
    },

    "test capturing slave with session in progress": function (done) {
        this.busterServer.createSession({});
        this.stub(bCapServSlave, "startSession");
        this.busterServer.oncapture = function (req, res, slave) {
            assert(slave.startSession.calledOnce);
            res.end();
            done();
        };
        h.request({path: this.busterServer.capturePath, method: "GET"}, function () {}).end();
    },

    "test capturing slave with none-joinable session in progress": function (done) {
        var self = this;
        this.stub(bCapServSlave, "startSession");

        this.busterServer.oncapture = function (req, res, slave) {
            res.end();
        };

        h.request({path: this.busterServer.capturePath, method: "GET"}, function () {
            // Start the session as soon as the first slave is captured
            self.busterServer.createSession({joinable: false});

            // TODO: test that the 2nd slave is the one that isn't started.
            h.request({path: self.busterServer.capturePath, method: "GET"}, function () {
                assert(bCapServSlave.startSession.calledOnce);
                done();
            }).end();
        }).end();
    },

    "test different slaves gets different URLs": function (done) {
        var slaves = [];
        this.busterServer.oncapture = function (req, res, slave) {
            slaves.push(slave);
            res.end();

            if (slaves.length == 2) {
                refute.equals(slaves[0].url, slaves[1].url);
                done();
            }
        };

        h.request({path: this.busterServer.capturePath, method: "GET"}, function () {}).end();
        h.request({path: this.busterServer.capturePath, method: "GET"}, function () {}).end();
    },

    "test default capture URL": function (done) {
        this.busterServer.oncapture = function (req, res, slave) {
            res.end();
            done();
        };

        h.request({ path: this.busterServer.capturePath, method: "GET" }, function () {}).end();
        assert(true);
    },

    "test custom capture URL": function (done) {
        this.busterServer.oncapture = function (req, res, slave) {
            res.end();
            done();
        };

        this.busterServer.capturePath = "/foo";
        h.request({ path: "/foo", method: "GET" }, function () {}).end();
        assert(true);
    },

    "test creating slave without oncapture handler": function (done) {
        var self = this;

        h.request({path: this.busterServer.capturePath, method: "GET"}, function (res, body) {
            assert.equals(res.statusCode, 400);
            assert.match(body, "'oncapture' handler");
            assert.equals(self.busterServer.slaves.length, 0);
            done()
        }).end();
    },

    "slave with header resource": {
        setUp: function (done) {
            var self = this;

            this.busterServer.header(80, {
                resources: {"/": {content: "Hello, World!"}}
            });

            this.busterServer.oncapture = function (req, res, slave) {
                delete self.busterServer.oncapture;
                self.slave = slave;
                res.end();
                done();
            };

            h.request({path: this.busterServer.capturePath, method: "GET"}, function () {
            }).end();
        },

        "test serves frameset": function (done) {
            h.request({path: this.slave.url, method: "GET"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.match(body, '<frame src="/slaveHeader/" />');
                buster.assert.match(body, '<frameset rows="0px,80px,*"');
                done();
            }).end();
        },

        "test creates resource set": function (done) {
            h.request({path: "/slaveHeader/", method: "GET"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(body, "Hello, World!");
                done();
            }).end();
        },

        "test setting new header removes old header": function (done) {
            var self = this;
            this.busterServer.headerResourceSet.contextPath = "/foo";

            h.request({path: "/foo/", method: "GET"}, function (res, body) {
                assert.equals(res.statusCode, 200);

                self.busterServer.header(80, {});
                h.request({path: "/foo/", method: "GET"}, function (res, body) {
                    assert.equals(res.statusCode, h.NO_RESPONSE_STATUS_CODE);
                    done();
                }).end();
            }).end();
        }
    },

    "with a slave": {
        setUp: function (done) {
            var self = this;
            this.busterServer.oncapture = function (req, res, slave) {
                delete self.busterServer.oncapture;
                self.slave = slave;
                res.end();
                done();
            };

            h.request({path: this.busterServer.capturePath, method: "GET"}, function () {
            }).end();
        },

        "should remove slave resource set when destroying": function (done) {
            var self = this;
            h.request({path: this.slave.url + "/env.js"}, function (res, body) {
                assert.equals(res.statusCode, 200);

                self.slave.on("end", function () {
                    h.request({path: self.slave.url  + "/env.js"}, function (res, body) {
                        assert.equals(res.statusCode, h.NO_RESPONSE_STATUS_CODE);
                        done();
                    }).end();
                });
                h.emulateCloseBrowser(self.slave);
            }).end();

        },

        "index page": {
            setUp: function (done) {
                var self = this;
                h.request({path: this.slave.url}, function (res, body) {
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
                assert.match(this.body, '<frame src="' + this.slave.url + '/control_frame.html" id="control_frame" />');
            },

            "should serve session frame with no session loaded": function () {
                assert.match(this.body, '<frame id="slave_frame" />');
            },
        },

        "serving env.js": {
            setUp: function (done) {
                var self = this;
                h.request({path: this.slave.url + "/env.js"}, function (res, body) {
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
                assert.equals(this.slave.id, scope.buster.env.slaveId);
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
            this.slave.env.foo = "bar";

            h.request({path: this.slave.url + "/env.js"}, function (res, body) {
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
            this.slave.resourceSet.load = [
                "/foo.js",
                "/bar.js",
                "/baz/maz.js"
            ];

            h.request({path: this.slave.url + "/control_frame.html"}, function (res, body) {
                assert.equals(res.statusCode, 200);
                assert.equals(res.headers["content-type"], "text/html");
                assert.match(body, self.slave.url + "/foo.js");
                assert.match(body, self.slave.url + "/bar.js");
                assert.match(body, self.slave.url + "/baz/maz.js");
                done();
            }).end();
        },

        "test slave serves all scripts": function (done) {
            var self = this;

            this.slave.resourceSet.load = ["/foo.js", "/bar/baz.js"];
            this.slave.resourceSet.addResource("/foo.js", {content:"doing it"});
            this.slave.resourceSet.addResource("/bar/baz.js", {content:"buster yo"});

            h.request({path: this.slave.url + "/foo.js", method: "GET"}, function (res, body) {
                assert.equals(200, res.statusCode);
                assert.equals("doing it", body);

                h.request({path: self.slave.url + "/bar/baz.js", method: "GET"}, function (res, body) {
                    assert.equals(200, res.statusCode);
                    assert.equals("buster yo", body);
                    done();
                }).end();
            }).end();
        },

        "test slave serves all built-in scripts": function (done) {
            var self = this;
            var numResponses = 0;
            var handler = function (res, script) {
                assert.equals(200, res.statusCode, "Built-in script '" + script + "' failed to load");
                numResponses++;
                if (numResponses == self.slave.resourceSet.load.length) done();
            }

            for (var i = 0, ii = this.slave.resourceSet.load.length; i < ii; i++) {
                (function (script) {
                    h.request({path: self.slave.url + script, method: "GET"}, function (res, body) {
                        handler(res, script);
                    }).end();
                }(this.slave.resourceSet.load[i]));
            }
        },

        "test publishes /session/start when session is present and is ready": function (done) {
            this.busterServer.bayeux.subscribe("/" + this.slave.id + "/session/start", function (sess) {
                assert.equals(actualSession.toJSON(), sess);
                done();
            });

            var actualSession = this.busterServer.createSession({});
            this.slave.bayeuxClient.publish("/" + this.slave.id + "/ready", "abc123");
        },

        "test faye disconnect destroys the slave": function (done) {
            var self = this;
            var bayeuxClient = new faye.Client(
                "http://localhost:"
                    + h.SERVER_PORT
                    + this.busterServer.messagingContextPath
            );

            assert(true);
            this.slave.on("end", done);

            bayeuxClient.connect(function () {
                var publication = bayeuxClient.publish(
                    "/" + self.slave.id + "/ready",
                    bayeuxClient.getClientId()
                );

                publication.callback(function () {
                    bayeuxClient.disconnect();
                });
            }, bayeuxClient);
        }
    }
});