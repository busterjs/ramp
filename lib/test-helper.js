var when = require("when");
var when_pipeline = require("when/pipeline");
var when_parallel = require("when/parallel");
var faye = require("faye");
var mori = require("mori");
var convenientHttp = require("./convenient-http");
var fayeEventListeningUtils = require("./faye-event-listening-utils");

function captureSlave (port, userAgent) {
    var deferred = when.defer();

    userAgent = userAgent || "Ramp test helper";
    var mockBrowserFaye = new faye.Client("http://127.0.0.1:" + port + "/messaging");
    var http = mori.partial(convenientHttp, "127.0.0.1", port);

    when_pipeline([
        function () {
            return http("GET", "/capture", null, {headers: {"user-agent": userAgent}});
        },
        function (e) {
            return http("GET", e.res.headers.location);
        },
        function (e) {
            var chainsPath = e.res.req.path;
            var slaveId = /^\/slaves\/([^\/]+)/.exec(chainsPath)[1];
            return slaveId;
        },
        function (slaveId) {
            return when_parallel([
                function () {
                    return slaveId;
                },
                function () {
                    return setInterval(function () {
                        mockBrowserFaye.publish("/slave_heartbeat", {slaveId: slaveId});
                    });
                },
                function () {
                    return fayeEventListeningUtils.fayeCallbackToPromise(
                        mockBrowserFaye.publish("/slave_ready", {
                            slaveId: slaveId
                        })
                    );
                }
            ]);
        }
    ]).then(
        function (e) {
            var slaveId = e[0];
            var heartbeatIntervalId = e[1];
            http("GET", "/slaves").then(
                function (e) {
                    var slave = e.body.filter(function (s) { return s.id === slaveId })[0];
                    deferred.resolve({
                        slave: slave,
                        teardown: function () {
                            mockBrowserFaye.disconnect();
                            clearInterval(heartbeatIntervalId);
                        }
                    });
                },
                deferred.reject);
        },
        deferred.reject);

    return deferred.promise;
};


module.exports.captureSlave = captureSlave;
