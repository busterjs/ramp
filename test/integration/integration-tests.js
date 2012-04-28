var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCapServ = require("../../lib/buster-capture-server");
var bResources = require("buster-resources");
var http = require("http");
var when = require("when");
var h = require("./../test-helper");
var PhantomFactory = require("./phantom-factory");


var uuid = require("node-uuid");

function createServerBundle(done) {
    var bundle = {};
    bundle.httpServer = http.createServer(function (req, res) {
        res.writeHead(h.NO_RESPONSE_STATUS_CODE); res.end();
    });
    bundle.httpServer.listen(h.SERVER_PORT, function () {
        bundle.httpServer.WTF = uuid();
        done();
    });

    reqSocks = [];
    bundle.httpServer.on("connection", function (sock) { reqSocks.push(sock) });

    bundle.s = bCapServ.createServer();
    bundle.s.attach(bundle.httpServer);

    bundle.c = bCapServ.createServerClient({
        host: "0.0.0.0",
        port: h.SERVER_PORT
    });

    bundle.p = new PhantomFactory();

    return {
        extend: function (test) {
            buster.extend(test, bundle);
        },

        tearDown: function (done) {
            var promises = [this.tearDownServer(), this.tearDownBrowsers()];
            when.all(promises).then(done)
        },

        tearDownServer: function () {
            var deferred = when.defer();

            bundle.httpServer.on("close", deferred.resolve);
            bundle.httpServer.close();
            reqSocks.forEach(function (s) { s.destroy(); });

            return deferred.promise;
        },

        tearDownBrowsers: function () {
            return when.all(bundle.p.killAll());
        }
    }
}

buster.testRunner.timeout = 2000;
buster.testCase("Integration", {
    setUp: function (done) {
        var self = this;

        this.serverBundle = createServerBundle(done);
        this.serverBundle.extend(this);
    },

    tearDown: function (done) {
        this.serverBundle.tearDown(done);
    },

    "test one browser": function (done) {
        var self = this;

        this.p.capture(done(function (slave, phantom) {
            assert.equals(self.s._sessionQueue.slaves.length, 1);
        }));
    },

    "test multiple browsers": function (done) {
        var self = this;

        this.p.capture(function (slave, phantom) {
            assert.equals(self.s._sessionQueue.slaves.length, 1);

            self.p.capture(function (slave, phantom2) {
                assert.equals(self.s._sessionQueue.slaves.length, 2);

                phantom.kill().then(function () {
                    assert.equals(self.s._sessionQueue.slaves.length, 1);

                    phantom2.kill().then(done(function () {
                        assert.equals(self.s._sessionQueue.slaves.length, 0);
                    }));
                });
            });
        });
    },

    "test posting events from session": function (done) {
        var self = this;

        this.p.capture(function (slave, phantom) {
            var rs = bResources.resourceSet.create();
            rs.addResource({
                path: "/test.js",
                content: 'buster.emit("some:event", 123);'
            });
            rs.loadPath.append("/test.js");

            self.c.createSession({resourceSet: rs}).then(function (session) {
                var sc = bCapServ.createSessionClient({
                    host: "0.0.0.0",
                    port: h.SERVER_PORT,
                    session: session
                });
                sc.connect();
                sc.on("some:event", done(function (data) {
                    assert.equals(data, 123);
                }));
            });
        });
    },

    "test subscribing to events from session": function (done) {
        var self = this;
        this.p.capture(function (slave, phantom) {
            var rs = bResources.resourceSet.create();
            rs.addResource({
                path: "/test.js",
                content: [
                    'buster.on("some:event", function (data) {',
                    '    buster.emit("other:event", data);',
                    '});'].join("\n")
            });
            rs.loadPath.append("/test.js");

            self.c.createSession({resourceSet: rs}).then(function (session) {
                var sc = bCapServ.createSessionClient({
                    host: "0.0.0.0",
                    port: h.SERVER_PORT,
                    session: session
                });
                sc.connect()
                sc.loaded.then(function () {
                    sc.on("other:event", done(function (data) {
                        assert.equals(data, 123);
                    }));
                    sc.emit("some:event", 123);
                });
            });
        });
    },

    "test loading second session": function (done) {
        var self = this;
        assert(true);
        var rs = bResources.resourceSet.create();

        this.p.capture(function (slave, phantom) {
            self.c.createSession({resourceSet: rs}).then(function (sess1) {
                var sc1 = bCapServ.createSessionClient({
                    host: "0.0.0.0",
                    port: h.SERVER_PORT,
                    session: sess1
                });
                sc1.connect()
                sc1.loaded.then(function () {
                    assert.equals(sess1.id, sc1.session.id);
                    sc1.end();
                });

                sc1.unloaded.then(function () {
                    self.c.createSession({resourceSet: rs}).then(function (sess2) {
                        var sc2 = bCapServ.createSessionClient({
                            host: "0.0.0.0",
                            port: h.SERVER_PORT,
                            session: sess2
                        });
                        sc2.connect()
                        sc2.loaded.then(done(function () {
                            assert.equals(sess2.id, sc2.session.id);
                        }));
                    });
                });
            });
        });
    },

    "test recaptures when server restarts": function (done) {
        var self = this;
        var oldServerBundle = this.serverBundle;

        var timesCaptured = 0;

        this.c.connect();
        this.c.on("slave:captured", function () {
            if (++timesCaptured == 2) {
                assert(true);
                oldServerBundle.tearDownBrowsers().then(done);
            }
        })

        this.p.capture(function (slave, phantom) {
            self.serverBundle.tearDownServer().then(function () {
                self.serverBundle = createServerBundle(function () {});
            });
        });
    },

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