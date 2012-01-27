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
            },

            "serves slave page": function (done) {
                var self = this;
                h.request({path: this.slave.url}, function (res, body) {
                    assert.equals(res.statusCode, 200);
                    assert.match(res.headers["content-type"], "text/html");
                    done();
                }).end();
            },

            "serves slave page with header": function (done) {
                var self = this;

                var rs = bResourcesResourceSet.create();
                rs.addResource({
                    path: "/",
                    content: "<p>Hello, World.</p>"
                });
                this.cs.header(80, rs);
                h.request({path: this.slave.url}, function (res, body) {
                    var dom = h.parseDOM(body);
                    var headerSrc = h.domSelect(dom, "frame")[0].attribs.src
                    h.request({path: headerSrc}, function (res, body) {
                        assert.equals(res.statusCode, 200);
                        assert.equals(body, "<p>Hello, World.</p>");
                        done();
                    }).end();
                }).end();
            }
        }
    }
});