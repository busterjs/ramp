var buster = require("buster-node");
var assert = buster.assert;
var refute = buster.refute;

var when = require("when");
var th = require("./test-helper.js");

buster.testCase("Capturing", {
    setUp: function () {
        return th.setUpHelpers(this, [th.ph, th.rs]);
    },

    tearDown: function () {
        return th.tearDownHelpers(this);
    },

    "one browser": function (done) {
        var self = this;

        this.ph.createPage(function (page) {
            page.open(self.rs.captureUrl, function (status) {
                th.httpGet(self.rs.serverUrl + "/slaves", done(function (res, body) {
                    assert.equals(res.statusCode, 200);
                    var body = JSON.parse(body);
                    assert.equals(body.length, 1)
                    assert(body[0].id);
                    assert(body[0].prisonPath);
                    assert(body[0].userAgent);
                    assert.match(body[0].userAgent, /phantomjs/i);
                }));
            });
        });
    },

    "two browsers": function (done) {
        var self = this;

        var slaveADeferred = when.defer();
        this.ph.createPage(function (page) {
            page.open(self.rs.captureUrl, function (status) {
                slaveADeferred.resolve();
            });
        });

        var slaveBDeferred = when.defer();
        this.ph.createPage(function (page) {
            page.open(self.rs.captureUrl, function (status) {
                slaveBDeferred.resolve();
            });
        });

        when.all([slaveADeferred.promise, slaveBDeferred.promise]).then(function () {
            th.httpGet(self.rs.serverUrl + "/slaves", done(function (res, body) {
                assert.equals(res.statusCode, 200);
                var body = JSON.parse(body);
                assert.equals(body.length, 2)
            }))
        });
    }
});
