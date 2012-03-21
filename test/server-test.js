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

        this.c = bCaptureServer.createServerClient("0.0.0.0", h.SERVER_PORT);
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "should create new session successfully": function (done) {
        this.c.createSession({}).then(
            done(function (sess) {
                assertIsSerializedSession(sess);
            })
        );
    },

    "should not create invalid session": function (done) {
        this.c.createSession({unknownProperty: true}).then(
            function () {},
            done(function (err) {
                assert.match(err.message, "unknown property");
            })
        );
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