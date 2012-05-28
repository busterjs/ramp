var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCapServ = require("../lib/buster-capture-server");
var bCapServSess = require("../lib/session");
var bResources = require("buster-resources");
var http = require("http");
var when = require("when");
var h = require("./test-helper");

buster.testCase("server", {
    setUp: function (done) {
        this.httpServer = http.createServer(function (req, res) {
            res.writeHead(h.NO_RESPONSE_STATUS_CODE); res.end();
        });
        this.httpServer.listen(h.SERVER_PORT, done);

        this.s = bCapServ.createServer();
        this.s.attach(this.httpServer);

        this.c = bCapServ.createServerClient(h.SERVER_PORT);

        this.rs = bResources.resourceSet.create();
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
        this.c.disconnect();
    },

    "should create new session successfully": function (done) {
        var self = this;
        this.c.createSession(this.rs).then(
            done(function (sess) {
                assertIsSerializedSession(sess);
                assert(self.s._sessionQueue.sessions.some(function (s) {
                    return s.id = sess.id;
                }));
            })
        );
    },

    "should not create invalid session": function (done) {
        this.c.createSession(this.rs, {unknownProperty: true}).then(
            function () {},
            done(function (err) {
                assert.match(err.message, "unknown property");
            })
        );
    },

    "listens to slave:captured on session queue": function () {
        this.stub(this.s, "_onSlaveCaptured");
        this.s._sessionQueue.emit("slave:captured", "foo");
        assert.calledOnce(this.s._onSlaveCaptured);
        assert.calledWithExactly(this.s._onSlaveCaptured, "foo");
    },

    "listens to slave:freed on session queue": function () {
        this.stub(this.s, "_onSlaveFreed");
        this.s._sessionQueue.emit("slave:freed", "foo");
        assert.calledOnce(this.s._onSlaveFreed);
        assert.calledWithExactly(this.s._onSlaveFreed, "foo");
    },

    "capturing slave emits event and mounts resource set": function (done) {
        var slave = {foo: "bar"};

        this.s._pubsubClient.connect();
        this.s._pubsubClient.on("slave:captured", done(function (e) {
            assert.equals(e, slave);
        }));
        this.s._onSlaveCaptured(slave);
    },

    "freeing slave emits event and unmounts resource set": function (done) {
        var slave = {
            foo: "bar",
            prisonPath: "/foo123",
        };

        this.s._pubsubClient.connect();
        this.s._pubsubClient.on("slave:freed", done(function (e) {
            assert.equals(e, slave);
        }));

        this.stub(this.s._resourceMiddleware, "unmount");
        this.s._onSlaveFreed(slave);

        assert.calledOnce(this.s._resourceMiddleware.unmount);
        var args = this.s._resourceMiddleware.unmount.getCall(0).args;
        assert.same(args[0], slave.prisonPath);
    },

    "should create new slave via HTTP": function (done) {
        var slave = {prisonPath: "/foo"};
        this.stub(this.s, "_createSlave").returns(slave);

        h.request({path: "/capture", method: "GET"}, done(function (res, body) {
            assert.equals(res.statusCode, 302);
            assert.equals(res.headers["location"], "/foo");
        })).end();
    },

    "creating new slave adds it to queue and attaches and mounts it": function () {
        this.stub(this.s._resourceMiddleware, "mount");
        this.stub(this.s._sessionQueue, "addSlave");
        this.stub(this.s, "_attachSlave");
        var slave = this.s._createSlave();

        assert.calledOnce(this.s._sessionQueue.addSlave);
        assert.same(this.s._sessionQueue.addSlave.getCall(0).args[0], slave);

        assert.calledOnce(this.s._attachSlave);
        assert.same(this.s._attachSlave.getCall(0).args[0], slave);

        assert.calledOnce(this.s._resourceMiddleware.mount);
        var args = this.s._resourceMiddleware.mount.getCall(0).args;
        assert.same(args[0], slave.prisonPath);
        assert.same(args[1], slave.prisonResourceSet);
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

        this.s._sessionQueue.prepareSession(session);

        assert.calledOnce(this.s._resourceMiddleware.mount)
        var args = this.s._resourceMiddleware.mount.getCall(0).args;
        assert.equals(args[0], session.resourcesPath)
        assert.same(args[1], rs)
    },

    "teardown session unmounts": function () {
        var session = {resourcesPath: "/fofoafo", teardown: this.spy()};
        this.stub(this.s._resourceMiddleware, "unmount");
        this.s._sessionQueue.teardownSession(session);

        assert.calledOnce(this.s._resourceMiddleware.unmount);
        assert.calledWithExactly(this.s._resourceMiddleware.unmount, "/fofoafo");
        assert.calledOnce(session.teardown);
    },

    "serves resources middleware": function () {
        var req = {url: "/foo", method: "GET"};
        var res = {};
        this.stub(this.s._resourceMiddleware, "respond");
        this.s._respond(req, res);

        assert.calledOnce(this.s._resourceMiddleware.respond);
        var args = this.s._resourceMiddleware.respond.getCall(0).args;
        assert.same(args[0], req);
        assert.same(args[1], res);
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
