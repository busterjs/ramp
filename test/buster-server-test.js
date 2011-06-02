var buster = require("buster");
var sinon = require("sinon");

var busterServer = require("./../lib/buster-server");
var captureMiddleware = require("./../lib/capture/capture-middleware");

var http = require("http");
var h = require("./test-helper");

buster.testCase("buster-server glue", {
    setUp: function (done) {
        var self = this;
        this.server = busterServer.create();
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

    "test binds client and session": function (done) {
        var self = this;
        this.sandbox.stub(captureMiddleware, "bindToSessionMiddleware");
        this.server.setupMiddlewares();

        // Performing a request to make the middlewares respond.
        h.request({path: "/doesnotexist", method: "GET"}, function (res, body) {
            buster.assert(captureMiddleware.bindToSessionMiddleware.calledOnce);
            buster.assert.same(self.server.multicast, self.server.capture.multicastMiddleware);
            done();
        }).end();
    },

    "test configures multicast middleware with context path": function (done) {
        h.request({
            path: "/sessions/messaging/clients",
            method: "GET"
        }, function (res, body) {
            buster.assert.match(JSON.parse(body), [{
                url: "/sessions/messaging"
            }]);
            done();
        }).end();
    },

    "test unknown URL": function (done) {
        h.request({path: "/doesnotexist", method: "GET"}, function (res, body) {
            buster.assert.equals(h.NO_RESPONSE_STATUS_CODE, res.statusCode);
            done();
        }).end();
    }
});