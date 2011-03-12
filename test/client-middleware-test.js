var buster = require("buster-test");
var clientMiddleware = require("./../lib/client-middleware");

var http = require("http");
var httpRequest = function (options, callback) {
    options.host = options.host || "localhost";
    options.port = options.port || 16178
    options.method = options.method || "GET";

    var req = http.request(options, function (res) {
        var body = "";
        res.on("data", function (chunk) { body += chunk; });
        res.on("end", function () { callback(res, body); });
    });
    return req;
};

var NO_RESPONSE_STATUS_CODE = 418;

buster.testCase("Client middleware", {
  setUp: function (done) {
        var self = this;
        this.cm = Object.create(clientMiddleware);
        this.httpServer = http.createServer(function (req, res) {
            if (!self.cm.respond(req, res)) {
                res.writeHead(NO_RESPONSE_STATUS_CODE);
                res.end();
            }
        });
        this.httpServer.listen(16178, function (e) {
            done();
        });
    },

    tearDown: function (done) {
        this.httpServer.on("close", function () {
            done();
        });
        this.httpServer.close();
    },

    "test serves index page": function (done) {
        httpRequest({path: "/"}, function (res, body) {
            buster.assert.equals(res.statusCode, 200);
            buster.assert.equals(res.headers["content-type"], "text/html");
            buster.assert.match(body, /\<form .*action=.\/capture/);
            buster.assert.match(body, /\<form .*method=.post/);
            done();
        }).end();
    },

    "test creating/capturing client": function (done) {
        httpRequest({path: "/capture", method: "POST"}, function (res, body) {
            buster.assert.equals(res.statusCode, 201);
            buster.assert("location" in res.headers);
            buster.assert(res.headers.location != "/");
            done();
        }).end();
    },

    "test different clients gets different URLs": function (done) {
        httpRequest({path: "/capture", method: "POST"}, function (res, body) {
            var clientOneUrl = res.headers.location;
            httpRequest({path: "/capture", method: "POST"}, function (res, body) {
                var clientTwoUrl = res.headers.location;
                buster.assert.notEquals(clientOneUrl, clientTwoUrl);
                done();
            }).end();
        }).end();
    }
});