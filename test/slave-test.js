var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCaptureServerSlave = require("../lib/slave");
var http = require("http");
var faye = require("faye");
var when = require("when");
var h = require("./test-helper");
var bCaptureServerPubsubClient = require("../lib/pubsub-client");

buster.testCase("slave", {
    setUp: function (done) {
        this.httpServer = http.createServer(function (req, res) {
            res.writeHead(h.NO_RESPONSE_STATUS_CODE); res.end();
        });
        this.httpServer.listen(h.SERVER_PORT, done);

        this.fayeAdapter = new faye.NodeAdapter({mount: "/messaging"});
        this.fayeAdapter.attach(this.httpServer);
        this.fayeClient = this.fayeAdapter.getClient();

        this._pubsubClient = bCaptureServerPubsubClient.create({
            fayeClient: this.fayeClient
        });
        this.slave = bCaptureServerSlave.create(this._pubsubClient);
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "has prison path": function () {
        assert(this.slave.prisonPath);
    },

    "attached": {
        setUp: function () {
            this.slave.attach(this.httpServer, this._pubsubClient);
        },

        "serves prison": function (done) {
            h.request({path: this.slave.prisonPath}, done(function (res, body) {
                assert.equals(res.statusCode, 200);
            })).end()
        },

        "loading session": function (done) {
            var self = this;
            var session = {foo: "bar"};

            this._pubsubClient.on("slave:" + this.slave._id + ":session:load", function (s) {
                assert.equals(s, session);
                self._pubsubClient.emit("slave:" + self.slave._id + ":session:loaded");
            });

            this.slave.loadSession(session).then(done);
        },

        "unloading session": function (done) {
            var self = this;
            assert(true);

            this._pubsubClient.on("slave:" + this.slave._id + ":session:unload", function (s) {
                self._pubsubClient.emit("slave:" + self.slave._id + ":session:unloaded");
            });

            this.slave.unloadSession().then(done);
        }
    },

    "serializing": function () {
        var expected = {
            prisonPath: this.slave.prisonPath
        }

        assert.equals(this.slave.serialize(), expected);
    }
});