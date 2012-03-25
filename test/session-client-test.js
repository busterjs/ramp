var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var bCaptureServer = require("../lib/buster-capture-server");
var bSession = require("../lib/session");
var http = require("http");
var faye = require("faye");
var when = require("when");
var h = require("./test-helper");

buster.testCase("session client", {
    setUp: function (done) {
        var self = this;

        this.httpServer = http.createServer();
        this.httpServer.listen(h.SERVER_PORT, function () {
            bSession.create({}).then(done(function (session) {
                self.session = session;
                self.sessionData = session.serialize();
            }));
        });

        this.fayeAdapter = new faye.NodeAdapter({mount: "/messaging"});
        this.fayeAdapter.attach(this.httpServer);
        this.fayeClient = this.fayeAdapter.getClient();
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "instance": {
        setUp: function (done) {
            var self = this;
            bCaptureServer.createSessionClient(
                "0.0.0.0",
                h.SERVER_PORT,
                {session: this.sessionData}
            ).then(done(function (sessionClient) {
                self.sc = sessionClient;
            }));
        },

        tearDown: function () {
            this.sc.disconnect();
        },

        "publishes messages scoped to messaging path": function (done) {
            this.fayeClient.subscribe(
                this.session.messagingPath + "/user/foo",
                done(function (e) {
                    assert.equals(e, "foo");
                })
            );
            this.sc.publish("/foo", "foo");
        },

        "subscribing to messages scoped to messaging path": function (done) {
            this.sc.subscribe("/foo", done(function (e) {
                assert.equals(e, "foo");
            }));

            this.sc.publish("/foo", "foo");
        },

        "ending the session": function (done) {
            this.fayeClient.subscribe(this.session.messagingPath + "/end", done(function () {
                assert(true);
            }));

            this.sc.end();
        }
    }
});