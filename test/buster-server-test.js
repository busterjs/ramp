var buster = require("buster");
var sinon = require("sinon");

var busterServer = require("./../lib/buster-server");
var captureMiddleware = require("./../lib/capture/capture-middleware");

var http = require("http");
var h = require("./test-helper");

buster.testCase("buster-server glue", {
    setUp: function (done) {
        var self = this;
        this.server = Object.create(busterServer);
        this.httpServer = http.createServer(function (req, res) {
            if (!self.server.respond(req, res)) {
                res.writeHead(h.NO_RESPONSE_STATUS_CODE);
                res.end();
            }
        });
        this.httpServer.listen(h.SERVER_PORT, done);
        this.sandbox = sinon.sandbox.create();
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
        this.sandbox.restore();
    },

    "test binds client and session on first request": function (done) {
        this.sandbox.stub(captureMiddleware, "bindToSessionMiddleware");
        this.sandbox.stub(captureMiddleware, "bindToMulticastMiddleware");

        // Performing a request to make the middlewares respond.
        h.request({path: "/doesnotexist", method: "GET"}, function (res, body) {
            buster.assert(captureMiddleware.bindToSessionMiddleware.calledOnce);
            buster.assert(captureMiddleware.bindToMulticastMiddleware.calledOnce);
            done();
        }).end();
    },

    "test configures multicast middleware with context path": function (done) {
        h.request({
            path: "/sessions/messaging/clients",
            method: "GET"
        }, function (res, body) {
            buster.assert.match(JSON.parse(body), [{
                id: 1, url: "/sessions/messaging"
            }]);
            done();
        }).end();
    },

    "test unknown URL": function (done) {
        h.request({path: "/doesnotexist", method: "GET"}, function (res, body) {
            buster.assert.equals(h.NO_RESPONSE_STATUS_CODE, res.statusCode);
            done();
        }).end();
    },

    "test creating session": function () {
        var stub = this.sandbox.stub(this.server.sessionMiddleware, "createSession");
        this.server.createSession("foo");
        buster.assert(stub.calledOnce);
        buster.assert(stub.calledWithExactly("foo"));
    },

    "test destroying session": function () {
        var stub = this.sandbox.stub(this.server.sessionMiddleware, "destroySession");
        this.server.destroySession("foo");
        buster.assert(stub.calledOnce);
        buster.assert(stub.calledWithExactly("foo"));
    },

    "test creating client": function () {
        var stub = this.sandbox.stub(this.server.captureMiddleware, "captureClient");
        this.server.captureClient();
        buster.assert(stub.calledOnce);
    },

    "test creating session when uninitialized also calls out to client middleware": function () {
        this.server.createSession({load:[],resources:[]});
        buster.assert(this.server.captureMiddleware.currentSession);
    }
});