var buster = require("buster-node");
var assert = buster.assert;
var refute = buster.refute;

var ramp = require("./../lib/ramp");
var th = require("./test-helper.js");
var when = require("when");
var when_pipeline = require("when/pipeline");
var cp = require("child_process");

function pollForSession(port, pred) {
    var rc = ramp.createRampClient(port);
    var deferred = when.defer();
    var poll = function () {
        rc.getCurrentSession().then(function (session) {
            var result = pred(session);
            if (result === undefined) {
                poll();
            } else {
                deferred.resolve(result);
            }
        }, deferred.reject);
    };
    poll();
    return deferred.promise;
}

buster.testCase("Ramp client death", {
    setUp: function () {
        return th.setUpHelpers(this, [th.rs]);
    },

    tearDown: function () {
        return th.tearDownHelpers(this);
    },

    "should end session": function (done) {
        var self = this;

        var rcproc = cp.spawn("node", [__dirname + "/ramp-client-with-session-loader.js", this.rs.port]);
        rcproc.stdout.pipe(process.stdout);
        rcproc.stderr.pipe(process.stderr);

        var rc = this.rs.createRampClient();

        th.promiseSuccess(
            when_pipeline([
                function () {
                    return pollForSession(self.rs.port, function (session) { if (session) return session })
                },
                function (session) {
                    rcproc.kill("SIGKILL");
                },
                function (session) {
                    return pollForSession(self.rs.port, function (session) { if (!session) return null });
                },
                function () {
                    assert(true)
                }
            ]),
            done);
    },

    "should end session when graceful": function (done) {
        var self = this;

        var rcproc = cp.spawn("node", [__dirname + "/ramp-client-with-session-loader.js", this.rs.port]);
        rcproc.stdout.pipe(process.stdout);
        rcproc.stderr.pipe(process.stderr);

        th.promiseSuccess(
            when_pipeline([
                function () {
                    return pollForSession(self.rs.port, function (session) { if (session) return session })
                },
                function (session) {
                    rcproc.kill("SIGINT");
                },
                function (session) {
                    return pollForSession(self.rs.port, function (session) { if (!session) return null });
                },
                function () {
                    assert(true)
                }
            ]),
            done);
    }
})
