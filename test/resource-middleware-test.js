var buster = require("buster");
var assert = buster.assert;
var http = require("http");
var fs = require("fs");
var h = require("./test-helper");

var resourceMiddleware = require("./../lib/resources/resource-middleware");

function assertBodyIsRootResourceProcessed(body, resourceSet) {
    assert.match(body, '<script src="' + resourceSet.contextPath  + '/foo.js"');
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

    "test root resource defaults to text/html content-type": function (done) {
        var rs = this.rm.createResourceSet({
            load: [],
            resources: {"/": {content: "hullo!"}}
        });

        h.request({path: rs.contextPath + "/", method: "GET"}, function (res, body) {
            assert.equals(res.headers["content-type"], "text/html");
            done();
        }).end();
    },

    "test root resource as a buffer": function (done) {
        var rs = this.rm.createResourceSet({
            load: [],
            resources: {"/": {content: new Buffer([0x3c, 0x62, 0x6f, 0x64, 0x79, 0x3e, 0x3c, 0x2f, 0x62, 0x6f, 0x64, 0x79, 0x3e])}}
        });

        h.request({path: rs.contextPath + "/", method: "GET"}, function (res, body) {
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

        "test adding resource post create": function (done) {
            this.rs.addResource("/roflmao.txt", {"content": "Roflmao!"});

            h.request({
                path: this.rs.contextPath + "/roflmao.txt",
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
                path: this.rs.contextPath + "/",
                method: "GET"}, function (res, body) {
                    assertBodyIsRootResourceProcessed(body, self.rs);
                    done();
                }).end();
        },

        "test adding new root resouce with custom content-type": function (done) {
            var self = this;
            this.rs.addResource("/", {content: "hullo", headers: {"Content-Type": "text/wtf"}});
            h.request({
                path: this.rs.contextPath + "/",
                method: "GET"}, function (res, body) {
                    assert.equals(res.headers["content-type"], "text/wtf");
                    done();
                }).end();
        },

        "test serving buffer resources": function (done) {
            this.rs.addResource("/hullo.txt", {content: new Buffer([0x50, 0x4e, 0x47])});
            h.request({
                path: this.rs.contextPath + "/hullo.txt",
                method: "GET"}, function (res, body) {
                    assert.equals(body, "PNG");
                    done();
                }).end();
        },

        "test hosts resources": function (done) {
            h.request({path: this.rs.contextPath + "/foo.js", method: "GET"}, function (res, body) {
                assert.equals(200, res.statusCode);
                assert.equals("var a = 5 + 5;", body);
                assert.equals("application/javascript", res.headers["content-type"]);
                done();
            }).end();
        },

        "test hosts resources with custom headers": function (done) {
            this.rs.addResource("/baz.js", {content: "", headers: {"Content-Type": "text/custom"}});
            h.request({path: this.rs.contextPath + "/baz.js", method: "GET"}, function (res, body) {
                assert.equals(200, res.statusCode);
                assert.equals("text/custom", res.headers["content-type"]);
                done();
            }).end();
        },

        "test provides default root resource": function (done) {
            h.request({path: this.rs.contextPath + "/", method: "GET"}, function (res, body) {
                assert.equals(200, res.statusCode);
                assert.equals("text/html", res.headers["content-type"]);
                done();
            }).end();
        },

        "test does not serve none existing resources": function (done) {        
            h.request({path: this.rs.contextPath + "/does/not/exist.js", method: "GET"}, function (res, body) {
                assert.equals(h.NO_RESPONSE_STATUS_CODE, res.statusCode);
                done();
            }).end();
        },

        "test inserts scripts into root resource": function (done) {
            var self = this;
            h.request({path: this.rs.contextPath + "/", method: "GET"}, function (res, body) {
                assertBodyIsRootResourceProcessed(body, self.rs);
                done();
            }).end();
        },

        "test content is function": function (done) {
            this.rs.addResource("/test", {
                content: function (promise) {
                    promise.resolve("Test");
                }
            });

            h.request({path: this.rs.contextPath + "/test", method: "GET"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(body, "Test");
                done();
            }).end();
        },

        "test content is function with failure": function (done) {
            this.rs.addResource("/test", {
                content: function (promise) {
                    promise.reject("something");
                }
            });

            h.request({path: this.rs.contextPath + "/test", method: "GET"}, function (res, body) {
                buster.assert.equals(res.statusCode, 500);
                // TODO: test with actual exception and specify what 'body' should be.
                done();
            }).end();
        },

        "test adding file by path": function (done) {
            this.rs.addFile(__filename);

            h.request({path: this.rs.contextPath + __filename, method: "GET"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(body, fs.readFileSync(__filename));
                done();
            }).end();
        },

        "test adding file by path with missing file": function (done) {
            var filename = "/tmp/i-sure-hope-this-file-does-not-exist" + new Date().getTime().toString();
            this.rs.addFile(filename);

            h.request({path: this.rs.contextPath + filename, method: "GET"}, function (res, body) {
                buster.assert.equals(res.statusCode, 500);
                // TODO: specify what 'body' should be.
                done();
            }).end();
        },

        "test getting cached resources with nothing cached": function (done) {
            h.request({path: "/resources", method: "GET"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(JSON.parse(body), []);
                done();
            }).end();
        },

        "test getting cached resources with resource cached": function (done) {
            this.rs.addResource("/test.js", {
                content: "",
                etag: "123abc"
            });

            h.request({path: "/resources", method: "GET"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                var actual = JSON.parse(body);
                buster.assert(actual instanceof Array);
                buster.assert.equals(actual.length, 1);
                buster.assert.equals(actual[0], {path: "/test.js", etag: "123abc"});
                done();
            }).end();
        },

        "test re-using cached resource when creating new resource set": function (done) {
            this.rs.addResource("/test.js", {
                content: "Hello, World!",
                headers: {"X-Foo": "666"},
                etag: "123abc"
            });

            var rs2 = this.rm.createResourceSet({
                contextPath: "/rs2",
                resources: {
                    "/test.js": "123abc"
                }
            });

            h.request({path: rs2.contextPath + "/test.js", method: "GET"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(body, "Hello, World!");
                buster.assert.equals(res.headers["x-foo"], 666);
                done();
            }).end();
        },

        "test creating new resource with none existing etag": function (done) {
            var self = this;
            try {
                self.rm.createResourceSet({
                    contextPath: "/rs2",
                    resources: {
                        "/test.js": "123abc"
                    }
                });
            } catch (e) {
                buster.assert.match(e.message, "/test.js");
                buster.assert.match(e.message, "123abc");
                buster.assert.match(e.message, "not found");
                done();
            }
        },

        "test removing resource sets": function (done) {
            var self = this;
            var rs = this.rm.createResourceSet({
                resources: {
                    "/myfile.js": {
                        content: "Hi there."
                    }
                }
            });
            rs.contextPath = "/yay";

            var resourcePath = "/yay/myfile.js";
            h.request({path: resourcePath, method: "GET"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                self.rm.removeResourceSet(rs);
                h.request({path: resourcePath, method: "GET"}, function (res, body) {
                    buster.assert.equals(res.statusCode, h.NO_RESPONSE_STATUS_CODE);
                    done();
                }).end();
            }).end();
        },

        "mime types": {
            "should serve javascript with reasonable mime-type": function (done) {
                h.request({
                    path: this.rs.contextPath + "/foo.js"
                }, function (res, body) {
                    assert.equals(res.headers["content-type"], "application/javascript");
                    done();
                }).end();
            },

            "should serve javascript with reasonable mime-type and other headers": function (done) {
                h.request({
                    path: this.rs.contextPath + "/foo.js"
                }, function (res, body) {
                    assert.equals(res.headers["content-type"], "application/javascript");
                    done();
                }).end();
            },

            "should not overwrite custom mime-type": function (done) {
                this.rs.addResource("/baz.js", {content: "", headers: {"Content-Type": "text/custom"}});
                h.request({
                    path: this.rs.contextPath + "/baz.js"
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
                    path: this.rs.contextPath + "/bundle.js"
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
                    path: this.rs.contextPath + "/bundle.min.js"
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
                    path: this.rs.contextPath + "/foo.min.js"
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
                    path: this.rs.contextPath + "/other/file.js",
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