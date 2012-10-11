var buster = require("buster-node");
var assert = buster.assert;

var rampResources = require("ramp-resources");
var h = require("./helpers/test-helper");

buster.testRunner.timeout = 4000;
buster.testCase("Slave header", {
    setUp: function (done) {
        this.serverBundle = h.createServerBundle(0, this, done);
    },

    tearDown: function (done) {
        this.serverBundle.tearDown(done);
    },

    "serves header": function (done) {
        var self = this;

        var headerRs = rampResources.resourceSet.create();
        headerRs.addResource({
            path: "/",
            content: done(function () {
                assert(true);
                return "The header!";
            })
        });

        this.c.setHeader(headerRs, 100).then(function () {
            self.b.capture(function (e, browser) {});
        });
    }
});

