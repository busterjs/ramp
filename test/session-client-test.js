var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCaptureServer = require("../lib/buster-capture-server");
var bSession = require("../lib/session");
var pubsubServer = require("./../lib/pubsub-server");
var http = require("http");
var when = require("when");
var h = require("./test-helper");

buster.testCase("session client", {
    setUp: function (done) {
        var self = this;

        this.httpServer = http.createServer();
        this.httpServer.listen(h.SERVER_PORT, function () {
            bSession.create({}, self.ps).then(done(function (session) {
                self.session = session;
                self.sessionData = session.serialize();
            }));
        });

        this.ps = pubsubServer.create(null, "/messaging");
        this.ps.attach(this.httpServer);
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "connected": {
        setUp: function (done) {
            var self = this;
            this.sc = bCaptureServer.createSessionClient({
                host: "0.0.0.0",
                port: h.SERVER_PORT,
                session: this.sessionData
            });
            this.sc.connect().then(done);
        },

        tearDown: function () {
            this.sc.disconnect();
        },

        "should end": function () {
            this.stub(this.sc._pubsubClient, "emit");
            this.sc.end();
            assert.calledOnce(this.sc._pubsubClient.emit);
            assert.calledWithExactly(this.sc._pubsubClient.emit, "end");
        }
    },

    "connecting publishes init event": function (done) {
        var sc = bCaptureServer.createSessionClient({
            host: "0.0.0.0",
            port: h.SERVER_PORT,
            session: this.sessionData
        });

        var initStub = this.stub(sc, "_onInitialize");
        sc.connect().then(done(function () {
            assert.calledOnce(initStub);
            sc.disconnect();
        }));
    },

    "publishing init event emits init data": function () {
        var sc = bCaptureServer.createSessionClient({
            host: "0.0.0.0",
            port: h.SERVER_PORT,
            session: this.sessionData
        });

        sc._pubsubClient = {emit: this.spy()};
        this.stub(sc, "_getInitData").returns({foo: "bar"});
        sc._onInitialize();
        assert.calledOnce(sc._pubsubClient.emit);
        assert.calledWithExactly(sc._pubsubClient.emit, "initialize", {foo: "bar"});
    },

    "init data as owner": function () {
        var sc = bCaptureServer.createSessionClient({
            host: "0.0.0.0",
            port: h.SERVER_PORT,
            session: this.sessionData,
            owner: true
        });

        assert.match(sc._getInitData(), {isOwner: true});
    },

    "init data as non-owner": function () {
        var sc = bCaptureServer.createSessionClient({
            host: "0.0.0.0",
            port: h.SERVER_PORT,
            session: this.sessionData
        });

        assert.match(sc._getInitData(), {isOwner: false});
    }
});