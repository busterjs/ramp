var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var sinon = require("sinon");

var bayeuxServer = require("./../lib/bayeux-server");
var pubsubClient = require("./../lib/pubsub-client");
var http = require("http");
var faye = require("faye");
var when = require("when");
var h = require("./test-helper");

buster.testCase("bayeux server", {
    setUp: function (done) {
        this.httpServer = http.createServer();
        this.httpServer.listen(h.SERVER_PORT, done);

        var NOOP = function(){};
        var NOOP_LOGGER = {error:NOOP,warn:NOOP,log:NOOP,info:NOOP,debug:NOOP};
        this.bs = bayeuxServer.create(NOOP_LOGGER, "/messaging");
        this.bs.attach(this.httpServer);
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "client is faye adapter client": function () {
        var expected = this.bs._fayeAdapter.getClient();
        assert.same(this.bs.getClient(), expected);
        assert.same(this.bs.getClient(), expected);
    },

    "attach attaches faye adapter": function () {
        var httpServer = {};
        this.stub(this.bs._fayeAdapter, "attach");

        this.bs.attach(httpServer);

        assert.calledOnce(this.bs._fayeAdapter.attach);
        assert.same(this.bs._fayeAdapter.attach.getCall(0).args[0], httpServer);
    },

    "stores list of pubsub clients": function (done) {
        var self = this;

        var c1 = pubsubClient.create({
            host: "0.0.0.0",
            port: h.SERVER_PORT
        })
        c1.connect().then(function () {
            var c2 = pubsubClient.create({
                host: "0.0.0.0",
                port: h.SERVER_PORT
            })
            c2.connect().then(done(function () {
                c1.disconnect();
                c2.disconnect();

                var clients = self.bs._pubsubClients;
                assert.equals(Object.keys(clients).length, 2);

                assert(clients[c1.id].fayeClientId);
                assert(clients[c2.id].fayeClientId);
            }));
        });
    },

    "emits event when pubsub client disconnects": function (done) {
        var self = this;

        var c1 = pubsubClient.create({
            host: "0.0.0.0",
            port: h.SERVER_PORT
        })
        c1.connect().then(function () {
            c1.disconnect();
        });

        self.bs.on("client:disconnect", done(function (clientId) {
            assert.equals(c1.id, clientId);
        }));
    },

    "removes stored pubsub client when it disconnects": function (done) {
        var self = this;

        var c1 = pubsubClient.create({
            host: "0.0.0.0",
            port: h.SERVER_PORT
        })
        c1.connect().then(function () {
            c1.disconnect();
        });

        self.bs.on("client:disconnect", done(function (clientId) {
            var clients = self.bs._pubsubClients;
            assert.equals(Object.keys(clients).length, 0);
        }));
    }
});