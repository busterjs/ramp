var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCapServSlave = require("../lib/slave");
var bCapServPubsubClient = require("../lib/pubsub-client");
var bCapServPubsubServer = require("./../lib/pubsub-server");
var http = require("http");
var faye = require("faye");
var when = require("when");
var h = require("./test-helper");

buster.testCase("slave", {
    setUp: function (done) {
        this.httpServer = http.createServer(function (req, res) {
            res.writeHead(h.NO_RESPONSE_STATUS_CODE); res.end();
        });
        this.httpServer.listen(h.SERVER_PORT, done);

        this.ps = bCapServPubsubServer.create(null, "/messaging");
        this.ps.attach(this.httpServer);
        this.pc = this.ps.createClient();
        this.slave = bCapServSlave.create();
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "has prison path": function () {
        assert(this.slave.prisonPath);
    },

    "has prison resource set": function () {
        assert(this.slave.prisonResourceSet);
    },

    "attached": {
        setUp: function () {
            this.slave.attach(this.httpServer, this.ps);
        },

        "serves prison": function (done) {
            h.request({path: this.slave.prisonPath}, done(function (res, body) {
                assert.equals(res.statusCode, 200);
            })).end()
        },

        "loading session": function (done) {
            var self = this;
            var sessionData = {foo: "bar"};
            var session = {serialize: function () { return sessionData }};

            this.pc.on("slave:" + this.slave._id + ":session:load", function (s) {
                assert.equals(s, sessionData);
                self.pc.emit("slave:" + self.slave._id + ":session:loaded");
            });

            this.slave.loadSession(session).then(done);
        },

        "unloading session": function (done) {
            var self = this;
            assert(true);

            this.pc.on("slave:" + this.slave._id + ":session:unload", function (s) {
                self.pc.emit("slave:" + self.slave._id + ":session:unloaded");
            });

            this.slave.unloadSession().then(done);
        },

        "preparing when ready": function (done) {
            assert(true);
            this.slave._isReady = true;
            this.slave.prepare().then(done);
        },

        "defaults to not ready": function () {
            assert.isFalse(this.slave._isReady);
        },

        "preparing when not ready": function (done) {
            assert(true);
            this.slave.prepare().then(done);
            this.pc.emit("slave:" + this.slave._id + ":imprisoned", {});
        },

        "with mock browser": {
            setUp: function (done) {
                var self = this;
                this.mockBrowser = bCapServPubsubClient.create({
                    host: "0.0.0.0",
                    port: h.SERVER_PORT
                })
                this.mockBrowser.connect().then(function () {
                    self.mockBrowser.emit(
                        "slave:" + self.slave._id + ":imprisoned",
                        {
                            pubsubClientId: self.mockBrowser.id
                        }
                    );
                });

                this.slave.prepare().then(done);
            },

            tearDown: function () {
                this.mockBrowser.disconnect();
            },

            "ends when browser disconnects": function (done) {
                assert(true);
                this.mockBrowser.disconnect();
                this.slave.on("end", done);
            }
        }
    },

    "serializing": function () {
        var expected = {
            prisonPath: this.slave.prisonPath,
            id: this.slave._id
        }

        assert.equals(this.slave.serialize(), expected);
    }
});
