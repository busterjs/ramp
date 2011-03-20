var buster = require("buster");
var clientMiddleware = require("./../lib/client-middleware");

var fs = require("fs");
var http = require("http");
var h = require("./test-helper");

buster.testCase("Client middleware", {
    setUp: function (done) {
        var self = this;
        this.cm = clientMiddleware.create();
        this.httpServer = http.createServer(function (req, res) {
            if (!self.cm.respond(req, res)) {
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
            buster.assert.equals(res.statusCode, 302);
            buster.assert("location" in res.headers);
            buster.assert(res.headers.location != "/");

            var data = JSON.parse(body);
            buster.assert(data.hasOwnProperty("messagingUrl"));
            buster.assert(data.messagingUrl.length > 1); // Not just a slash.
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
                self.clientData = JSON.parse(body);
                done();
            }).end();
        },

        "test getting client index page": function (done) {
            var self = this;
            h.request({path: this.clientUrl}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(res.headers["content-type"], "text/html");
                buster.assert.match(body, "<frameset");
                buster.assert.match(body, /\<frame .*src=..+buster\.html./);
                buster.assert.equals(body.match(/\<frame/g).length - 1, 2);
                buster.assert.match(body, self.clientUrl + "/buster.html");
                done();
            }).end();
        },

        "test buster.html serves buster scripts": function (done) {
            var self = this;
            h.request({path: this.clientUrl + "/buster.html"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(res.headers["content-type"], "text/html");
                buster.assert.match(body, /\<script .*src=..+client\-iframe\.js/);
                buster.assert.match(body, self.clientUrl + "/client-iframe.js");
                done();
            }).end();
        },

        "test serves env.js": function (done) {
            var self = this;
            h.request({path: this.clientUrl + "/env.js"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(res.headers["content-type"], "text/javascript");

                var scope = {};
                require("vm").runInNewContext(body, scope);
                buster.assert("buster" in scope);
                buster.assert.equals(typeof(scope.buster), "object");
                buster.assert.equals(scope.buster.messagingUrl, self.clientData.messagingUrl);
                done();
            }).end();
        },

        "test serves client-iframe.js": function (done) {
            var self = this;
            h.request({path: this.clientUrl + "/client-iframe.js"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(res.headers["content-type"], "text/javascript");
                fs.readFile(__dirname + "/../lib/client-iframe.js", function (err, data) {
                    buster.assert.equals(body, data.toString("utf8"));
                    done();
                });
            }).end();
        },

        "test client has messaging": function (done) {
            // We're kind of testing the messaging middleware here, but what
            // the hey. It's important that a client has messaging so we're
            // adding a full integration test for that.
            var self = this;
            h.request({path: self.clientData.messagingUrl, method: "POST"}, function (res, body) {
                buster.assert.equals(201, res.statusCode);

                h.request({path: self.clientData.messagingUrl, method: "GET"}, function (res, body) {
                    buster.assert.equals(200, res.statusCode);
                    var data = JSON.parse(body);
                    buster.assert.equals(1, data.length);
                    buster.assert.equals("foo", data[0].topic);
                    buster.assert.equals("bar", data[0].data);
                    done();
                }).end();
            }).end(new Buffer('[{"topic":"foo","data":"bar"}]', "utf8"));
        }
    }
});