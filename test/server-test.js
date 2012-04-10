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
        this.httpServer.listen(h.SERVER_PORT, function () {
            this.c = bCaptureServer.createServerClient("0.0.0.0", h.SERVER_PORT);
            this.c.connect().then(done);
        }.bind(this));

        this.s = bCaptureServer.createServer();
        this.s.attach(this.httpServer);
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

        // TODO: Meh, timeout
        setTimeout(function () {
            this.s.sessionQueue.emit("slave:captured", "foo");
        }.bind(this), 100);
    },

    "emits event when session queue emits slave:freed": function (done) {
        this.c.on("slave:freed", done(function (e) {
            assert.equals(e, "foo");
        }));

        // TODO: Meh, timeout
        setTimeout(function () {
            this.s.sessionQueue.emit("slave:freed", "foo");
        }.bind(this), 100);
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