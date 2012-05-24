var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCapServ = require("../lib/buster-capture-server");
var bCapServSession = require("../lib/session");
var bCapServPubsubServer = require("./../lib/pubsub-server");
var http = require("http");
var when = require("when");
var h = require("./test-helper");

buster.testCase("session client", {
    setUp: function (done) {
        var self = this;

        this.httpServer = http.createServer();
        this.httpServer.listen(h.SERVER_PORT, function () {
            bCapServSession.create({}, self.ps).then(done(function (session) {
                self.session = session;
                self.sessionData = session.serialize();

                self.publicPubsub = buster.captureServer.pubsubClient.create({
                    contextPath: self.sessionData.messagingPath,
                    fayeClient: self.ps.getClient()
                });
                self.privatePubsub = buster.captureServer.pubsubClient.create({
                    contextPath: self.sessionData.privateMessagingPath,
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

    "connected": {
        setUp: function (done) {
            var self = this;
            this.sc = bCapServ.createSessionClient({
                host: "0.0.0.0",
                port: h.SERVER_PORT,
                session: this.sessionData
            });
            this.sc.connect().then(done);
        },

        tearDown: function () {
            this.sc.disconnect();
        },

        "should end": function (done) {
            assert(true)
            this.privatePubsub.on("end", done);
            this.sc.end();
        }
    },

    "connecting publishes init event": function (done) {
        var sc = bCapServ.createSessionClient({
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

    "publishing init event emits init data": function (done) {
        this.privatePubsub.on("initialize", done(function (data) {
            assert.equals(data, sc._getInitData());
            sc.disconnect();
        }));

        var sc = bCapServ.createSessionClient({
            host: "0.0.0.0",
            port: h.SERVER_PORT,
            session: this.sessionData
        });
        sc.connect();
    },

    "init data as owner": function () {
        var sc = bCapServ.createSessionClient({
            host: "0.0.0.0",
            port: h.SERVER_PORT,
            session: this.sessionData,
            owner: true
        });

        assert.match(sc._getInitData(), {isOwner: true});
    },

    "init data as non-owner": function () {
        var sc = bCapServ.createSessionClient({
            host: "0.0.0.0",
            port: h.SERVER_PORT,
            session: this.sessionData
        });

        assert.match(sc._getInitData(), {isOwner: false});
    },

    "connected": {
        setUp: function (done) {
            this.sc = bCapServ.createSessionClient({
                fayeClient: this.ps.getClient(),
                session: this.sessionData
            });

            this.sc.connect().then(done);
        },

        "resolves started promise when starting": function (done) {
            assert(true);
            this.sc.onStarted(done);
            this.session.started();
        },

        "resolves loaded and started when loading": function (done) {
            assert(true);
            when.all([this.sc.onStarted(), this.sc.onLoaded()]).then(done);
            this.session.loaded();
        },

        "resolves loaded, started and ended when ending": function (done) {
            assert(true);
            when.all([this.sc.onStarted(), this.sc.onLoaded(), this.sc.onEnded()]).then(done);
            this.session.ended();
        },

        "resolves loaded, started, ended and unloaded when unloading": function (done) {
            assert(true);
            when.all([this.sc.onStarted(), this.sc.onLoaded(), this.sc.onEnded(), this.sc.onUnloaded()]).then(done);
            this.session.unloaded();
        }
    },

    "resolves initialized and stores session data": function (done) {
        var sc = bCapServ.createSessionClient({
            fayeClient: this.ps.getClient(),
            session: this.sessionData
        });
        sc.connect();

        sc.initialized.then(done(function () {
            assert.equals(sc.session, this.sessionData);
        }.bind(this)));
    },

    "also sets state when initializing": function (done) {
        assert(true);

        this.session.loaded();
        var sc = bCapServ.createSessionClient({
            fayeClient: this.ps.getClient(),
            session: this.sessionData
        });
        sc.connect();
        sc.onLoaded(done);
    }
});