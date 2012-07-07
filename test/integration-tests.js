var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCapServ = require("./../lib/buster-capture-server");
var rampResources = require("ramp-resources");
var http = require("http");
var when = require("when");
var PhantomFactory = require("./phantom-factory");
var cp = require("child_process");

var uuid = require("node-uuid");

function createServerBundle(port, tc, done) {
    var bundle = {};

    var cs = cp.spawn("node", [__dirname + "/server-loader.js", port]);
    cs.stderr.pipe(process.stderr);
    cs.stdout.setEncoding("utf8");
    cs.stdout.on("data", function (data) {
        bundle.port = parseInt(data, 10);
        bundle.c = bCapServ.createServerClient(bundle.port);
        bundle.c.connect();
        bundle.p = new PhantomFactory(bundle.port);
        buster.extend(tc, bundle);
        done();
    });

    return {
        tearDown: function (done) {
            var promises = [this.tearDownServer(), this.tearDownBrowsers(), bundle.c.disconnect];
            when.all(promises).then(done)
        },

        tearDownServer: function () {
            var deferred = when.defer();

            cs.on("exit", deferred.resolve);
            cs.kill("SIGKILL");

            return deferred.promise;
        },

        tearDownBrowsers: function () {
            return when.all(bundle.p.killAll());
        }
    }
}

buster.testRunner.timeout = 4000;
buster.testCase("Integration", {
    setUp: function (done) {
        var self = this;

        this.serverBundle = createServerBundle(0, this, done);
    },

    tearDown: function (done) {
        this.serverBundle.tearDown(done);
    },

    "test one browser": function (done) {
        var self = this;

        assert.equals(this.c.slaves.length, 0);

        this.p.capture(done(function (slave, phantom) {
            assert.equals(self.c.slaves.length, 1);
            assert.match(self.c.slaves[0], slave);
        }));
    },

    "test multiple browsers": function (done) {
        var self = this;

        assert.equals(this.c.slaves.length, 0);

        this.p.capture(function (slave1, phantom) {
            assert.equals(self.c.slaves.length, 1);
            assert.match(self.c.slaves[0], slave1);

            self.p.capture(function (slave2, phantom2) {
                assert.equals(self.c.slaves.length, 2);
                assert.match(self.c.slaves[0], slave1);
                assert.match(self.c.slaves[1], slave2);

                phantom.kill().then(function () {
                    assert.equals(self.c.slaves.length, 1);
                    assert.match(self.c.slaves[0], slave2);

                    phantom2.kill().then(done(function () {
                        assert.equals(self.c.slaves.length, 0);
                    }));
                });
            });
        });
    },

    "test posting events from session": function (done) {
        var self = this;

        this.p.capture(function (slave, phantom) {
            var rs = rampResources.resourceSet.create();
            rs.addResource({
                path: "/test.js",
                content: 'buster.emit("some:event", 123);'
            });
            rs.loadPath.append("/test.js");

            self.c.createSession(rs).then(function (sessionClient) {
                sessionClient.on("some:event", done(function (e) {
                    assert.equals(e.data, 123);
                }));
            });
        });
    },

    "test subscribing to events from session": function (done) {
        var self = this;
        this.p.capture(function (slave, phantom) {
            var rs = rampResources.resourceSet.create();
            rs.addResource({
                path: "/test.js",
                content: [
                    'buster.on("some:event", function (e) {',
                    '    buster.emit("other:event", e.data);',
                    '});'].join("\n")
            });
            rs.loadPath.append("/test.js");

            self.c.createSession(rs).then(function (sessionClient) {
                sessionClient.onLoad(function () {
                    sessionClient.on("other:event", done(function (e) {
                        assert.equals(e.data, 123);
                    }));
                    sessionClient.emit("some:event", 123);
                });
            });
        });
    },

    "test loading second session": function (done) {
        var self = this;
        assert(true);
        var rs = rampResources.resourceSet.create();

        this.p.capture(function (slave, phantom) {
            self.c.createSession(rs).then(function (sc1) {
                sc1.onLoad(function () {
                    sc1.end();
                });

                sc1.onUnload(function () {
                    self.c.createSession(rs).then(function (sc2) {
                        sc2.onLoad(done);
                    });
                });
            });
        });
    },

    // TODO: Make the server client handle server restart.
    "// test recaptures when server restarts": function (done) {
        var self = this;
        var oldServerBundle = this.serverBundle;

        var timesCaptured = 0;

        this.c.connect();
        this.c.on("slave:captured", function () {
            if (++timesCaptured == 2) {
                assert(true);
                oldServerBundle.tearDownBrowsers().then(done);
            }
        });

        this.p.capture(function (slave, phantom) {
            self.serverBundle.tearDownServer().then(function () {
                self.serverBundle = createServerBundle(self.port, self, function () {
                });
            });
        });
    },

    "test loads session when slave is captured": function (done) {
        var self = this;

        var rs = rampResources.resourceSet.create();
        rs.addResource({
            path: "/test.js",
            content: 'buster.emit("testing", 123);'
        });
        rs.loadPath.append("/test.js");

        self.c.createSession(rs).then(function (sc) {
            sc.onLoad(function () {
                self.p.capture(function (slave, phantom) {});
            });

            sc.on("testing", done(function (e) {
                assert.equals(e.data, 123);
            }));
        });
    },

    "test is able to relative path lookups in slaves": function (done) {
        var self = this;

        var rs = rampResources.resourceSet.create();
        rs.addResource({
            path: "/",
            content: [
                '<!DOCTYPE html>',
                '<html>',
                '  <head>',
                '    <script src="foo.js"></script>',
                '  </head>',
                '  <body></body>',
                '</html>'].join("\n")
        });
        rs.addResource({
            path: "/foo.js",
            content: [
                'window.addEventListener("load", function () {',
                '  buster.emit("veryclever", 123);',
                '});'].join("\n")
        });

        this.p.capture(function (slave, phantom) {});
        this.c.createSession(rs).then(function (sc) {
            sc.on("veryclever", done(function (e) {
                assert.equals(e.data, 123);
            }));
        });
    },

    "test provides buster.env.contextPath": function (done) {
        var self = this;

        var rs = rampResources.resourceSet.create();
        rs.addResource({
            path: "/foo.js",
            content: 'var e = document.createElement("script"); e.src = buster.env.contextPath + "/bar.js"; document.body.appendChild(e);'
        });
        rs.addResource({
            path: "/bar.js",
            content: 'buster.emit("nicelydone", 123);'
        });
        rs.loadPath.append("/foo.js");

        this.p.capture(function (slave, phantom) {});
        this.c.createSession(rs).then(function (sc) {
            sc.on("nicelydone", done(function (e) {
                assert.equals(e.data, 123);
            }));
        });
    },

    "test provides buster.env.id": function (done) {
        var self = this;

        var rs = rampResources.resourceSet.create();
        rs.addResource({
            path: "/foo.js",
            content: 'buster.emit("kindofblue", buster.env.id);'
        });
        rs.loadPath.append("/foo.js");

        this.p.capture(function (slave, phantom) {
            self.c.createSession(rs).then(function (sc) {
                sc.on("kindofblue", done(function (e) {
                    assert.equals(e.data, slave.id);
                }));
            });
        });
    },

    "test provides user agent": function (done) {
        var self = this;

        this.p.capture(done(function (slave, phantom) {
            assert.match(slave.userAgent, "PhantomJS");
        }));
    }
});
