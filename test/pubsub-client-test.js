var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var sinon = require("sinon");

var bCapServPubsubClient = require("./../lib/pubsub-client");
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

        this.pc = bCapServPubsubClient.create({
            host: "0.0.0.0",
            port: h.SERVER_PORT
        });
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
        this.pc.disconnect();
    },

    "should create faye client with provided host and port": function () {
        var spy = this.stub(faye, "Client");
        var client = this.pc._createFayeClient();
        assert.calledOnce(spy);

        var url = "http://" + this.pc._serverHost + ":" + this.pc._serverPort + "/messaging";
        assert.calledWith(faye.Client, url);
    },

    "should connect": function (done) {
        assert(true);
        this.pc.connect().then(done);
    },

    "should not subscribe to connection event when connected": function (done) {
        var self = this;
        assert(true);

        this.pc.connect().then(function () {
            // Will throw uncaught exception due to double resolve if not handled
            self.pc._fayeClient.publish("/initialie/" + self.pc._id, {})
                .callback(done);
        });
    },

    "mock connection": {
        setUp: function () {
            this.mockFaye = mockFaye();
            this.pc._fayeClient = this.mockFaye;
        },

        "should get faye event name": function ( ){
            assert.equals(this.pc._getEventName("foo"), "/user/foo");
        },

        "should get namespaced faye event name": function ( ){
            assert.equals(this.pc._getEventName("foo:bar:baz"), "/user/foo-bar-baz");
        },

        "should fail when getting invalid event name": function () {
            var self = this;

            assert.exception(function () {
                self.pc._getEventName("/foo");
            }, "TypeError");

            assert.exception(function () {
                self.pc._getEventName("foo/bar");
            }, "TypeError");

            assert.exception(function () {
                self.pc._getEventName(":foo");
            }, "TypeError");

            assert.exception(function () {
                self.pc._getEventName("foo:");
            }, "TypeError");

            assert.exception(function () {
                self.pc._getEventName(":foo:bar:baz");
            }, "TypeError");

            assert.exception(function () {
                self.pc._getEventName("foo:bar:baz:");
            }, "TypeError");

            assert.exception(function () {
                self.pc._getEventName(":");
            }, "TypeError");

            assert.exception(function () {
                self.pc._getEventName("::");
            }, "TypeError");

            assert.exception(function () {
                self.pc._getEventName(":f:");
            }, "TypeError");

            assert.exception(function () {
                self.pc._getEventName("");
            }, "TypeError");
        },

        "should listen to event": function () {
            this.stub(this.pc, "_getEventName").returns("/boom");
            this.pc.on("foo", function () {});

            assert.calledOnce(this.mockFaye.subscribe);
            assert.calledWith(this.mockFaye.subscribe, "/boom");

            assert.calledOnce(this.pc._getEventName);
            assert.calledWithExactly(this.pc._getEventName, "foo");
        },

        "should emit event": function () {
            this.stub(this.pc, "_getEventName").returns("/boom");
            this.pc.emit("foo", "some data");

            assert.calledOnce(this.mockFaye.publish);
            assert.calledWith(this.mockFaye.publish, "/boom");

            assert.calledOnce(this.pc._getEventName);
            assert.calledWithExactly(this.pc._getEventName, "foo");
        }
    },

    "actual connection": {
        setUp: function (done) {
            this.pc.connect().then(done);
        },

        "event cycle with data": function (done) {
            this.pc.on("foo", done(function (data) {
                assert.equals(data, "some data");
            }));

            this.pc.emit("foo", "some data");
        },

        "event cycle with no data": function (done) {
            this.pc.on("foo", done(function (data) {
                refute(data);
            }));

            this.pc.emit("foo");
        },

        "inherits with faye client": function () {
            var spy = this.spy(bCapServPubsubClient, "create");
            this.pc2 = this.pc.inherit("/my/context/path");
            assert(spy.calledOnce);

            var opts = spy.getCall(0).args[0];
            assert.same(opts._fayeClient, this.pc._fayeClient);
            assert.equals(opts.contextPath, "/my/context/path");
        },

        "fails inherit with blank context path": function () {
            assert.exception(function () {
                this.pc.inherit("");
            }.bind(this));
        }
    },

    "context path": {
        setUp: function () {
            this.pc2 = bCapServPubsubClient.create({
                host: "0.0.0.0",
                port: h.SERVER_PORT,
                contextPath: "/foo"
            });
            this.mockFaye2 = mockFaye();
            this.pc2._fayeClient = this.mockFaye2;
        },

        "should listen": function () {
            this.stub(this.pc2, "_getEventName").returns("/boom");
            this.pc2.on("foo", function () {});

            assert.calledOnce(this.mockFaye2.subscribe);
            assert.calledWith(this.mockFaye2.subscribe, "/foo/boom");
        },

        "should emit": function () {
            this.stub(this.pc2, "_getEventName").returns("/boom");
            this.pc2.emit("foo", "some data");

            assert.calledOnce(this.mockFaye2.publish);
            assert.calledWith(this.mockFaye2.publish, "/foo/boom");
        },
    },

    "providing faye client": {
        setUp: function () {
            this.pc2 = bCapServPubsubClient.create({
                _fayeClient: this.fayeClient
            });
        },

        "should connect to provided faye client": function (done) {
            var self = this;
            this.pc2.connect().then(done(function () {
                assert.same(self.fayeClient, self.pc2._fayeClient);
            }));
        }
    },

    "extending": function () {
        var obj = {};
        this.pc.extend(obj);
        assert.same(this.pc.connect, obj.connect);
        assert.same(this.pc.disconnect, obj.disconnect);
        assert.same(this.pc.emit, obj.emit);
        assert.same(this.pc.on, obj.on);
    },

    "should call onConnect when donnecting": function (done) {
        var spy = this.spy();

        var pc2 = bCapServPubsubClient.create({
            _fayeClient: this.fayeClient,
            onConnect: spy
        });

        pc2.connect().then(done(function () {
            assert.calledOnce(spy);
        }));
    },

    "should not disconnect when not using own faye client": function (done) {
        var self = this;
        this.spy(this.fayeClient, "disconnect");

        var pc2 = bCapServPubsubClient.create({
            _fayeClient: this.fayeClient
        });

        pc2.connect().then(done(function () {
            pc2.disconnect();
            refute.called(self.fayeClient.disconnect);
        }));
    },

    "fails inherit when not connected": function () {
        assert.exception(function () {
            this.pc.inherit("/foo");
        }.bind(this));
    }
});
