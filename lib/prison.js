(function (B) {
    B.captureServer = B.captureServer || {};

    function serverIsBackAfterRestart(message) {
        return message.channel === "/meta/connect"
            && message.successful === false
            && (/^401/.test(message.error))
    };

    function makeFayeReconnectRedirector(captureUrl) {
        return function (message, callback) {
            if (serverIsBackAfterRestart(message)) {
                window.location = captureUrl;
                return;
            }
            callback(message);
        }
    };

    function Prison() {
        // TODO: Provide these somehow, so the browser doesn't
        // have to guess them.
        var l = window.location;
        var hostAndPort = /^[a-z]+:\/\/([^\/]+)/.exec(l)[1].split(":");
        var host = hostAndPort[0];
        var port = parseInt(hostAndPort[1] || "80", 10);
        var server = "http://" + host + ":" + port;
        this.slaveId = /^[a-z]+:\/\/[^\/]+\/slaves\/([^\/]+)/.exec(l)[1];

        this._fayeClient = new Faye.Client(server + "/messaging", {
            retry: 0.5,
            timeout: 1
        });
        this._fayeClient.addExtension({
            incoming: makeFayeReconnectRedirector(server + "/capture")
        });

        this.serverClient = new B.captureServer.PubSubClient(this._fayeClient);

    }

    Prison.prototype = B.captureServer.prison = {
        create: function () {
            return new Prison();
        },

        listen: function () {
            var self = this;
            var frameEl = document.getElementById("session_frame");
            var sessionFrame = B.captureServer.prisonUtil.frame(frameEl);

            var loadEvent = "/slave/" + self.slaveId + "/sessionLoad";
            var loadedEvent = "/slave/" + self.slaveId + "/sessionLoaded";
            var unloadEvent = "/slave/" + self.slaveId + "/sessionUnload";
            var unloadedEvent = "/slave/" + self.slaveId + "/sessionUnloaded";

            this.serverClient.registerWithServer().then(function () {
                self.serverClient.subscribe(loadEvent, function (session) {
                    self.currentSession = session;
                    self.sessionClient = new B.captureServer.SessionClient(
                        session,
                        self._fayeClient
                    );
                    self.sessionClient.clientId = self.slaveId;

                    var path = session.resourcesPath + "/";
                    sessionFrame.setSrc(path, function () {
                        self.serverClient.publish(loadedEvent);
                    });
                });

                self.serverClient.subscribe(unloadEvent, function () {
                    sessionFrame.setSrc("", function () {
                        self.serverClient.publish(unloadedEvent);
                    });
                });

                var event = "/slave/" + self.slaveId + "/imprisoned";
                self.serverClient.publish(event, {
                    pubsubClientId: self.serverClient.id,
                    userAgent: navigator.userAgent
                });
            });
        },

        initSessionFrame: function (sessionBuster) {
            var self = this;

            sessionBuster.emit = function (event, data) {
                self.sessionClient.emit(event, data);
            };
            sessionBuster.on = function (event, handler) {
                self.sessionClient.on(event, handler);
            };

            sessionBuster.env = sessionBuster.env || {};
            sessionBuster.env.contextPath = this.currentSession.resourcesPath;
            sessionBuster.env.id = this.slaveId;
        }
    };
}(buster));
