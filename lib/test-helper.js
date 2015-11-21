"use strict";

var when = require("when");
var faye = require("faye");
var mori = require("mori");
var convenientHttp = require("./convenient-http");
var fayeEventListeningUtils = require("./faye-event-listening-utils");

function getSlave(http, slaveId) {
    return http("GET", "/slaves").then(function (getSlavesResult) {
        var slave = getSlavesResult.body.filter(function (s) {
            return s.id === slaveId;
        })[0];

        if (!slave) {
            return getSlave(http, slaveId); // retry
        }

        return slave;
    });
}

function captureSlave(port, userAgent) {
    userAgent = userAgent || "Ramp test helper";
    var mockBrowserFaye = new faye.Client("http://127.0.0.1:" + port + "/messaging");
    var http = mori.partial(convenientHttp, "127.0.0.1", port);

    return http("GET", "/capture", null, {headers: {"user-agent": userAgent}})
        .then(function (e) {
            return http("GET", e.res.headers.location);
        })
        .then(function (e) {
            var chainsPath = e.res.req.path;

            var slaveId = /^\/slaves\/([^\/]+)/.exec(chainsPath)[1];

            var heartbeatIntervalId = setInterval(function () {
                mockBrowserFaye.publish("/slave_heartbeat", {slaveId: slaveId});
            });

            var slavePromise = fayeEventListeningUtils.fayeCallbackToPromise(
                mockBrowserFaye.publish("/slave_ready", {
                    slaveId: slaveId
                }))
                .then(function () {
                    return getSlave(http, slaveId);
                });

            return when.all([heartbeatIntervalId, slavePromise]);
        })
        .then(function (all) {
            var heartbeatIntervalId = all[0];
            var slave = all[1];

            return {
                slave: slave,
                teardown: function () {
                    mockBrowserFaye.disconnect();
                    clearInterval(heartbeatIntervalId);
                }
            }
        });
}


module.exports.captureSlave = captureSlave;
