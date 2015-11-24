var buster = require("buster-node");
var assert = buster.referee.assert;

var ramp = require("./../lib/ramp");
var th = require("./test-helper.js");
var cp = require("child_process");

function pollForSession(port, pred) {
    var rc = ramp.createRampClient(port);
    var poll = function () {
        return rc.getCurrentSession().then(function (session) {
            var result = pred(session);
            if (result === undefined) {
                return poll();
            }
            return result
        });
    };
    return poll();
}

buster.testCase("Ramp client death", {
    setUp: function () {
        return th.setUpHelpers(this, [th.rs]);
    },

    tearDown: function () {
        return th.tearDownHelpers(this);
    },

    "should end session": function () {
        var self = this;

        var rcproc = cp.spawn("node", [__dirname + "/ramp-client-with-session-loader.js", this.rs.port]);
        rcproc.stdout.pipe(process.stdout);
        rcproc.stderr.pipe(process.stderr);

        var rc = this.rs.createRampClient();

        return pollForSession(self.rs.port, function (session) { if (session) return session })
            .then(function (session) {
                rcproc.kill("SIGKILL");
            })
            .then(function (session) {
                return pollForSession(self.rs.port, function (session) { if (!session) return null });
            })
            .then(function () {
                assert(true)
            });
    },

    "should end session when graceful": function () {
        var self = this;

        var rcproc = cp.spawn("node", [__dirname + "/ramp-client-with-session-loader.js", this.rs.port]);
        rcproc.stdout.pipe(process.stdout);
        rcproc.stderr.pipe(process.stderr);

        return pollForSession(self.rs.port, function (session) { if (session) return session })
            .then(function (session) {
                rcproc.kill("SIGINT");
            })
            .then(function (session) {
                return pollForSession(self.rs.port, function (session) { if (!session) return null });
            })
            .then(function () {
                assert(true)
            });
    }
});
