var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var bCapServSlave = require("./../lib/slave");
var busterServer = require("./../lib/buster-capture-server");

var fs = require("fs");
var http = require("http");
var h = require("./test-helper");

buster.testCase("Slave", {
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

    "instances gets different URLs": function (done) {
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

    "with header resource": {
        setUp: function (done) {
            var self = this;

            this.headerResourceSet = this.busterServer.header(80, {
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

        "serves frameset": function (done) {
            h.request({path: this.slave.url, method: "GET"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.match(body, '<frame src="/slaveHeader/" />');
                buster.assert.match(body, '<frameset rows="0px,80px,*"');
                done();
            }).end();
        },

        "creates resource set": function (done) {
            h.request({path: "/slaveHeader/", method: "GET"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(body, "Hello, World!");
                done();
            }).end();
        },

        "removes old header when setting new header": function (done) {
            var self = this;
            this.headerResourceSet.contextPath = "/foo";

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

    "instance": {
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

        "removes slave resource set when destroying": function (done) {
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

            "is served as text/html": function () {
                assert.equals(this.res.statusCode, 200);
                assert.equals(this.res.headers["content-type"], "text/html");
            },

            "serves frameset": function () {
                assert.match(this.body, "<frameset");
            },

            "serves control frame": function () {
                assert.match(this.body, '<frame src="' + this.slave.url + '/control_frame.html" id="control_frame" />');
            },

            "serves session frame with no session loaded": function () {
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

            "responds with 200 OK": function () {
                assert.equals(this.res.statusCode, 200);
            },

            "serves with correct content-type": function () {
                assert.equals(this.res.headers["content-type"], "application/javascript");
            },

            "in scope where buster is already defined": function () {
                var scope = {buster: {}};
                require("vm").runInNewContext(this.body, scope);
                assert("buster" in scope);
                assert("env" in scope.buster);
                assert.equals(typeof(scope.buster.env), "object");
                assert.equals(scope.buster.env.bayeuxPath, "/sessions/messaging");
            }
        },

        "custom env variables": function (done) {
            this.slave.env.foo = "bar";

            h.request({path: this.slave.url + "/env.js"}, function (res, body) {
                assert.equals(res.statusCode, 200);
                assert.equals(res.headers["content-type"], "application/javascript");

                var scope = {buster: {}};
                require("vm").runInNewContext(body, scope);
                assert.equals("bar", scope.buster.env.foo);
                done();
            }).end();
        },

        "loads all scripts in control_frame.html": function (done) {
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

        "serves all scripts": function (done) {
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

        "serves all built-in scripts": function (done) {
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

        "publishes /session/start when session is present and is ready": function (done) {
            this.busterServer.bayeux.subscribe("/" + this.slave.id + "/session/start", function (sess) {
                assert.equals(actualSession.toJSON(), sess);
                done();
            });

            var actualSession = this.busterServer.createSession({});
            this.busterServer.bayeux.publish("/" + this.slave.id + "/ready", "abc123");
        }
    }
});