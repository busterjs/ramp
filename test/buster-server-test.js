var buster = require("buster");
var assert = buster.assert;
var busterServer = require("./../lib/buster-server");
var captureMiddleware = require("./../lib/capture/capture-middleware");

var http = require("http");
var h = require("./test-helper");

buster.testCase("buster-server glue", {
    "responding on existing server": {
        setUp: function (done) {
            var self = this;
            this.httpServer = http.createServer(function (req, res) {
                res.writeHead(h.NO_RESPONSE_STATUS_CODE);
                res.end();
            });
            this.httpServer.listen(h.SERVER_PORT, done);
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
        }
    },

    "attaching to existing server": {
        setUp: function (done) {
            this.httpServer = http.createServer(function (req, res) {
                res.writeHead(h.NO_RESPONSE_STATUS_CODE);
                res.end();
            });
            this.httpServer.listen(h.SERVER_PORT, done);
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
    }
});