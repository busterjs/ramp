var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var http = require("http");
var faye = require("faye");
var bCapServ = require("./../../lib/buster-capture-server");
var h = require("./../test-helper");

var createServer = function (port, cb) {
    var httpServer = http.createServer(function (req, res) {
        res.writeHead(h.NO_RESPONSE_STATUS_CODE);
        res.end();
    });
    httpServer.listen(port, cb);

    var reqConns = [];
    httpServer.on("connection", function (sock) { reqConns.push(sock); });

    var captureServer = bCapServ.create();
    captureServer.attach(httpServer);

    return {
        httpServer: httpServer,
        captureServer: captureServer,
        kill: function (cb) {
            // Ensure all connections are nuked out of orbit
            reqConns.forEach(function (c) { c.destroy(); });

            httpServer.on("close", cb);
            httpServer.close();
        }
    }
};

buster.testRunner.timeout = 1000;
buster.testCase("Integration", {
    setUp: function (done) {
        this.srv = createServer(h.SERVER_PORT, done);
        this.captureServer = this.srv.captureServer;
    },

    tearDown: function (done) {
        this.srv.kill(done);
    },

    "test one browser": function (done) {
        var self = this;

        h.capture(this.srv, function (slave, phantom) {
            assert.equals(self.captureServer.slaves().length, 1);
            phantom.kill(function () {
                assert.equals(self.captureServer.slaves().length, 0);
                done();
            });
        });
    },

    "test multiple browsers": function (done) {
        var self = this;

        h.capture(this.srv, function (slave, phantom) {
            assert.equals(self.captureServer.slaves().length, 1);

            h.capture(self.srv, function (slave, phantom2) {
                assert.equals(self.captureServer.slaves().length, 2);

                phantom.kill(function () {
                    assert.equals(self.captureServer.slaves().length, 1);

                    phantom2.kill(function () {
                        assert.equals(self.captureServer.slaves().length, 0);
                        done();
                    });
                });
            });
        });
    },

    "test posting events from session": function (done) {
        var self = this;
        h.capture(this.srv, function (slave, phantom) {
            var session = self.captureServer.createSession({
                resourceSet: {
                    resources: [
                        {
                            path: "/test.js",
                            content: 'buster.publish("/some/event", 123);'
                        }
                    ],
                    loadPath: ["/test.js"]
                }
            });

            h.bayeuxForSession(session).subscribe("/some/event", function (data) {
                assert.equals(data, 123);
                phantom.kill(done);
            });
        });
    },

    "test subscribing to events from session": function (done) {
        var self = this;
        h.capture(this.srv, function (slave, phantom) {
            var session = self.captureServer.createSession({
                resourceSet: {
                    resources: [
                        {
                            path: "/test.js",
                            content: [
                                'var subs = buster.subscribe("/some/event", function (data) {',
                                '    buster.publish("/other/event", data);',
                                '});'].join("\n")
                        }
                    ],
                    loadPath: ["/test.js"]
                }
            });

            var sessionBayeux = h.bayeuxForSession(session);

            self.srv.captureServer.bayeux.subscribe("/session/start", function (s) {
                sessionBayeux.publish("/some/event", 123);
                assert.equals(session, s);
            });

            sessionBayeux.subscribe("/other/event", function (data) {
                assert.equals(data, 123);
                phantom.kill(done);
            });
        });
    },

    "test loading second session": function (done) {
        var self = this;
        var bayeux = self.srv.captureServer.bayeux;
        h.capture(this.srv, function (slave, phantom) {
            var sess1 = self.captureServer.createSession({});
            h.bayeuxSubscribeOnce(bayeux, "/session/start", function (s) {
                assert.equals(sess1, s);

                h.bayeuxSubscribeOnce(bayeux, "/session/end", function (s) {
                    var sess2 = self.captureServer.createSession({});
                    h.bayeuxSubscribeOnce(bayeux, "/session/start", function (s) {
                        assert.equals(sess2, s);
                        phantom.kill(done);
                    });
                });
                self.srv.captureServer.endSession(sess1.id);
            });
        });
    },

    "test recaptures when server restarts": function (done) {
        var port = h.SERVER_PORT + 1;
        var srv1 = createServer(port, function () {
            h.capture(srv1, function (slave1, phantom) {
                srv1.kill(function () {
                    var srv2 = createServer(port, function () {
                        srv2.captureServer.oncapture = function (req, res, slave2) {
                            refute.same(slave1, slave2);
                            res.writeHead(200);
                            res.end();
                            srv2.kill(function () {
                                phantom.kill(done);
                            });
                        };
                    });
                });
            });
        });
    },

    "test loads session when slave is captured": function (done) {
        var self = this;
        var sess = this.captureServer.createSession({
            resourceSet: {
                resources: [
                    {path: "/test.js", content: 'buster.publish("/some/event", 123);'}
                ],
                loadPath: ["/test.js"]
            }
        });
        var bayeux = this.srv.captureServer.bayeux;
        h.bayeuxSubscribeOnce(bayeux, "/session/start", function (s) {
            var phantom;
            h.capture(self.srv, function (slave, p) { phantom = p; });
            h.bayeuxForSession(sess).subscribe("/some/event", function (data) {
                assert.equals(data, 123);
                phantom.kill(done);
            });
        });
    },

    "test is able to relative path lookups in slaves": function (done) {
        var session = this.captureServer.createSession({
            resourceSet: {
                resources: [
                    {
                        path: "/",
                        content: [
                            '<!DOCTYPE html>',
                            '<html>',
                            '  <head>',
                            '    <script src="foo.js"></script>',
                            '  </head>',
                            '  <body></body>',
                            '</html>'].join("\n")
                    },
                    {
                        path: "/foo.js",
                        content: [
                            'window.addEventListener("load", function () {',
                            '  buster.publish("/some/event", 123);',
                            '});'].join("\n")
                    }
                ]
            }
        });

        h.capture(this.srv, function (slave, phantom) {
            h.bayeuxForSession(session).subscribe("/some/event", function (data) {
                assert.equals(data, 123);
                phantom.kill(done);
            });
        });
    },

    "test refreshing slave URL": function (done) {
        var self = this;
        h.capture(this.srv, function (slave, phantom) {
            var slaveUrl = "http://127.0.0.1:" + self.srv.httpServer.address().port + slave.url;
            phantom.kill(function () {
                var phantom2 = h.Phantom(function () {
                    phantom2.open(slaveUrl, function () {
                        assert(true);
                        done();
                    });
                });
            });
        });
    }
});