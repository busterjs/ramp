var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCaptureServer = require("../../lib/buster-capture-server");
var http = require("http");
var when = require("when");
var h = require("./../test-helper");
var PhantomFactory = require("./phantom-factory");

buster.testRunner.timeout = 500;
buster.testCase("Integration", {
    setUp: function (done) {
        var self = this;

        this.httpServer = http.createServer(function (req, res) {
            res.writeHead(h.NO_RESPONSE_STATUS_CODE); res.end();
        });
        this.httpServer.listen(h.SERVER_PORT, done);

        this.reqSocks = [];
        this.httpServer.on("connection", function (sock) { self.reqSocks.push(sock) });

        this.s = bCaptureServer.createServer();
        this.s.attach(this.httpServer);

        this.c = bCaptureServer.createServerClient({
            host: "0.0.0.0",
            port: h.SERVER_PORT
        });

        this.p = new PhantomFactory();
    },

    tearDown: function (done) {
        var promises = [];

        var httpDeferred = when.defer();
        promises.push(httpDeferred.promise);

        this.httpServer.on("close", httpDeferred.resolve);
        this.httpServer.close();

        this.reqSocks.forEach(function (s) { s.destroy(); });

        promises = promises.concat(this.p.killAll());
        when.all(promises).then(done);
    },

    "test one browser": function (done) {
        var self = this;

        this.p.capture(done(function (slave, phantom) {
            assert.equals(self.s.sessionQueue.slaves.length, 1);
        }));
    },

    "test multiple browsers": function (done) {
        var self = this;

        this.p.capture(function (slave, phantom) {
            assert.equals(self.s.sessionQueue.slaves.length, 1);

            self.p.capture(function (slave, phantom2) {
                assert.equals(self.s.sessionQueue.slaves.length, 2);

                phantom.kill().then(function () {
                    assert.equals(self.s.sessionQueue.slaves.length, 1);

                    phantom2.kill().then(function () {
                        assert.equals(self.s.sessionQueue.slaves.length, 0);
                        done();
                    });
                });
            });
        });
    },

    // "test posting events from session": function (done) {
    //     var self = this;
    //     ih.capture(this.srv, function (slave, phantom) {
    //         self.captureServer.createSession({
    //             resourceSet: {
    //                 resources: [
    //                     {
    //                         path: "/test.js",
    //                         content: 'buster.publish("/some/event", 123);'
    //                     }
    //                 ],
    //                 loadPath: ["/test.js"]
    //             }
    //         }).then(function (session) {
    //             h.bayeuxForSession(session).subscribe("/some/event", function (data) {
    //                 assert.equals(data, 123);
    //                 phantom.kill(done);
    //             });
    //         });
    //     });
    // },

    // "test subscribing to events from session": function (done) {
    //     var self = this;
    //     ih.capture(this.srv, function (slave, phantom) {
    //         self.captureServer.createSession({
    //             resourceSet: {
    //                 resources: [
    //                     {
    //                         path: "/test.js",
    //                         content: [
    //                             'var subs = buster.subscribe("/some/event", function (data) {',
    //                             '    buster.publish("/other/event", data);',
    //                             '});'].join("\n")
    //                     }
    //                 ],
    //                 loadPath: ["/test.js"]
    //             }
    //         }).then(function (session) {
    //             var sessionBayeux = h.bayeuxForSession(session);

    //             self.srv.captureServer.bayeux.subscribe("/session/start", function (e) {
    //                 sessionBayeux.publish("/some/event", 123);
    //                 assert.equals(session, e.session);
    //             });

    //             sessionBayeux.subscribe("/other/event", function (data) {
    //                 assert.equals(data, 123);
    //                 phantom.kill(done);
    //             });
    //         });
    //     });
    // },

    // "test loading second session": function (done) {
    //     var self = this;
    //     var bayeux = self.srv.captureServer.bayeux;
    //     ih.capture(this.srv, function (slave, phantom) {
    //         self.captureServer.createSession({}).then(function (sess1) {
    //             h.bayeuxSubscribeOnce(bayeux, "/session/start", function (e) {
    //                 assert.equals(sess1, e.session);

    //                 h.bayeuxSubscribeOnce(bayeux, "/session/end", function (e) {
    //                     self.captureServer.createSession({}).then(function (sess2) {
    //                         h.bayeuxSubscribeOnce(bayeux, "/session/start", function (e) {
    //                             assert.equals(sess2, e.session);
    //                             phantom.kill(done);
    //                         });
    //                     });
    //                 });
    //                 self.srv.captureServer.endSession(sess1.id);
    //             });
    //         });
    //     });
    // },

    // // TODO: Figure out why this test causes errors in node's http.js
    // "//test recaptures when server restarts": function (done) {
    //     var port = h.SERVER_PORT + 1;
    //     var srv1 = ih.createServer(port, function () {
    //         ih.capture(srv1, function (slave1, phantom) {
    //             srv1.kill(function () {
    //                 var srv2 = ih.createServer(port, function () {
    //                     srv2.captureServer.oncapture = function (req, res, slave2) {
    //                         refute.same(slave1, slave2);
    //                         res.writeHead(200);
    //                         res.end();
    //                         srv2.kill(function () {
    //                             phantom.kill(done);
    //                         });
    //                     };
    //                 });
    //             });
    //         });
    //     });
    // },

    // "test loads session when slave is captured": function (done) {
    //     var self = this;
    //     var bayeux = this.srv.captureServer.bayeux;
    //     this.captureServer.createSession({
    //         resourceSet: {
    //             resources: [
    //                 {path: "/test.js", content: 'buster.publish("/some/event", 123);'}
    //             ],
    //             loadPath: ["/test.js"]
    //         }
    //     }).then(function (sess) {
    //         h.bayeuxSubscribeOnce(bayeux, "/session/start", function (e) {
    //             var phantom;
    //             ih.capture(self.srv, function (slave, p) { phantom = p; });
    //             h.bayeuxForSession(sess).subscribe("/some/event", function (data) {
    //                 assert.equals(data, 123);
    //                 phantom.kill(done);
    //             });
    //         });
    //     });
    // },

    // "test is able to relative path lookups in slaves": function (done) {
    //     var self = this;
    //     this.captureServer.createSession({
    //         resourceSet: {
    //             resources: [
    //                 {
    //                     path: "/",
    //                     content: [
    //                         '<!DOCTYPE html>',
    //                         '<html>',
    //                         '  <head>',
    //                         '    <script src="foo.js"></script>',
    //                         '  </head>',
    //                         '  <body></body>',
    //                         '</html>'].join("\n")
    //                 },
    //                 {
    //                     path: "/foo.js",
    //                     content: [
    //                         'window.addEventListener("load", function () {',
    //                         '  buster.publish("/some/event", 123);',
    //                         '});'].join("\n")
    //                 }
    //             ]
    //         }
    //     }).then(function (session) {
    //         ih.capture(self.srv, function (slave, phantom) {
    //             h.bayeuxForSession(session).subscribe("/some/event", function (data) {
    //                 assert.equals(data, 123);
    //                 phantom.kill(done);
    //             });
    //         });
    //     });
    // },

    // "test refreshing slave URL": function (done) {
    //     var self = this;
    //     ih.capture(this.srv, function (slave, phantom) {
    //         var slaveUrl = "http://127.0.0.1:" + self.srv.httpServer.address().port + slave.url;
    //         phantom.kill(function () {
    //             var phantom2 = ih.Phantom(function () {
    //                 phantom2.open(slaveUrl, function () {
    //                     assert(true);
    //                     phantom2.kill(done);
    //                 });
    //             });
    //         });
    //     });
    // },

    // "test provides buster.env.contextPath": function (done) {
    //     var self = this;
    //     this.captureServer.createSession({
    //         resourceSet: {
    //             resources: [
    //                 {
    //                     path: "/foo.js",
    //                     content: 'var e = document.createElement("script"); e.src = buster.env.contextPath + "/bar.js"; document.body.appendChild(e);'
    //                 },
    //                 {
    //                     path: "/bar.js",
    //                     content: 'buster.publish("/some/event", 123);'
    //                 }
    //             ],
    //             loadPath: ["/foo.js"]
    //         }
    //     }).then(function (session) {
    //         ih.capture(self.srv, function (slave, phantom) {
    //             h.bayeuxForSession(session).subscribe("/some/event", function (data) {
    //                 assert.equals(data, 123);
    //                 phantom.kill(done);
    //             });
    //         });
    //     });
    // },

    // "provides buster.env.id": function (done) {
    //     var self = this;
    //     this.captureServer.createSession({
    //         resourceSet: {
    //             resources: [
    //                 {
    //                     path: "/foo.js",
    //                     content: 'buster.publish("/some/event", buster.env.id);'
    //                 },
    //             ],
    //             loadPath: ["/foo.js"]
    //         }
    //     }).then(function (session) {
    //         ih.capture(self.srv, function (slave, phantom) {
    //             h.bayeuxForSession(session).subscribe("/some/event", function (data) {
    //                 assert.equals(data, slave.id);
    //                 phantom.kill(done);
    //             });
    //         });
    //     });
    // }
});