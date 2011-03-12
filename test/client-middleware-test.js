var buster = require("buster-test");
var clientMiddleware = require("./../lib/client-middleware");

var http = require("http");
var h = require("./test-helper");

buster.testCase("Client middleware", {
    setUp: function (done) {
        var self = this;
        this.cm = Object.create(clientMiddleware);
        this.httpServer = http.createServer(function (req, res) {
            if (!self.cm.respond(req, res)) {
                res.writeHead(h.NO_RESPONSE_STATUS_CODE);
                res.end();
            }
        });
        this.httpServer.listen(16178, done);
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "test serves index page": function (done) {
        h.request({path: "/"}, function (res, body) {
            buster.assert.equals(res.statusCode, 200);
            buster.assert.equals(res.headers["content-type"], "text/html");
            buster.assert.match(body, /\<form .*action=.\/capture/);
            buster.assert.match(body, /\<form .*method=.post/);
            done();
        }).end();
    },

    "test creating/capturing client": function (done) {
        h.request({path: "/capture", method: "POST"}, function (res, body) {
            buster.assert.equals(res.statusCode, 201);
            buster.assert("location" in res.headers);
            buster.assert(res.headers.location != "/");
            done();
        }).end();
    },

    "test different clients gets different URLs": function (done) {
        h.request({path: "/capture", method: "POST"}, function (res, body) {
            var clientOneUrl = res.headers.location;
            h.request({path: "/capture", method: "POST"}, function (res, body) {
                var clientTwoUrl = res.headers.location;
                buster.assert.notEquals(clientOneUrl, clientTwoUrl);
                done();
            }).end();
        }).end();
    },

    "with a client": {
        setUp: function (done) {
            var self = this;
            h.request({path: "/capture", method: "POST"}, function (res, body) {
                self.clientUrl = res.headers.location;
                done();
            }).end();
        },

        "test getting client index page": function (done) {
            h.request({path: this.clientUrl}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(res.headers["content-type"], "text/html");
                buster.assert.match(body, "<frameset");
                buster.assert.match(body, /\<frame .*src=.buster\.html./);
                buster.assert.match(body, /\<frame .*src=.client\.html./);
                done();
            }).end();
        }
    }
});