var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var rampResources = require("ramp-resources");
var h = require("./helpers/test-helper");

var htmlparser = require("htmlparser");
var soupselect = require("soupselect");

function getDom(html) {
    var handler = new htmlparser.DefaultHandler(function () {});
    var parser = new htmlparser.Parser(handler);
    parser.parseComplete(html);
    return handler.dom;
}

function getHeaderSrc(body) {
    var dom = getDom(body);
    var srcFrame = soupselect.select(dom, "frame")[0];
    return srcFrame.attribs["src"];
};

buster.testRunner.timeout = 4000;
buster.testCase("Slave header", {
    setUp: function (done) {
        this.serverBundle = h.createServerBundle(0, this, done);
    },

    tearDown: function (done) {
        this.serverBundle.tearDown(function () {
            setTimeout(done, 1000);
        });
    },

    "serves header": function (done) {
        var self = this;

        var headerRs = rampResources.resourceSet.create();
        headerRs.addResource({
            path: "/",
            content: function () {
                return "The header!";
            }
        });

        this.c.setHeader(headerRs, 100).then(function () {
            self.b.capture(function (e, browser) {
                var slave = e.slave;
                var req = self.c._request("GET", slave.prisonPath)
                req.then(function (res) {
                    var headerSrc = getHeaderSrc(res.body);
                    assert(headerSrc);

                    var req = self.c._request("GET", headerSrc)
                    req.then(done(function (res) {
                        assert.equals(res.body, "The header!");
                    }));
                    req.end();
                });
                req.end();
            });
        });
    }
});

