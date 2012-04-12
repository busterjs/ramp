var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var sinon = require("sinon");

var pubsubClient = require("./../lib/pubsub-client");
var http = require("http");
var faye = require("faye");
var when = require("when");
var h = require("./test-helper");

var mockFaye = function () {
    return {
        subscribe: sinon.spy(),
        publish: sinon.spy(),
        disconnect: sinon.spy()
    };
};

buster.testCase("pubsub-client", {
    setUp: function (done) {
        this.httpServer = http.createServer();
        this.httpServer.listen(h.SERVER_PORT, done);

        this.fayeAdapter = new faye.NodeAdapter({mount: "/messaging"});
        this.fayeAdapter.attach(this.httpServer);
        this.fayeClient = this.fayeAdapter.getClient();

        this.ps = pubsubClient.create({
            host: "0.0.0.0",
            port: h.SERVER_PORT
        });
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
        this.ps.disconnect();
    },

    "should create faye client with provided host and port": function () {
        var spy = this.stub(faye, "Client");
        var client = this.ps._createFayeClient();
        assert.calledOnce(spy);

        var url = "http://" + this.ps._serverHost + ":" + this.ps._serverPort + "/messaging";
        assert.calledWithExactly(faye.Client, url);
    },

    "should connect": function (done) {
        assert(true);
        this.ps.connect().then(done);
    },

    "should not subscribe to connection event when connected": function (done) {
        var self = this;
        assert(true);

        this.ps.connect().then(function () {
            // Will throw uncaught exception due to double resolve if not handled
            self.ps._fayeClient.publish("/" + self.ps._id + "-initialize", {})
                .callback(done);
        });
    },

    "mock connection": {
        setUp: function () {
            this.mockFaye = mockFaye();
            this.ps._fayeClient = this.mockFaye;
        },

        "should get faye event name": function ( ){
            assert.equals(this.ps._getEventName("foo"), "/user-foo");
        },

        "should get namespaced faye event name": function ( ){
            assert.equals(this.ps._getEventName("foo:bar:baz"), "/user-foo-bar-baz");
        },

        "should fail when getting invalid event name": function () {
            var self = this;

            assert.exception(function () {
                self.ps._getEventName("/foo");
            }, "TypeError");

            assert.exception(function () {
                self.ps._getEventName("foo/bar");
            }, "TypeError");

            assert.exception(function () {
                self.ps._getEventName(":foo");
            }, "TypeError");

            assert.exception(function () {
                self.ps._getEventName("foo:");
            }, "TypeError");

            assert.exception(function () {
                self.ps._getEventName(":foo:bar:baz");
            }, "TypeError");

            assert.exception(function () {
                self.ps._getEventName("foo:bar:baz:");
            }, "TypeError");

            assert.exception(function () {
                self.ps._getEventName(":");
            }, "TypeError");

            assert.exception(function () {
                self.ps._getEventName("::");
            }, "TypeError");

            assert.exception(function () {
                self.ps._getEventName(":f:");
            }, "TypeError");

            assert.exception(function () {
                self.ps._getEventName("");
            }, "TypeError");
        },

        "should listen to event": function () {
            this.stub(this.ps, "_getEventName").returns("/boom");
            this.ps.on("foo", function () {});

            assert.calledOnce(this.mockFaye.subscribe);
            assert.calledWith(this.mockFaye.subscribe, "/boom");

            assert.calledOnce(this.ps._getEventName);
            assert.calledWithExactly(this.ps._getEventName, "foo");
        },

        "should emit event": function () {
            this.stub(this.ps, "_getEventName").returns("/boom");
            this.ps.emit("foo", "some data");

            assert.calledOnce(this.mockFaye.publish);
            assert.calledWith(this.mockFaye.publish, "/boom");

            assert.calledOnce(this.ps._getEventName);
            assert.calledWithExactly(this.ps._getEventName, "foo");
        }
    },

    "actual connection": {
        setUp: function (done) {
            this.ps.connect().then(done);
        },

        "event cycle with data": function (done) {
            this.ps.on("foo", done(function (data) {
                assert.equals(data, "some data");
            }));

            this.ps.emit("foo", "some data");
        },

        "event cycle with no data": function (done) {
            this.ps.on("foo", done(function (data) {
                refute(data);
            }));

            this.ps.emit("foo");
        }
    },

    "context path": {
        setUp: function () {
            this.ps2 = pubsubClient.create({
                host: "0.0.0.0",
                port: h.SERVER_PORT,
                contextPath: "/foo"
            });
            this.mockFaye2 = mockFaye();
            this.ps2._fayeClient = this.mockFaye2;
        },

        "should listen": function () {
            this.stub(this.ps2, "_getEventName").returns("/boom");
            this.ps2.on("foo", function () {});

            assert.calledOnce(this.mockFaye2.subscribe);
            assert.calledWith(this.mockFaye2.subscribe, "/foo/boom");
        },

        "should emit": function () {
            this.stub(this.ps2, "_getEventName").returns("/boom");
            this.ps2.emit("foo", "some data");

            assert.calledOnce(this.mockFaye2.publish);
            assert.calledWith(this.mockFaye2.publish, "/foo/boom");
        },
    },

    "providing faye client": {
        setUp: function () {
            this.ps2 = pubsubClient.create({
                fayeClient: this.fayeClient
            });
        },

        "should connect to provided faye client": function (done) {
            var self = this;
            this.ps2.connect().then(done(function () {
                assert.same(self.fayeClient, self.ps2._fayeClient);
            }));
        }
    },

    "extending": function () {
        var obj = {};
        this.ps.extend(obj);
        assert.same(this.ps.connect, obj.connect);
        assert.same(this.ps.disconnect, obj.disconnect);
        assert.same(this.ps.emit, obj.emit);
        assert.same(this.ps.on, obj.on);
    },

    "should call onConnect when donnecting": function (done) {
        var spy = this.spy();

        var ps2 = pubsubClient.create({
            fayeClient: this.fayeClient,
            onConnect: spy
        });

        ps2.connect().then(done(function () {
            assert.calledOnce(spy);
        }));
    }
});
