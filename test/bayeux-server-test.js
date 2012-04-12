var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var sinon = require("sinon");

var bayeuxServer = require("./../lib/bayeux-server");
var http = require("http");
var faye = require("faye");
var when = require("when");
var h = require("./test-helper");

buster.testCase("bayeux server", {
    setUp: function (done) {
        this.httpServer = http.createServer();
        this.httpServer.listen(h.SERVER_PORT, done);

        this.fayeAdapter = new faye.NodeAdapter({mount: "/messaging"});
        this.fayeAdapter.attach(this.httpServer);
        this.fayeClient = this.fayeAdapter.getClient();

        var logger = {};
        this.bs = bayeuxServer.create(logger, "/messaging");
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "client is faye adapter client": function () {
        var expected = this.bs._fayeAdapter.getClient();
        assert.same(this.bs.getClient(), expected);
        assert.same(this.bs.getClient(), expected);
    },

    "attach attaches faye adapter": function () {
        var httpServer = {};
        this.stub(this.bs._fayeAdapter, "attach");

        this.bs.attach(httpServer);

        assert.calledOnce(this.bs._fayeAdapter.attach);
        assert.same(this.bs._fayeAdapter.attach.getCall(0).args[0], httpServer);
    },
});