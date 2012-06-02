var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCapServSessionClient = require("../lib/session-client");
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

                self.publicPubsub =
                    self.ps.createClient(self.sessionData.messagingPath);
                self.privatePubsub =
                    self.ps.createClient(self.sessionData.privateMessagingPath);
            }));
        });

        this.ps = bCapServPubsubServer.create(null, "/messaging");
        this.ps.attach(this.httpServer);

        this.pc = this.ps.createClient();
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "when connected": {
        setUp: function (done) {
            var self = this;
            this.sc = bCapServSessionClient._create(this.sessionData, this.pc);
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

    "publishing init event emits init data": function (done) {
        this.privatePubsub.on("initialize", done(function (data) {
            assert.equals(data, sc._getInitData());
            sc.disconnect();
        }));

        var sc = bCapServSessionClient._create(this.sessionData, this.pc);
    },

    "init data as owner": function () {
        var sc = bCapServSessionClient._create(this.sessionData, this.pc, {owner: true});
        assert.match(sc._getInitData(), {isOwner: true});
    },

    "init data as non-owner": function () {
        var sc = bCapServSessionClient._create(this.sessionData, this.pc);
        assert.match(sc._getInitData(), {isOwner: false});
    },

    "default client": {
        setUp: function () {
            this.sc = bCapServSessionClient._create(this.sessionData, this.pc);
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

    "also sets state when initializing": function (done) {
        assert(true);

        this.session.loaded();
        var sc = bCapServSessionClient._create(this.sessionData, this.pc);
        sc.onLoaded(done);
    }
});
