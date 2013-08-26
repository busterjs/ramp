"use strict";
(function (GLOBAL) {
    var l = window.location;
    var hostAndPort = /^[a-z]+:\/\/([^\/]+)/.exec(l)[1].split(":");
    var host = hostAndPort[0];
    var port = parseInt(hostAndPort[1] || "80", 10);
    var server = "http://" + host + ":" + port;
    var slaveId = /^[a-z]+:\/\/[^\/]+\/slaves\/([^\/]+)/.exec(l)[1];

    // TODO: Don't manually duplicate impl. from session-client.js
    var VALID_FAYE_CHARS = /^[a-z0-9\-\_\!\~\(\)\$\@]+$/i
    function escapeEventName(n) {
        n = n.replace(/\-/g, "--");

        var characters = n.split("");
        var result = [];
        for (var i = 0, ii = characters.length; i < ii; i++) {
            var c = characters[i];
            if (VALID_FAYE_CHARS.test(c)) {
                result[i] = c;
            } else {
                result[i] = "-" + c.charCodeAt(0);
            }
        }

        return result.join("");
    };

    function loadSession(sessionFrame, session, fayeClient) {
        sessionFrame.src = session.resourcesPath + "/";

        GLOBAL.INJECT_BUSTER_INTO_SESSION_FRAME = function (SESSION_FRAME_GLOBAL) {
            SESSION_FRAME_GLOBAL.buster = SESSION_FRAME_GLOBAL.buster || {};
            SESSION_FRAME_GLOBAL.buster.emit = function (event, data) {
                fayeClient.publish(
                    session.eventContextPath + "/" + escapeEventName(event),
                    {
                        data: data,
                        slaveId: slaveId
                    }
                )
            };
        };
    };

    function unloadSession(sessionFrame, session) {
        sessionFrame.src = "";
    };


    GLOBAL.LOAD_SLAVE_CHAINS = function () {
        var sessionFrame = document.getElementById("session_frame");
        var fayeClient = new Faye.Client(server + "/messaging");

        fayeClient.subscribe("/slaves/" + slaveId + "/sessionLoad", function (session) {
            loadSession(sessionFrame, session, fayeClient);
        });

        fayeClient.subscribe("/slaves/" + slaveId + "/sessionUnload", function (session) {
            unloadSession(sessionFrame, session);
        });
    };
}(this))
