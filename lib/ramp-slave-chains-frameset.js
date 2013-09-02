"use strict";
(function (GLOBAL) {
    var l = window.location;
    var hostAndPort = /^[a-z]+:\/\/([^\/]+)/.exec(l)[1].split(":");
    var host = hostAndPort[0];
    var port = parseInt(hostAndPort[1] || "80", 10);
    var server = "http://" + host + ":" + port;
    var slaveId = /^[a-z]+:\/\/[^\/]+\/slaves\/([^\/]+)/.exec(l)[1];

    function loadSession(sessionFrame, session, fayeClient) {
        sessionFrame.src = session.resourcesPath + "/";
        var eventContextPath = session.eventContextPath;

        GLOBAL.INJECT_BUSTER_INTO_SESSION_FRAME = function (SESSION_FRAME_GLOBAL) {
            SESSION_FRAME_GLOBAL.buster = SESSION_FRAME_GLOBAL.buster || {};
            SESSION_FRAME_GLOBAL.buster.emit = function (event, data) {
                var publication = GLOBAL.FAYE_EVENT_LISTENING_UTILS.emit(fayeClient, eventContextPath, event, {data: data, slaveId: slaveId});
                return GLOBAL.FAYE_EVENT_LISTENING_UTILS.fayeCallbackToPromise(publication);
            };

            SESSION_FRAME_GLOBAL.buster.on = function (event, handler) {
                var subscription = GLOBAL.FAYE_EVENT_LISTENING_UTILS.on(fayeClient, eventContextPath, event, handler);
                return GLOBAL.FAYE_EVENT_LISTENING_UTILS.fayeCallbackToPromise(subscription);
            };
        };
    };

    function unloadSession(sessionFrame, session) {
        sessionFrame.src = server + "/slave_idle";
    };


    GLOBAL.LOAD_SLAVE_CHAINS = function () {
        var sessionFrame = document.getElementById("session_frame");
        var fayeClient = new Faye.Client(server + "/messaging");

        when.all([
            GLOBAL.FAYE_EVENT_LISTENING_UTILS.fayeCallbackToPromise(
                fayeClient.subscribe("/slaves/" + slaveId + "/sessionLoad", function (session) {
                    loadSession(sessionFrame, session, fayeClient);
                })
            ),
            GLOBAL.FAYE_EVENT_LISTENING_UTILS.fayeCallbackToPromise(
                fayeClient.subscribe("/slaves/" + slaveId + "/sessionUnload", function () {
                    unloadSession(sessionFrame);
                })
            )
        ]).then(function () {
            fayeClient.publish("/slave_ready", {
                slaveId: slaveId,
                fayeClientId: fayeClient.getClientId()
            });
        });
    };
}(this))
