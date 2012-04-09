// NOTE: Only applies to initial listener, not 2nd listener.

// test emits /session/started if listening after first .started call
// test emits /session/loaded if listening after first .loaded call
// test emits /session/aborted if listening after first .aborted call
// test emits /session/ended if listening after first .ended call
// test emits /session/unloaded if listening after first .unloaded call
// test emits /slave/captured if listening after first .capturedSlave call
// test emits /slave/freed if listening after first .freedSlave call

// OR:

// test queues all events while there are no listeners

var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCaptureServer = require("../lib/buster-capture-server");
var bCaptureServerPubsubClient = require("../lib/pubsub-client");
var bSession = require("../lib/session");
var busterResources = require("buster-resources");
var http = require("http");
var faye = require("faye");
var when = require("when");
var h = require("./test-helper");

buster.testCase("Session", {
    setUp: function (done) {
        this.rs = busterResources.resourceSet.create();
        this.rs.serialize().then(done(function (rsSrl) {
            this.rsSrl = rsSrl;
        }.bind(this)));
    },

    "should create with resource set": function (done) {
        var sessionData = {resourceSet: this.rsSrl};

        bSession.create(sessionData, h.mockFayeAdapter()).then(done(function (session) {
            assert(bSession.isPrototypeOf(session));
        }.bind(this)));
    },

    "should create non-joinable": function (done) {
        var sessionData = {resourceSet: {}, joinable: false};

        bSession.create(sessionData, h.mockFayeAdapter()).then(done(function (session) {
            assert.isFalse(session.joinable);
        }.bind(this)));
    },

    "should not share resource paths": function (done) {
        var sessions = [
            bSession.create({}, h.mockFayeAdapter()),
            bSession.create({}, h.mockFayeAdapter())
        ];
        when.all(sessions).then(done(function (sessions) {
            var s1 = sessions[0];
            var s2 = sessions[1];
            assert(s1);
            assert(s2);

            refute.equals(s1.id, s2.id);
            refute.equals(s1.resourcesPath, s2.resourcesPath);
        }));
    },

    "should have static resource paths when specified": function (done) {
        var sessions = [
            bSession.create({staticResourcePath: true}, h.mockFayeAdapter()),
            bSession.create({staticResourcePath: true}, h.mockFayeAdapter())
        ];
        when.all(sessions).then(done(function (sessions) {
            var s1 = sessions[0];
            var s2 = sessions[1];

            assert.equals(s1.resourcesPath, s2.resourcesPath);
        }));
    },

    "should reject when creation fails": function (done) {
        bSession.create({unknownProp: true}, h.mockFayeAdapter()).then(
            function () {},
            done(function (err) {
                assert.equals(err.message, "Unknown property 'unknownProp'.");
            })
        );
    },

    "should reject when creation fails when deserializing": function (done) {
        var deferred = when.defer();
        this.stub(busterResources.resourceSet, "deserialize");
        busterResources.resourceSet.deserialize.returns(deferred.promise);
        deferred.reject({message: "Foo"});

        bSession.create({resourceSet: {}}, h.mockFayeAdapter()).then(
            function () {},
            done(function (err) {
                assert.equals(err.message, "Foo");
            })
        );
    },

    "instance": {
        setUp: function (done) {
            var self = this;

            this.httpServer = http.createServer();
            this.httpServer.listen(h.SERVER_PORT, function () {
                bSession.create({}, self.fayeAdapter).then(done(function (session) {
                    self.session = session;
                    self.sessionData = session.serialize();

                    self.pubsubClient = bCaptureServerPubsubClient.create({
                        contextPath: self.session.messagingPath,
                        fayeClient: self.fayeClient
                    });
                }));
            });

            this.fayeAdapter = new faye.NodeAdapter({mount: "/messaging"});
            this.fayeAdapter.attach(this.httpServer);
            this.fayeClient = this.fayeAdapter.getClient();
        },

        tearDown: function (done) {
            this.httpServer.on("close", done);
            this.httpServer.close();
        },

        "should end session when receiving event": function (done) {
            assert(true);
            this.pubsubClient.emit("end");
            this.session.on("end", done);
        },

        "should end when session owner disconnects": function (done) {
            var sc = bCaptureServer.createSessionClient(
                {
                    host: "0.0.0.0",
                    port: h.SERVER_PORT,
                    session: this.sessionData,
                    owner: true
                }
            );
            sc.connect().then(function () {
                sc.disconnect();
            });

            assert(true);
            this.session.on("end", done);
        },

        "// notifies when session starts": function (done) {
            var self = this;
            this.pubsubClient.on("session:started", done(function (e) {
                assert.equals(e.session, self.sessionData);
            }));
            this.session.started();
        },

        "notifies when session is loaded": function (done) {
            var self = this;
            this.pubsubClient.on("session:loaded", done(function (e) {
                assert.equals(e.session, self.sessionData);
            }));
            this.session.loaded();
        },

        "notifies when session is aborted": function (done) {
            var self = this;
            this.pubsubClient.on("session:aborted", done(function (e) {
                assert.equals(e.session, self.sessionData);
                assert.equals(e.error.message, "Some reason");
            }));
            this.session.aborted({message: "Some reason"});
        },

        "notifies when session is ended": function (done) {
            var self = this;
            this.pubsubClient.on("session:ended", done(function (e) {
                assert.equals(e.session, self.sessionData);
            }));
            this.session.ended();
        },

        "notifies when session is unloaded": function (done) {
            var self = this;
            this.pubsubClient.on("session:unloaded", done(function (e) {
                assert.equals(e.session, self.sessionData);
            }));
            this.session.unloaded();
        },

        "notifies when slave is captured": function (done) {
            var self = this;
            var slave = {foo: "bar"};
            this.pubsubClient.on("slave:captured", done(function (e) {
                assert.equals(e.session, self.sessionData);
                assert.equals(e.slave, slave);
            }));
            this.session.capturedSlave({serialize: function () { return slave; }});
        },

        "notifies when slave is freed": function (done) {
            var self = this;
            var slave = {foo: "bar"};
            this.pubsubClient.on("slave:freed", done(function (e) {
                assert.equals(e.session, self.sessionData);
                assert.equals(e.slave, slave);
            }));
            this.session.freedSlave({serialize: function () { return slave; }});
        },
    }
});