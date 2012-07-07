var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var rampResources = require("ramp-resources");
var h = require("./helpers/test-helper");

buster.testRunner.timeout = 4000;
buster.testCase("Events", {
    setUp: function (done) {
        this.serverBundle = h.createServerBundle(0, this, done);
    },

    tearDown: function (done) {
        this.serverBundle.tearDown(done);
    },

    "calls them for instantly queued session": function (done) {
        var self = this;

        this.p.capture(function (e, phantom) {
            var rs = rampResources.resourceSet.create();

            self.c.createSession(rs).then(function (sessionClient) {
                var startSpy = self.spy();
                sessionClient.onStart(startSpy);
                var loadSpy = self.spy();
                sessionClient.onLoad(loadSpy);
                var endSpy = self.spy();
                sessionClient.onEnd(endSpy);
                var unloadSpy = self.spy();
                sessionClient.onUnload(unloadSpy);

                sessionClient.onLoad(function () {
                    sessionClient.end();
                });

                sessionClient.onUnload(done(function () {
                    assert.calledOnce(startSpy);
                    assert.calledOnce(loadSpy);
                    assert(startSpy.calledBefore(loadSpy));
                    assert.equals(loadSpy.getCall(0).args[0], [e.slave]);
                    assert.calledOnce(endSpy);
                    assert(loadSpy.calledBefore(endSpy));
                    assert.calledOnce(unloadSpy);
                    assert(endSpy.calledBefore(unloadSpy));
                }));
            });
        });
    },

    "calls them when starting queued session": function (done) {
        var self = this;
        var rs = rampResources.resourceSet.create();

        this.p.capture(function (e, phantom) {
            self.c.createSession(rs).then(function (sc1) {
                sc1.onLoad(function () {
                    sc1.end();
                });
                sc1.onEnd(function () {
                    self.c.createSession(rs).then(function (sc2) {
                        var startSpy = self.spy();
                        sc2.onStart(startSpy);
                        var loadSpy = self.spy();
                        sc2.onLoad(loadSpy);
                        var endSpy = self.spy();
                        sc2.onEnd(endSpy);
                        var unloadSpy = self.spy();
                        sc2.onUnload(unloadSpy);

                        sc2.onLoad(function () {
                            sc2.end();
                        });

                        sc2.onUnload(done(function () {
                            assert.calledOnce(startSpy);
                            assert.calledOnce(loadSpy);
                            assert(startSpy.calledBefore(loadSpy));
                            assert.equals(loadSpy.getCall(0).args[0], [e.slave]);
                            assert.calledOnce(endSpy);
                            assert(loadSpy.calledBefore(endSpy));
                            assert.calledOnce(unloadSpy);
                        assert(endSpy.calledBefore(unloadSpy));
                        }));
                    });
                });
            });
        });
    }
});
