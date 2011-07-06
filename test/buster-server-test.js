var buster = require("buster");
var assert = buster.assert;
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
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "test binds client and session": function (done) {
        var self = this;
        this.stub(captureMiddleware, "bindToSessionMiddleware");
        this.server.setupMiddlewares();

        // Performing a request to make the middlewares respond.
        h.request({path: "/doesnotexist", method: "GET"}, function (res, body) {
            assert(captureMiddleware.bindToSessionMiddleware.calledOnce);
            assert.same(self.server.multicast, self.server.capture.multicastMiddleware);
            done();
        }).end();
    },

    "test configures multicast middleware with context path": function (done) {
        h.request({
            path: "/sessions/messaging/clients",
            method: "GET"
        }, function (res, body) {
            assert.match(JSON.parse(body), [{
                url: "/sessions/messaging"
            }]);
            done();
        }).end();
    },

    "test unknown URL": function (done) {
        h.request({path: "/doesnotexist", method: "GET"}, function (res, body) {
            assert.equals(h.NO_RESPONSE_STATUS_CODE, res.statusCode);
            done();
        }).end();
    },

    "test respond": function () {
        var req = {};
        var res = {};

        this.server.capture.respond = this.spy()
        this.server.session.respond = this.spy();
        this.server.multicast.respond = this.spy();
        this.server.resource.respond = this.spy();

        this.server.respond(req, res);

        assert(this.server.capture.respond.calledOnce);
        assert(this.server.capture.respond.calledWithExactly(req, res));

        assert(this.server.session.respond.calledOnce);
        assert(this.server.session.respond.calledWithExactly(req, res));

        assert(this.server.multicast.respond.calledOnce);
        assert(this.server.multicast.respond.calledWithExactly(req, res));

        assert(this.server.resource.respond.calledOnce);
        assert(this.server.resource.respond.calledWithExactly(req, res));
    }
});