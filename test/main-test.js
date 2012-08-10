var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var rampResources = require("ramp-resources");
var h = require("./helpers/test-helper");

buster.testRunner.timeout = 4000;
buster.testCase("Main", {
    setUp: function (done) {
        this.serverBundle = h.createServerBundle(0, this, done);
    },

    tearDown: function (done) {
        this.serverBundle.tearDown(done);
    },

    "test one browser": function (done) {
        var self = this;

        this.b.capture(done(function (e, browser) {
            assert.equals(e.slaves.length, 1);
            assert.match(e.slaves[0], e.slave);
        }));
    },

    "test multiple browsers": function (done) {
        var self = this;

        this.b.capture(function (e1, browser) {
            assert.equals(e1.slaves.length, 1);

            self.b.capture(function (e2, browser2) {
                assert.equals(e2.slaves.length, 2);

                var timesCalled = 0;
                self.c.on("slave:freed", function (e) {
                    switch(++timesCalled) {
                    case 1:
                        assert.equals(e.slaves.length, 1);
                        break;
                    case 2:
                        assert.equals(e.slaves.length, 0);
                        done();
                        break;
                    }
                });

                browser.kill().then(function () {
                    browser2.kill().then(function(){});
                });
            });
        });
    },

    "test loading second session": function (done) {
        var self = this;
        assert(true);
        var rs = rampResources.resourceSet.create();

        this.b.capture(function (e, browser) {
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
        });

        this.b.capture(function (slave, browser) {
            self.serverBundle.tearDownServer().then(function () {
                self.serverBundle = h.createServerBundle(self.port, self, function () {
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
                self.b.capture(function (e, browser) {});
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

        this.b.capture(function (e, browser) {});
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

        this.b.capture(function (e, browser) {});
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

        this.b.capture(function (e, browser) {
            var slave = e.slave;
            self.c.createSession(rs).then(function (sc) {
                sc.on("kindofblue", done(function (e) {
                    assert.equals(e.data, slave.id);
                }));
            });
        });
    },

    "test provides user agent": function (done) {
        var self = this;

        this.b.capture(done(function (e, browser) {
            assert.match(e.slave.userAgent, "PhantomJS");
        }));
    }
});
