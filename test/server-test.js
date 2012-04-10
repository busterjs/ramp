var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCaptureServer = require("../lib/buster-capture-server");
var bCaptureServerSess = require("../lib/session");
var http = require("http");
var h = require("./test-helper");

buster.testCase("server", {
    setUp: function (done) {
        this.httpServer = http.createServer(function (req, res) {
            res.writeHead(h.NO_RESPONSE_STATUS_CODE); res.end();
        });
        this.httpServer.listen(h.SERVER_PORT, done);

        this.s = bCaptureServer.createServer();
        this.s.attach(this.httpServer);

        this.c = bCaptureServer.createServerClient({
            host: "0.0.0.0",
            port: h.SERVER_PORT,
            fayeClient: this.s.bayeuxServer.getClient()
        });
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
        this.c.disconnect();
    },

    "should create new session successfully": function (done) {
        this.c.createSession({}, h.mockFayeAdapter()).then(
            done(function (sess) {
                assertIsSerializedSession(sess);
            })
        );
    },

    "should not create invalid session": function (done) {
        this.c.createSession({unknownProperty: true}, h.mockFayeAdapter()).then(
            function () {},
            done(function (err) {
                assert.match(err.message, "unknown property");
            })
        );
    },

    "emits event when session queue emits slave:captured": function (done) {
        this.c.on("slave:captured", done(function (e) {
            assert.equals(e, "foo");
        }));

        this.s.sessionQueue.emit("slave:captured", "foo");
    },

    "emits event when session queue emits slave:freed": function (done) {
        this.c.on("slave:freed", done(function (e) {
            assert.equals(e, "foo");
        }));

        this.s.sessionQueue.emit("slave:freed", "foo");
    },

    "should create new slave via HTTP": function (done) {
        var slave = {prisonPath: "/foo"};
        this.stub(this.s, "_createSlave").returns(slave);

        h.request({path: "/capture", method: "GET"}, done(function (res, body) {
            assert.equals(res.statusCode, 302);
            assert.equals(res.headers["location"], "/foo");
        })).end();
    },

    "creating new slave adds it to queue": function () {
        this.stub(this.s.sessionQueue, "addSlave");
        this.s._createSlave();
        assert.calledOnce(this.s.sessionQueue.addSlave);
    },

    "// should fail if attempting to load uncached items": function () {
    },

    "// should not send cached resources to server": function (done) {
    }
});

function assertIsSerializedSession(obj) {
    assert(obj.id);
    assert(obj.resourcesPath);
    assert(obj.messagingPath);
}