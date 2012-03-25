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
            this.fayeClient.publish(this.session.messagingPath + "/end", {});
            this.session.on("end", done);
        },

        "should end when session owner disconnects": function (done) {
            bCaptureServer.createSessionClient(
                "0.0.0.0",
                h.SERVER_PORT,
                {session: this.sessionData, owner: true}
            ).then(function (sc) {
                sc.disconnect();
            });

            assert(true);
            this.session.on("end", done);
        }
    }
});