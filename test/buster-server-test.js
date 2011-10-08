var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var busterServer = require("./../lib/buster-server");
var captureMiddleware = require("./../lib/capture/capture-middleware");
var faye = require("faye");
var http = require("http");
var h = require("./test-helper");

function createServer(done) {
    var httpServer = http.createServer(function (req, res) {
        res.writeHead(h.NO_RESPONSE_STATUS_CODE);
        res.end();
    });

    httpServer.listen(h.SERVER_PORT, done);
    return httpServer;
}

buster.testCase("buster-server glue", {
    "attached to server": {
        setUp: function (done) {
            this.httpServer = createServer(done);
            this.server = busterServer.create(this.httpServer);
        },

        tearDown: function (done) {
            this.httpServer.on("close", done);
            this.httpServer.close();
        },

        "test unknown URL": function (done) {
            h.request({path: "/doesnotexist", method: "GET"}, function (res, body) {
                assert.equals(h.NO_RESPONSE_STATUS_CODE, res.statusCode);
                done();
            }).end();
        },

        "proxying API methods": {
            "capture URL": function () {
                this.server.captureUrl = "/foo";
                assert.equals(this.server.capture.captureUrl, "/foo");
                assert.equals(this.server.captureUrl, "/foo");

                // Setting it this way is not a supported API, but testing it just in case.
                this.server.capture.captureUrl = "/bar";
                assert.equals(this.server.capture.captureUrl, "/bar");
                assert.equals(this.server.captureUrl, "/bar");
            },

            "oncapture": function () {
                this.server.oncapture = function () {};
                assert.same(this.server.capture.oncapture, this.server.oncapture);

                // Setting it this way is not a supported API, but testing it just in case.
                this.server.capture.oncapture = function () {};
                assert.same(this.server.capture.oncapture, this.server.oncapture);
            },

            "header": function () {
                this.stub(this.server.capture, "header");
                this.server.capture.header.returns("test");
                assert.equals(this.server.header("foo", "bar"), "test");
                assert(this.server.capture.header.calledOnce);
                assert(this.server.capture.header.calledWithExactly("foo", "bar"));
            },

            "createSesson": function () {
                this.stub(this.server.session, "createSession");
                this.server.session.createSession.returns("test");
                assert.equals(this.server.createSession("foo", "bar"), "test");
                assert(this.server.session.createSession.calledOnce);
                assert(this.server.session.createSession.calledWithExactly("foo", "bar"));
            },

            "destroySession": function () {
                this.stub(this.server.session, "destroySession");
                this.server.session.destroySession.returns("test");
                assert.equals(this.server.destroySession("foo", "bar"), "test");
                assert(this.server.session.destroySession.calledOnce);
                assert(this.server.session.destroySession.calledWithExactly("foo", "bar"));
            }
        }
    },

    "attaching to existing server": {
        setUp: function (done) {
            this.httpServer = createServer(done);
        },

        tearDown: function (done) {
            this.httpServer.on("close", done);
            this.httpServer.close();
        },

        "keeps listener created when creating server": function (done) {
            this.server = busterServer.create(this.httpServer);
            var spy = this.spy(this.server, "respond");

            h.request({path: "/doesnotexist", method: "GET"}, function (res, body) {
                assert.equals(h.NO_RESPONSE_STATUS_CODE, res.statusCode);
                assert(spy.calledOnce);
                done();
            }).end();
        },

        "keeps listener added after creating server and before attaching": function (done) {
            this.httpServer.addListener("request", function (req, res) {
                assert(spy.calledOnce);
                done();
            });
            this.server = busterServer.create(this.httpServer);
            var spy = this.spy(this.server, "respond");

            h.request({path: "/doesnotexist", method: "GET"}, function (res, body) {}).end();
        },

        "keeps listener added after creating server and after attaching": function (done) {
            this.server = busterServer.create(this.httpServer);
            var spy = this.spy(this.server, "respond");
            this.httpServer.addListener("request", function (req, res) {
                assert(spy.calledOnce);
                done();
            });

            h.request({path: "/doesnotexist", method: "GET"}, function (res, body) {}).end();
        }
    },

    "without an http server": {
        setUp: function (done) {
            this.httpServer = createServer(done);
            this.middleware = busterServer.create();
        },

        tearDown: function (done) {
            this.httpServer.on("close", done);
            this.httpServer.close();
        },

        "should manually attach": function (done) {
            this.middleware.attach(this.httpServer);

            h.request({ path: "/resources", method: "GET" }, function (res, body) {
                assert.equals(200, res.statusCode);
                done();
            }).end();
        },

        "should manually attach messaging client": function (done) {
            this.middleware.attach(this.httpServer);
            var url = "http://localhost:" + h.SERVER_PORT + "/sessions/messaging";
            var client = new faye.Client(url);

            var subscription = client.subscribe("/ping", function (message) {
                assert.equals(message, "Hello world");

                // Meh...
                subscription.cancel();
                client.disconnect();
                setTimeout(done, 5);
            });

            subscription.callback(function () {
                client.publish("/ping", "Hello world");
            });
        }
    }
});