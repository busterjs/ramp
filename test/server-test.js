var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCaptureServer = require("../lib/buster-capture-server");
var bCaptureServerSess = require("../lib/session");
var http = require("http");
var when = require("when");
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

    "creating new slave adds it to queue and attaches it": function () {
        this.stub(this.s.sessionQueue, "addSlave");
        this.stub(this.s, "_attachSlave");
        this.s._createSlave();
        assert.calledOnce(this.s.sessionQueue.addSlave);
        assert.calledOnce(this.s._attachSlave);
    },

    "attaching slave": function () {
        var slave = {attach: this.spy()};
        this.s._attachSlave(slave);
        assert(slave.attach.calledOnce);
        assert.same(slave.attach.getCall(0).args[0], this.s._httpServer);
    },

    "should list cache via HTTP": function (done) {
        var resources = [{foo: "bar"}]
        this.stub(this.s._resourceCache, "resourceVersions").returns(resources);

        h.request({path: "/resources"}, done(function (res, body) {
            assert.equals(res.statusCode, 200);
            assert.equals(JSON.parse(body), resources);
        })).end();
    },

    "preparing session inflates and mounts": function () {
        var session = {resourceSet: {}, resourcesPath: "/foo"};

        var rs = {};
        var inflateDeferred = when.defer();
        inflateDeferred.resolve(rs);

        this.stub(this.s._resourceCache, "inflate").returns(inflateDeferred.promise);
        this.stub(this.s._resourceMiddleware, "mount");

        this.s.sessionQueue.prepareSession(session);

        assert.calledOnce(this.s._resourceMiddleware.mount)
        var args = this.s._resourceMiddleware.mount.getCall(0).args;
        assert.equals(args[0], session.resourcesPath)
        assert.same(args[1], rs)
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