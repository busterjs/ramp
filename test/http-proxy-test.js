var buster = require("buster");
var assert = buster.assert;
var http = require("http");
buster.httpProxy = require("../lib/http-proxy");

function body(res, callback) {
    var data = "";
    res.on("data", function (chunk) { data += chunk; });
    res.on("end", function () { callback(data); });
}

function request(opt, callback) {
    var req = http.request(buster.extend({
        method: "GET",
        host: "localhost",
        port: 2233
    }, opt));

    req.on("response", function (res) {
        if (callback) {
            callback(req, res);
        }
    });

    return req;
}

buster.testCase("HTTP proxy", {
    setUp: function (done) {
        var self = this;
        this.proxyMiddleware = buster.httpProxy.create("localhost", 2222);
        this.requests = [];

        this.backend = http.createServer(function (req, res) {
            self.requests.push({ req: req, res: res });

            if (self.onBackendRequest) {
                self.onBackendRequest(req, res);
            }
        });

        this.proxy = http.createServer(function (req, res) {
            self.proxyMiddleware.respond(req, res);
        });

        this.backend.listen(2222);
        this.proxy.listen(2233, done);
    },

    tearDown: function (done) {
        var num = 0;

        var doneCheck = function () {
            num += 1;

            if (num == 2) {
                done();
            }
        };

        for (var i = 0, l = this.requests.length; i < l; ++i) {
            if (!this.requests[i].res.ended) {
                this.requests[i].res.end();
            }
        }

        this.proxy.on("close", doneCheck);
        this.backend.on("close", doneCheck);
        this.backend.close();
        this.proxy.close();
    },

    "incoming requests": {
        "should send request to backend": function (done) {
            request().end();

            this.onBackendRequest = function (req, res) {
                assert(true);
                done();
            };
        },

        "should forward method and path": function (done) {
            request({ method: "GET", path: "/buster" }).end();

            this.onBackendRequest = function () {
                assert.match(this.requests[0].req, {
                    method: "GET",
                    url: "/buster"
                });

                done();
            };
        },

        "should forward url with query parameters": function (done) {
            request({ path: "/buster?id=23" }).end();

            this.onBackendRequest = function (req, res) {
                assert.match(req, { url: "/buster?id=23" });

                done();
            };
        },

        "should forward POST body": function (done) {
            var req = request({ method: "POST" });
            req.write("Yo, hey");
            req.end();

            this.onBackendRequest = function (req, res) {
                body(req, function (body) {
                    assert.equals(body, "Yo, hey");
                    done();
                });
            };
        },

        "should forward headers": function (done) {
            request({ headers: {
                "Expires": "Sun, 15 Mar 2012 12:18 26 GMT",
                "X-Buster": "Yes"
            }}).end();

            this.onBackendRequest = function (req, res) {
                assert.match(req.headers, {
                    "expires": "Sun, 15 Mar 2012 12:18 26 GMT",
                    "x-buster": "Yes"
                });

                done();
            };
        }
    },

    "responses": {
        "should send response": function (done) {
            request({}, function () {
                assert(true);
                done();
            }).end();

            this.onBackendRequest = function (req, res) {
                res.writeHead(200);
                res.end();
            };
        },

        "should forward response code": function (done) {
            request({}, function (req, res) {
                assert.equals(res.statusCode, 202);
                done();
            }).end();

            this.onBackendRequest = function (req, res) {
                res.writeHead(202);
                res.end();
            };
        },

        "should forward response body": function (done) {
            request({}, function (req, res) {
                body(res, function (body) {
                    assert.equals(body, "Yo, hey");
                    done();
                });
            }).end();

            this.onBackendRequest = function (req, res) {
                res.writeHead(200);
                res.end("Yo, hey");
            };
        },

        "should forward headers": function (done) {
            request({}, function (req, res) {
                assert.match(res.headers, {
                    "expires": "Sun, 15 Mar 2012 12:18 26 GMT",
                    "x-buster": "Yes"
                });

                done();
            }).end();

            this.onBackendRequest = function (req, res) {
                res.writeHead(200, {
                    "Expires": "Sun, 15 Mar 2012 12:18 26 GMT",
                    "X-Buster": "Yes"
                });

                res.end();
            };
        },

        "should respond with 503 when backend is down": function (done) {
            this.proxyMiddleware = buster.httpProxy.create("localhost", 2220);

            request({}, function (req, res) {
                assert.equals(res.statusCode, 503);

                done();
            }).end();
        }
    },

    "backend context path": {
        setUp: function () {
            this.proxyMiddleware = buster.httpProxy.create("localhost", 2222, "/myapp");
        },

        "should forward requests to scoped path": function (done) {
            request({ method: "GET", path: "/buster" }).end();

            this.onBackendRequest = function () {
                assert.equals(this.requests[0].req.url, "/myapp/buster");
                done();
            };
        },

        "should avoid double slash": function (done) {
            this.proxyMiddleware.path = "/myapp/";
            request({ method: "GET", path: "/buster" }).end();

            this.onBackendRequest = function () {
                assert.equals(this.requests[0].req.url, "/myapp/buster");
                done();
            };
        },

        "should strip context path from Location response header": function (done) {
            request({ method: "GET", path: "/buster" }, function (req, res) {
                assert.equals(res.headers.location, "/buster");
                done();
            }).end();

            this.onBackendRequest = function (req, res) {
                res.writeHead(302, { "Location": "/myapp/buster" });
                res.end();
            };
        }
    },

    "proxy context path": {
        setUp: function () {
            this.proxyMiddleware = buster.httpProxy.create("localhost", 2222);
            this.proxyMiddleware.proxyPath = "/buster";
        },

        "should forward requests to stripped path": function (done) {
            request({ method: "GET", path: "/buster/" }).end();

            this.onBackendRequest = function () {
                assert.equals(this.requests[0].req.url, "/");
                done();
            };
        },

        "should add missing slash": function (done) {
            request({ method: "GET", path: "/buster" }).end();

            this.onBackendRequest = function () {
                assert.equals(this.requests[0].req.url, "/");
                done();
            };
        },

        "should avoid double slash": function (done) {
            this.proxyMiddleware.proxyPath = "/buster/";
            request({ method: "GET", path: "/buster/bundle.js" }).end();

            this.onBackendRequest = function () {
                assert.equals(this.requests[0].req.url, "/bundle.js");
                done();
            };
        },

        "should add context path to Location response header": function (done) {
            request({ method: "GET", path: "/buster/sumptn" }, function (req, res) {
                assert.equals(res.headers.location, "/buster/other");
                done();
            }).end();

            this.onBackendRequest = function (req, res) {
                res.writeHead(302, { "Location": "/other" });
                res.end();
            };
        }
    },

    "proxy context path and backend path": {
        setUp: function () {
            this.proxyMiddleware = buster.httpProxy.create("localhost", 2222, "/foo");
            this.proxyMiddleware.proxyPath = "/bar";
        },

        "should forward requests to correct path": function (done) {
            request({ method: "GET", path: "/bar/baz" }, function (req, res) {
                assert.equals(res.headers.location, "/bar/foo/zing");
                done();
            }).end();

            this.onBackendRequest = function (req, res) {
                assert.equals(req.url, "/foo/baz");
                res.writeHead(301, { Location: "/foo/zing" });
                res.end();
            };
        }
    }
});
