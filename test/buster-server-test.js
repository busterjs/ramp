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

    "test unknown URL": function (done) {
        h.request({path: "/doesnotexist", method: "GET"}, function (res, body) {
            assert.equals(h.NO_RESPONSE_STATUS_CODE, res.statusCode);
            done();
        }).end();
    }
});