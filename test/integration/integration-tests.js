var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var http = require("http");
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

        h.capture(this.captureServer, function (slave, phantom) {
            assert.equals(self.captureServer.slaves.length, 1);
            phantom.kill(function () {
                assert.equals(self.captureServer.slaves.length, 0);
                done();
            });
        });
    },

    "test multiple browsers": function (done) {
        var self = this;

        h.capture(this.captureServer, function (slave, phantom) {
            assert.equals(self.captureServer.slaves.length, 1);

            h.capture(self.captureServer, function (slave, phantom2) {
                assert.equals(self.captureServer.slaves.length, 2);

                phantom.kill(function () {
                    assert.equals(self.captureServer.slaves.length, 1);

                    phantom2.kill(function () {
                        assert.equals(self.captureServer.slaves.length, 0);
                        done();
                    });
                });
            });
        });
    },

    "test posting events from session": function (done) {
        var self = this;
        h.capture(this.captureServer, function (slave, phantom) {
            var session = self.captureServer.createSession({
                resourceSet: {
                    resources: {
                        "/test.js": {
                            content: 'buster.publish("/some/event", 123);'
                        }
                    },
                    load: ["/test.js"]
                }
            });

            session.subscribe("/some/event", function (data) {
                assert.equals(data, 123);
                phantom.kill(done);
            });
        });
    },

    "test subscribing to events from session": function (done) {
        var self = this;
        h.capture(this.captureServer, function (slave, phantom) {
            var session = self.captureServer.createSession({
                resourceSet: {
                    resources: {
                        "/test.js": {
                            content: [
                                'var subs = buster.subscribe("/some/event", function (data) {',
                                '    buster.publish("/other/event", data);',
                                '});'].join("\n")
                        }
                    },
                    load: ["/test.js"]
                }
            });

            slave.on("sessionLoaded", function (s) {
                var publ = session.publish("/some/event", 123);
                assert.same(session, s);
            });

            session.subscribe("/other/event", function (data) {
                assert.equals(data, 123);
                phantom.kill(done);
            });
        });
    },

    "test loading second session": function (done) {
        var self = this;
        h.capture(this.captureServer, function (slave, phantom) {
            var sess1 = self.captureServer.createSession({});
            slave.once("sessionLoaded", function (s) {
                assert.same(sess1, s);
                sess1.on("end", function () {
                    var sess2 = self.captureServer.createSession({});
                    slave.once("sessionLoaded", function (s) {
                        assert.same(sess2, s);
                        done();
                    });
                });
                sess1.end();
            });
        });
    }
});