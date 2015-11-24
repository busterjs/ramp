var buster = require("buster-node");
var assert = buster.referee.assert;

var http = require("http");
var when = require("when");
var ramp = require("./../lib/ramp");
var rampResources = require("ramp-resources");
var th = require("./test-helper.js");

buster.testCase("HTTP proxy", {
    setUp: function () {
        var httpDeferred = when.defer();
        this.httpServer = http.createServer();
        this.httpServer.listen(0, function () {
            this.httpPort = this.httpServer.address().port;
            httpDeferred.resolver.resolve()
        }.bind(this));

        return when.all([
            th.setUpHelpers(this, [th.ph, th.rs]),
            httpDeferred.promise
        ])
    },

    tearDown: function () {
        this.httpServer.close();
        return th.tearDownHelpers(this);
    },

    "should work": function () {
        var httpPort = this.httpPort;
        var httpSpy = this.spy();

        var timesCalled = 0;
        var onHttpRequestDone = new when.promise(function (resolve) {
            this.httpServer.on("request", function (req, res) {
                httpSpy(req.url);

                ++timesCalled;
                if (timesCalled === 2) {
                    resolve();
                }
            });
        }.bind(this));

        var rs = rampResources.createResourceSet();
        rs.addResource({path: "/myproxy", backend: "http://localhost:" + httpPort});
        rs.addResource({
            path: "/test.js",
            content: "function ajax(path) { var r = new XMLHttpRequest(); r.open('GET', path, true); r.send() }; ajax(buster.env.contextPath + '/myproxy'); ajax(buster.env.contextPath + '/myproxy/test');"
        });
        rs.loadPath.append("/test.js");

        return th.capture(this)
            .then(function (captured) {
                return captured.rc.createSession(rs);
            })
            .then(function (sessionClientInitializer) {
                return sessionClientInitializer.initialize();
            })
            .then(function () {
                return onHttpRequestDone;
            })
            .then(function () {
                assert(httpSpy.calledTwice);
                assert.calledWith(httpSpy, "/");
                assert.calledWith(httpSpy, "/test");
            });
    }
});
