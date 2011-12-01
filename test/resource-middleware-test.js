var buster = require("buster");
var assert = buster.assert;
var http = require("http");
var fs = require("fs");
var h = require("./test-helper");

var busterServer = require("./../lib/buster-capture-server");

function assertBodyIsRootResourceProcessed(body, resourceSet) {
    assert.match(body, '<script src="' + resourceSet.contextPath  + '/foo.js"');
}

buster.testCase("Resource middleware", {
    setUp: function (done) {
        var self = this;

        this.httpServer = http.createServer(function (req, res) {
            if (self.rm.respond(req, res)) return true;
            res.writeHead(h.NO_RESPONSE_STATUS_CODE);
            res.end();
        });
        this.httpServer.listen(h.SERVER_PORT, done);

        this.busterServer = busterServer.create();
        this.busterServer.attach(this.httpServer);
        this.rm = this.busterServer.resource;
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "should list known resources for GET /resources": function (done) {
        this.rm.busterResources.createResourceSet({
            resources: {
                "/foo.js": {
                    content: "cake",
                    etag: "123abc"
                }
            }
        });

        h.request({path: "/resources"}, function (res, body) {
            assert.equals(res.statusCode, 200);
            var actual = JSON.parse(body);
            assert.equals(actual, {"/foo.js": ["123abc"]});
            done();
        }).end();
    },

    "should gc for DELETE /resources": function (done) {
        var stub = this.stub(this.rm.busterResources, "gc");
        h.request({path: "/resources", method: "DELETE"}, function (res, body) {
            assert.equals(res.statusCode, 200);
            done();
        }).end();
    }
});