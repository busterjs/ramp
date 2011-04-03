var buster = require("buster");
var http = require("http");
var vm = require("vm");
var busterSessionMiddleware = require("./../lib/session/session-middleware");
var port = 12435;

var h = require("./test-helper");

function request(options, handler) {
    options.host = "localhost";
    options.port = port;
    return http.request(options, function (res) {
        if (!handler) return;
        res.setEncoding("utf8");
        var responseBody = "";
        res.on("data", function (data) { responseBody += data; });
        res.on("end", function () { handler(res, responseBody); });
    });
};

buster.testCase("Session middleware", {
    setUp: function (done) {
        var self = this;
        var middleware = Object.create(busterSessionMiddleware);
        this.httpServer = http.createServer(function (req, res) {
            if (!middleware.respond(req, res)) {
                res.writeHead(500);
                res.end();
            };
        });
        this.httpServer.listen(port, function (e) {
            var sessionReq = request({path: "/sessions", method: "POST"}, function (res, body) {
                self.res = res;
                self.session = JSON.parse(body);
                done();
            });
            sessionReq.write(JSON.stringify({
                load: ["/foo.js"],
                resources: {
                    "/foo.js": {
                        content: "5 + 5;"
                    },
                    "/bar/baz.js": {
                        content: "5 + 5;",
                        headers: {"Content-Type": "text/custom"}
                    }
                }
            }));
            sessionReq.end();
        });
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "test creating session": function () {
        buster.assert.equals(201, this.res.statusCode);
        buster.assert("location" in this.res.headers);
        buster.assert.match(this.res.headers.location, /^\/.+/);

        buster.assert("rootPath" in this.session);
        buster.assert.equals(this.res.headers.location, this.session.rootPath);

        buster.assert("resourceContextPath" in this.session);
        // resourceContextPath should be prefixed with rootPath.
        var expectedPrefix = this.session.resourceContextPath.slice(0, this.session.rootPath.length)
        buster.assert.equals(expectedPrefix, this.session.rootPath);
    },

    "test hosts resources": function (done) {
        request({path: this.session.resourceContextPath + "/foo.js", method: "GET"}, function (res, body) {
            buster.assert.equals(200, res.statusCode);
            buster.assert.equals("5 + 5;", body);
            buster.assert.equals("text/javascript", res.headers["content-type"]);
            done();
        }).end();
    },

    "test hosts resources with custom headers": function (done) {
        request({path: this.session.resourceContextPath + "/bar/baz.js", method: "GET"}, function (res, body) {
            buster.assert.equals(200, res.statusCode);
            buster.assert.equals("text/custom", res.headers["content-type"]);
            done();
        }).end();
    },

    "test provides default root resource": function (done) {
        request({path: this.session.resourceContextPath + "/", method: "GET"}, function (res, body) {
            buster.assert.equals(200, res.statusCode);
            buster.assert.equals("text/html", res.headers["content-type"]);
            done();
        }).end();
    },

    "test provides session environment script": function (done) {
        var self = this;
        request({path: this.session.rootPath + "/env.js", method: "GET"}, function (res, body) {
            buster.assert.equals(200, res.statusCode);
            buster.assert.equals("text/javascript", res.headers["content-type"]);

            var ctx = {};
            vm.runInNewContext(body, ctx);
            buster.assert.equals("object", typeof ctx.buster);
            buster.assert.equals(self.session.rootPath, ctx.buster.rootPath);
            buster.assert.equals(self.session.resourceContextPath, ctx.buster.resourceContextPath);

            done();
        }).end();
    },

    "test inserts buster scripts and session scripts into root resource": function (done) {
        var self = this;
        request({path: this.session.resourceContextPath + "/", method: "GET"}, function (res, body) {
            buster.assert.match(body, '<script src="' + self.session.rootPath  + '/env.js"');
            buster.assert.match(body, '<script src="' + self.session.resourceContextPath  + '/foo.js"');
            done();
        }).end();
    },

    "test killing sessions": function (done) {
        var self = this;
        request({path: this.session.rootPath, method: "DELETE"}, function (res, body) {
            buster.assert.equals(200, res.statusCode);

            // 500 is the status code for unhandled requests, see setUp.
            request({path: self.session.resourceContextPath + "/foo.js", method: "GET"}, function (res, body) {
                buster.assert.equals(500, res.statusCode);
                request({path: self.session.rootPath, method: "GET"}, function (res, body) {
                    buster.assert.equals(500, res.statusCode);
                    done();
                }).end();
            }).end();
        }).end();
    },

    "test creating session with other session in progress": function (done) {
        var sessionReq = request({path: "/sessions", method: "POST"}, function (res, body) {
            buster.assert.equals(202, res.statusCode);
            done();
        });
        sessionReq.write(JSON.stringify({load: [], resources: {"/foo.js": {content: "5 + 5;"}}}));
        sessionReq.end();
    }
});