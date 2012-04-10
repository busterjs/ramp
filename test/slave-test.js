var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCaptureServerSlave = require("../lib/slave");
var http = require("http");
var faye = require("faye");
var when = require("when");
var h = require("./test-helper");

buster.testCase("slave", {
    setUp: function () {
        this.slave = bCaptureServerSlave.create();
    },

    "has prison path": function () {
        assert(this.slave.prisonPath);
    },

    "attached to http server": {
        setUp: function (done) {
            this.httpServer = http.createServer(function (req, res) {
                res.writeHead(h.NO_RESPONSE_STATUS_CODE); res.end();
            });
            this.httpServer.listen(h.SERVER_PORT, done);

            this.slave.attach(this.httpServer);
        },

        tearDown: function (done) {
            this.httpServer.on("close", done);
            this.httpServer.close();
        },

        "serves prison": function (done) {
            h.request({path: this.slave.prisonPath}, done(function (res, body) {
                assert.equals(res.statusCode, 200);
            })).end()
        }
    }
});