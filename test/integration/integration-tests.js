var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var http = require("http");
var bCapServ = require("./../../lib/buster-capture-server");
var h = require("./../test-helper");

buster.testRunner.timeout = 1000;
buster.testCase("Integration", {
    setUp: function (done) {
        var self = this;

        this.httpServer = http.createServer(function (req, res) {
            res.writeHead(h.NO_RESPONSE_STATUS_CODE);
            res.end();
        });
        this.httpServer.listen(h.SERVER_PORT, done);

        this.reqConns = [];
        this.httpServer.on("connection", function (socket) {
            self.reqConns.push(socket);
        });

        this.server = bCapServ.create();
        this.server.attach(this.httpServer);
    },

    tearDown: function (done) {
        // Ensure all connections are nuked out of orbit
        this.reqConns.forEach(function (c) { c.destroy(); });

        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "test one browser": function (done) {
        var self = this;

        h.capture(this.server, function (slave, phantom) {
            assert.equals(self.server.slaves.length, 1);
            phantom.kill(function () {
                assert.equals(self.server.slaves.length, 0);
                done();
            });
        });
    },

    "test multiple browsers": function (done) {
        var self = this;

        h.capture(this.server, function (slave, phantom) {
            assert.equals(self.server.slaves.length, 1);

            h.capture(self.server, function (slave, phantom2) {
                assert.equals(self.server.slaves.length, 2);

                phantom.kill(function () {
                    assert.equals(self.server.slaves.length, 1);

                    phantom2.kill(function () {
                        assert.equals(self.server.slaves.length, 0);
                        done();
                    });
                });
            });
        });
    },

    "test posting events from session": function (done) {
        var self = this;
        h.capture(this.server, function (slave, phantom) {
            var session = self.server.createSession({
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
        h.capture(this.server, function (slave, phantom) {
            var session = self.server.createSession({
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
        h.capture(this.server, function (slave, phantom) {
            var sess1 = self.server.createSession({});
            slave.once("sessionLoaded", function (s) {
                assert.same(sess1, s);
                sess1.on("end", function () {
                    var sess2 = self.server.createSession({});
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