var buster = require("buster");
var assert = buster.assert;
var http = require("http");
var h = require("./test-helper");

var resourceMiddleware = require("./../lib/resources/resource-middleware");

function assertBodyIsRootResourceProcessed(body, resourceSet) {
    assert.match(body, '<script src="' + resourceSet.resourceContextPath()  + '/foo.js"');
    assert.match(body, '<script src="' + resourceSet.internalsContextPath()  + require.resolve("buster-core") + '"');
}

buster.testCase("Resource middleware", {
    setUp: function (done) {
        var self = this;
        this.rm = Object.create(resourceMiddleware);

        this.httpServer = http.createServer(function (req, res) {
            if (self.rm.respond(req, res)) return true;
            res.writeHead(h.NO_RESPONSE_STATUS_CODE);
            res.end();
        });
        this.httpServer.listen(h.SERVER_PORT, done);
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "test returns temporary work-in-progress list of known resources": function (done) {
        h.request({path: "/resources", method: "GET"}, function (res, body) {
            assert.equals(200, res.statusCode);
            assert.equals(body, "[]");
            done();
        }).end();
    },

    "test root resource defaults to text/html content-type": function (done) {
        var rs = this.rm.createResourceSet({
            load: [],
            resources: {"/": {content: "hullo!"}}
        });

        h.request({path: rs.resourceContextPath() + "/", method: "GET"}, function (res, body) {
            assert.equals(res.headers["content-type"], "text/html");
            done();
        }).end();
    },

    "test root resource as a buffer": function (done) {
        var rs = this.rm.createResourceSet({
            load: [],
            resources: {"/": {content: new Buffer([0x3c, 0x62, 0x6f, 0x64, 0x79, 0x3e, 0x3c, 0x2f, 0x62, 0x6f, 0x64, 0x79, 0x3e])}}
        });

        h.request({path: rs.resourceContextPath() + "/", method: "GET"}, function (res, body) {
            assert.match(body, /^<body>/);
            done();
        }).end();
    },

    "resource sets": {
        setUp: function () {
            this.rs = this.rm.createResourceSet({
                load: ["/foo.js"],
                resources: {
                    "/foo.js": {
                        content: "var a = 5 + 5;"
                    }
                }
            });
        },

        "test loads script middleware scripts before resource scripts": function (done) {
            var self = this;
            h.request({path: this.rs.resourceContextPath() + "/", method: "GET"}, function (res, body) {
                var scriptTags = body.match(/<script.+>/g);
                assert.match(scriptTags[0], '<script src="' + self.rs.internalsContextPath()  + require.resolve("buster-core") + '"');
                done();
            }).end();
        },

        "test adding resource post create": function (done) {
            this.rs.addResource("/roflmao.txt", {"content": "Roflmao!"});

            h.request({
                path: this.rs.resourceContextPath() + "/roflmao.txt",
                method: "GET"}, function (res, body) {
                    assert.equals(res.statusCode, 200);
                    assert.equals(body, "Roflmao!");
                    done();
                }).end();
        },

        "test adding new root resource post create": function (done) {
            var self = this;
            this.rs.addResource("/", {content: "hullo"});
            h.request({
                path: this.rs.resourceContextPath() + "/",
                method: "GET"}, function (res, body) {
                    assertBodyIsRootResourceProcessed(body, self.rs);
                    done();
                }).end();
        },

        "test adding new root resouce with custom content-type": function (done) {
            var self = this;
            this.rs.addResource("/", {content: "hullo", headers: {"Content-Type": "text/wtf"}});
            h.request({
                path: this.rs.resourceContextPath() + "/",
                method: "GET"}, function (res, body) {
                    assert.equals(res.headers["content-type"], "text/wtf");
                    done();
                }).end();
        },

        "test serving buffer resources": function (done) {
            this.rs.addResource("/hullo.txt", {content: new Buffer([0x50, 0x4e, 0x47])});
            h.request({
                path: this.rs.resourceContextPath() + "/hullo.txt",
                method: "GET"}, function (res, body) {
                    assert.equals(body, "PNG");
                    done();
                }).end();
        },

        "test hosts resources": function (done) {
            h.request({path: this.rs.resourceContextPath() + "/foo.js", method: "GET"}, function (res, body) {
                assert.equals(200, res.statusCode);
                assert.equals("var a = 5 + 5;", body);
                assert.equals("application/javascript", res.headers["content-type"]);
                done();
            }).end();
        },

        "test hosts resources with custom headers": function (done) {
            this.rs.addResource("/baz.js", {content: "", headers: {"Content-Type": "text/custom"}});
            h.request({path: this.rs.resourceContextPath() + "/baz.js", method: "GET"}, function (res, body) {
                assert.equals(200, res.statusCode);
                assert.equals("text/custom", res.headers["content-type"]);
                done();
            }).end();
        },

        "test provides default root resource": function (done) {
            h.request({path: this.rs.resourceContextPath() + "/", method: "GET"}, function (res, body) {
                assert.equals(200, res.statusCode);
                assert.equals("text/html", res.headers["content-type"]);
                done();
            }).end();
        },

        "test does not serve none existing resources": function (done) {        
            h.request({path: this.rs.resourceContextPath() + "/does/not/exist.js", method: "GET"}, function (res, body) {
                assert.equals(h.NO_RESPONSE_STATUS_CODE, res.statusCode);
                done();
            }).end();
        },

        "test inserts scripts into root resource": function (done) {
            var self = this;
            h.request({path: this.rs.resourceContextPath() + "/", method: "GET"}, function (res, body) {
                assertBodyIsRootResourceProcessed(body, self.rs);
                done();
            }).end();
        },

        "test serves script middleware": function (done) {
            h.request({path: this.rs.internalsContextPath()  + require.resolve("buster-core"), method: "GET"}, function (res, body) {
                assert.equals(200, res.statusCode);
                done();
            }).end();
        },

        "mime types": {
            "should serve javascript with reasonable mime-type": function (done) {
                h.request({
                    path: this.rs.resourceContextPath() + "/foo.js"
                }, function (res, body) {
                    assert.equals(res.headers["content-type"], "application/javascript");
                    done();
                }).end();
            },

            "should serve javascript with reasonable mime-type and other headers": function (done) {
                h.request({
                    path: this.rs.resourceContextPath() + "/foo.js"
                }, function (res, body) {
                    assert.equals(res.headers["content-type"], "application/javascript");
                    done();
                }).end();
            },

            "should not overwrite custom mime-type": function (done) {
                this.rs.addResource("/baz.js", {content: "", headers: {"Content-Type": "text/custom"}});
                h.request({
                    path: this.rs.resourceContextPath() + "/baz.js"
                }, function (res, body) {
                    assert.equals(res.headers["content-type"], "text/custom");
                    done();
                }).end();
            }
        },


        "bundles": {
            setUp: function () {
                this.rs.addResource("/bundle.js", {
                    combine: ["/foo.js", "/bar/baz.js"],
                    headers: { "Expires": "Sun, 15 Mar 2012 22:22 37 GMT" }
                });

                this.rs.addResource("/bar/baz.js", {
                    content: "var b = 5 + 5; // Yes",
                    headers: {"Content-Type": "text/custom"}
                });
            },

            "should serve combined contents with custom header": function (done) {
                h.request({
                    path: this.rs.resourceContextPath() + "/bundle.js"
                }, function (res, body) {
                    assert.equals(res.statusCode, 200);
                    assert.equals(body, "var a = 5 + 5;\nvar b = 5 + 5; // Yes\n");
                    assert.match(res.headers, {
                        "expires": "Sun, 15 Mar 2012 22:22 37 GMT"
                    });

                    done();
                }).end();
            },

            "should serve combined contents minified": function (done) {
                this.rs.addResource("/bundle.min.js", {
                    combine: ["/bundle.js"],
                    minify: true
                });

                h.request({
                    path: this.rs.resourceContextPath() + "/bundle.min.js"
                }, function (res, body) {
                    assert.equals(res.statusCode, 200);
                    assert.equals(body, "var a=10,b=10");
                    done();
                }).end();
            },

            "should serve single resource contents minified": function (done) {
                this.rs.addResource("/foo.min.js", {
                    content: "var a = 5 + 5;",
                    minify: true
                });

                h.request({
                    path: this.rs.resourceContextPath() + "/foo.min.js"
                }, function (res, body) {
                    assert.equals(res.statusCode, 200);
                    assert.equals(body, "var a=10");
                    done();
                }).end();
            }
        },

        "proxy requests": {
            setUp: function (done) {
                this.proxyBackend = http.createServer(function (req, res) {
                    res.writeHead(200, { "X-Buster-Backend": "Yes" });
                    res.end("PROXY: " + req.url);
                });

                this.proxyBackend.listen(h.PROXY_PORT, done);

                this.rs.addResource("/other", {
                    backend: "http://localhost:" + h.PROXY_PORT + "/"
                });
            },

            tearDown: function (done) {
                this.proxyBackend.on("close", done);
                this.proxyBackend.close();
            },

            "should proxy requests to /other": function (done) {
                h.request({
                    path: this.rs.resourceContextPath() + "/other/file.js",
                    method: "GET"
                }, function (res, body) {
                    assert.equals(200, res.statusCode);
                    assert.equals(body, "PROXY: /other/file.js");
                    assert.equals(res.headers["x-buster-backend"], "Yes");
                    done();
                }).end();
            }
        }
    }
});