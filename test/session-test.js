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

var bCapServ = require("../lib/buster-capture-server");
var bCapServPubsubClient = require("../lib/pubsub-client");
var bCapServPubsubServer = require("./../lib/pubsub-server");
var bCapServSession = require("../lib/session");
var bResources = require("buster-resources");
var http = require("http");
var faye = require("faye");
var when = require("when");
var h = require("./test-helper");

buster.testCase("Session", {
    setUp: function (done) {
        this.rs = bResources.resourceSet.create();
        this.rs.addResource({path: "/foo.js", content: "var foo = 5;"});
        this.rs.serialize().then(done(function (rsSrl) {
            this.rsSrl = rsSrl;
        }.bind(this)));
    },

    "should create with resource set": function (done) {
        var sessionData = {resourceSet: this.rsSrl};

        bCapServSession.create(sessionData, h.mockPubsubServer()).then(done(function (session) {
            assert(bCapServSession.isPrototypeOf(session));
        }.bind(this)));
    },

    "should create non-joinable": function (done) {
        var sessionData = {resourceSet: {}, joinable: false};

        bCapServSession.create(sessionData, h.mockPubsubServer()).then(done(function (session) {
            assert.isFalse(session.joinable);
        }.bind(this)));
    },

    "should not share resource paths": function (done) {
        var sessions = [
            bCapServSession.create({}, h.mockPubsubServer()),
            bCapServSession.create({}, h.mockPubsubServer())
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
            bCapServSession.create({staticResourcePath: true}, h.mockPubsubServer()),
            bCapServSession.create({staticResourcePath: true}, h.mockPubsubServer())
        ];
        when.all(sessions).then(done(function (sessions) {
            var s1 = sessions[0];
            var s2 = sessions[1];

            assert.equals(s1.resourcesPath, s2.resourcesPath);
        }));
    },

    "should reject when creation fails": function (done) {
        bCapServSession.create({unknownProp: true}, h.mockPubsubServer()).then(
            function () {},
            done(function (err) {
                assert.equals(err.message, "Unknown property 'unknownProp'.");
            })
        );
    },

    "should reject when creation fails when deserializing": function (done) {
        var deferred = when.defer();
        this.stub(bResources.resourceSet, "deserialize");
        bResources.resourceSet.deserialize.returns(deferred.promise);
        deferred.reject({message: "Foo"});

        bCapServSession.create({resourceSet: {}}, h.mockPubsubServer()).then(
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
                bCapServSession.create({}, self.ps).then(done(function (session) {
                    self.session = session;
                    self.sessionData = session.serialize();

                    self.pubsubClient = bCapServPubsubClient.create({
                        contextPath: self.session.messagingPath,
                        fayeClient: self.ps.getClient()
                    });

                    self.privatePubsubClient = bCapServPubsubClient.create({
                        contextPath: self.session.privateMessagingPath,
                        fayeClient: self.ps.getClient()
                    });
                }));
            });

            this.ps = bCapServPubsubServer.create(null, "/messaging");
            this.ps.attach(this.httpServer);
        },

        tearDown: function (done) {
            this.httpServer.on("close", done);
            this.httpServer.close();
        },

        "should serialize": function () {
            var serialized = this.session.serialize();
            assert.equals(serialized.id, this.session.id);
            assert.equals(serialized.resourcesPath, this.session.resourcesPath);
            assert.equals(serialized.messagingPath, this.session.messagingPath);
            assert.equals(serialized.state, this.session.state);
        },

        "should end session when receiving event": function (done) {
            assert(true);
            this.privatePubsubClient.emit("end");
            this.session.on("end", done);
        },

        "should end when session owner disconnects": function (done) {
            var sc = bCapServ.createSessionClient(
                {
                    host: "0.0.0.0",
                    port: h.SERVER_PORT,
                    session: this.sessionData,
                    owner: true
                }
            );
            sc.connect().then(function () {
                // TODO: fix session client so it doesn't resolve connect
                // until after "initialize" has been received on the server.
                setTimeout(function () {
                    sc.disconnect();
                }, 50);
            });

            assert(true);
            this.session.on("end", done);
        },

        "should emit state when client initializes": function (done) {
            this.privatePubsubClient.on("initialized", done(function (e) {
                assert(e.session);
                assert.equals(e.session, this.sessionData);
            }.bind(this)));
            this.privatePubsubClient.emit("initialize", {});
        },

        "notifies when session starts": function (done) {
            var self = this;
            assert.isFalse(self.session.state.started);
            this.privatePubsubClient.on("state", done(function (e) {
                assert.isTrue(self.session.state.started);
                assert.equals(e.state, self.session.state);
            }));
            this.session.started();
        },

        "notifies when session is loaded": function (done) {
            var self = this;
            assert.isFalse(self.session.state.loaded);
            this.privatePubsubClient.on("state", done(function (e) {
                assert.isTrue(self.session.state.loaded);
                assert.equals(e.state, self.session.state);
            }));
            this.session.loaded();
        },

        "notifies when session is aborted": function (done) {
            var self = this;
            this.privatePubsubClient.on("aborted", done(function (e) {
                assert.equals(e.error.message, "Some reason");
            }));
            this.session.aborted({message: "Some reason"});
        },

        "notifies when session is ended": function (done) {
            var self = this;
            assert.isFalse(self.session.state.ended);
            this.privatePubsubClient.on("state", done(function (e) {
                assert.isTrue(self.session.state.ended);
                assert.equals(e.state, self.session.state);
            }));
            this.session.ended();
        },

        "notifies when session is unloaded": function (done) {
            var self = this;
            assert.isFalse(self.session.state.unloaded);
            this.privatePubsubClient.on("state", done(function (e) {
                assert.isTrue(self.session.state.unloaded);
                assert.equals(e.state, self.session.state);
            }));
            this.session.unloaded();
        },

        "notifies when slave is captured": function (done) {
            var self = this;
            var slave = {foo: "bar"};
            this.privatePubsubClient.on("slave:captured", done(function (e) {
                assert.equals(e.slave, slave);
            }));
            this.session.capturedSlave({serialize: function () { return slave; }});
        },

        "notifies when slave is freed": function (done) {
            var self = this;
            var slave = {foo: "bar"};
            this.privatePubsubClient.on("slave:freed", done(function (e) {
                assert.equals(e.slave, slave);
            }));
            this.session.freedSlave({serialize: function () { return slave; }});
        },

        "should teardown": function () {
            this.stub(this.session, "_pubsubServerDetach");
            this.session.teardown();
            assert.calledOnce(this.session._pubsubServerDetach);
        }
    },

    "should create with resource set": function (done) {
        var self = this;
        var sessionData = {resourceSet: this.rsSrl};

        bCapServSession.create(sessionData, h.mockPubsubServer()).then(function (session) {
            assert(session.resourceSet);
            var foo = session.resourceSet.get("/foo.js");
            assert(foo);
            foo.content().then(done(function (data) {
                assert.equals(data, "var foo = 5;");
            }));
        });
    }
});