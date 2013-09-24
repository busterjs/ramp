(function (GLOBAL) {
    "use strict";

    var l = window.location;
    var hostAndPort = /^[a-z]+:\/\/([^\/]+)/.exec(l)[1].split(":");
    var host = hostAndPort[0];
    var port = parseInt(hostAndPort[1] || "80", 10);
    var server = "http://" + host + ":" + port;
    var slaveId = /^[a-z]+:\/\/[^\/]+\/slaves\/([^\/]+)/.exec(l)[1];

    function loadSession(sessionFrame, session, fayeClient) {
        sessionFrame.src = session.resourcesPath + "/";
        var sessionClientToSlavesEventContextPath = session.sessionClientToSlavesEventContextPath;
        var slaveToSessionClientEventContextPath = session.slaveToSessionClientEventContextPath;

        GLOBAL.INJECT_BUSTER_INTO_SESSION_FRAME = function (SESSION_FRAME_GLOBAL) {
            SESSION_FRAME_GLOBAL.buster = SESSION_FRAME_GLOBAL.buster || {};
            SESSION_FRAME_GLOBAL.buster.emit = function (event, data) {
                var publication = GLOBAL.FAYE_EVENT_LISTENING_UTILS.emit(fayeClient, slaveToSessionClientEventContextPath, event, {data: data, slaveId: slaveId, event: event});
                return GLOBAL.FAYE_EVENT_LISTENING_UTILS.fayeCallbackToPromise(publication);
            };

            SESSION_FRAME_GLOBAL.buster.on = function (event, handler) {
                var subscription = GLOBAL.FAYE_EVENT_LISTENING_UTILS.on(fayeClient, sessionClientToSlavesEventContextPath, event, handler);
                return GLOBAL.FAYE_EVENT_LISTENING_UTILS.fayeCallbackToPromise(subscription);
            };

            SESSION_FRAME_GLOBAL.buster.env = {
                contextPath: session.resourcesPath,
                id: slaveId
            };
        };
    }

    function loadIdleFrame(sessionFrame, session) {
        sessionFrame.src = server + "/slave_idle/";
    }

    function heartbeat(fayeClient, slaveId) {
        var publication = fayeClient.publish("/slave_heartbeat", {
            slaveId: slaveId
        });

        var onPubl = function () { setTimeout(function () { heartbeat(fayeClient, slaveId); }, 250); };

        publication.callback(onPubl);
        publication.errback(onPubl); // TODO: How to properly handle errback?
    }

    function isServerBackAfterRestart(message) {
        return message.channel === "/meta/connect"
            && message.successful === false
            && (/^401/.test(message.error));
    }

    function recapture() {
        window.location = server + "/capture";
    }

    var fayeClient = new GLOBAL.Faye.Client(server + "/messaging", {
        retry: 0.1,
        timeout: 2
    });
    fayeClient.disable("autodisconnect");
    fayeClient.addExtension({
        incoming: function (message, callback) {
            if (isServerBackAfterRestart(message)) {
                recapture();
                return;
            }

            callback(message);
        }
    });

    window.onbeforeunload = function () {
        fayeClient.publish("/slave_disconnect", {
            slaveId: slaveId
        });
    };


    GLOBAL.LOAD_SLAVE_CHAINS = function () {
        var sessionFrame = document.getElementById("session_frame");
        loadIdleFrame(sessionFrame);

        when.all([
            GLOBAL.FAYE_EVENT_LISTENING_UTILS.fayeCallbackToPromise(
                fayeClient.subscribe("/slaves/" + slaveId + "/sessionLoad", function (session) {
                    loadSession(sessionFrame, session, fayeClient);
                })
            ),
            GLOBAL.FAYE_EVENT_LISTENING_UTILS.fayeCallbackToPromise(
                fayeClient.subscribe("/slaves/" + slaveId + "/sessionUnload", function () {
                    loadIdleFrame(sessionFrame);
                })
            ),
            GLOBAL.FAYE_EVENT_LISTENING_UTILS.fayeCallbackToPromise(
                fayeClient.subscribe("/slaves/" + slaveId + "/recapture", function () {
                    recapture();
                })
            )
        ]).then(function () {
            var readyPubl = fayeClient.publish("/slave_ready", {
                slaveId: slaveId
            });

            readyPubl.callback(function () {
                heartbeat(fayeClient, slaveId);
            });
            // TODO: How do we handle errback?
        });
    };

     GLOBAL.INJECT_BUSTER_INTO_HEADER_FRAME = function (HEADER_FRAME_GLOBAL) {
         HEADER_FRAME_GLOBAL.buster = {};
         HEADER_FRAME_GLOBAL.buster.onConnectionStatusChange = function (handler) {
             fayeClient.bind("transport:down", function () {
                 handler(false);
             });
             fayeClient.bind("transport:up", function () {
                 handler(true);
             });
         };
     };
}(this));
