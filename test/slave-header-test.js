var buster = require("buster-node");
var assert = buster.referee.assert;

var ramp = require("./../lib/ramp");
var http = require("http");
var rampResources = require("ramp-resources");
var th = require("./test-helper.js");

buster.testCase("Slave header", {
    setUp: function (done) {
        var self = this;

        var httpServer = http.createServer(function (req, res) {
            res.writeHead(418);
            res.end();
        });

        httpServer.listen(0, function () {
            self.httpServer = httpServer;
            self.httpServerPort = httpServer.address().port;

            var rs = rampResources.createResourceSet();
            rs.addResource({
                path: "/",
                content: 'Hello, World!'
            });

            var rampServer = ramp.createServer({
                header: {
                    resourceSet: rs,
                    height: 80
                }
            });
            rampServer.attach(httpServer);
            self.rampServer = rampServer;

            self.rc = ramp.createRampClient(self.httpServerPort);
            done();
        });
    },

    tearDown: function (done) {
        this.rc.destroy();
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "should be present": function () {
        var serverUrl = "http://localhost:" + this.httpServerPort;

        return th.http("GET", serverUrl + "/capture")
            .then(function (e) {
                assert.equals(e.res.statusCode, 302);
                return th.http("GET", serverUrl + e.res.headers.location);
            })
            .then(function (e) {
                assert.equals(e.res.statusCode, 200);
                assert.equals(e.body.match(/\<frame[^s]\s/ig).length, 2, "Should find two frame tags");
                assert.match(e.body, /80px/);
                assert.match(e.body, /\/slave_header\//);
            })
            .then(function () {
                return th.http("GET", serverUrl + "/slave_header/");
            })
            .then(function (e) {
                assert.equals(e.res.statusCode, 200);
                assert.match(e.body, /^Hello\, World\!/);
            });
    }

});
