var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCapServ = require("./../lib/buster-capture-server");
var bResourcesResourceSet = require("buster-resources").resourceSet;
var http = require("http");
var h = require("./test-helper");

buster.testCase("Capture server", {
    setUp: function (done) {
        this.httpServer = http.createServer(function (req, res) {
            res.writeHead(h.NO_RESPONSE_STATUS_CODE);
            res.end();
        });
        this.httpServer.listen(h.SERVER_PORT, done);

        this.cs = bCapServ.create();
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "attached to http server": {
        setUp: function () {
            this.cs.attach(this.httpServer);
        },

        "emits event when capturing slave": function (done) {
            h.request({path: this.cs.capturePath}).end();
            this.cs.bayeux.subscribe("/capture", function (slave) {
                assert.defined(slave);
                done();
            });
        },

        "with captured slave": {
            setUp: function (done) {
                var self = this;
                h.request({path: this.cs.capturePath}).end();
                this.cs.bayeux.subscribe("/capture", function (slave) {
                    self.slave = slave;
                    done();
                });
            },

            "yields slave information": function () {
                var s = this.cs.getSlave(this.slave.id);
                assert.defined(s);
                assert.defined(s.id);
                assert.equals(s.id, this.slave.id);
                assert.defined(s.url);
                assert.equals(s.url, this.slave.url);
            }
        }
    }
});