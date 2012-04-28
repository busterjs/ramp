(function () {
    buster.captureServer = buster.captureServer || {};
    buster.captureServer.prison = {
        create: function () {
            var instance = buster.create(this);

            // TODO: Provide these somehow, so the browser doesn't
            // have to guess them.
            var hostAndPort = /^[a-z]+:\/\/([^\/]+)/.exec(window.location)[1].split(":");
            var host = hostAndPort[0];
            var port = parseInt(hostAndPort[1] || "80", 10);
            instance.slaveId = /^[a-z]+:\/\/[^\/]+\/slaves\/([^\/]+)/.exec(window.location)[1];

            instance.serverClient = buster.captureServer.pubsubClient.create({
                host: host,
                port: port
            });

            return instance;
        },

        listen: function () {
            var self = this;
            var frameEl = document.getElementById("session_frame");
            var sessionFrame = buster.captureServer.prisonUtil.frame(frameEl);

            this.serverClient.connect().then(function () {
                self.serverClient.on("slave:" + self.slaveId + ":session:load", function (session) {
                    self.sessionClient = buster.captureServer.sessionClient.create({
                        session: session,
                        fayeClient: self.serverClient._fayeClient
                    });

                    sessionFrame.setSrc(session.resourcesPath, function () {
                        self.serverClient.emit("slave:" + self.slaveId + ":session:loaded");
                    });
                });

                self.serverClient.on("slave:" + self.slaveId + ":session:unload", function () {
                    sessionFrame.setSrc("", function () {
                        self.serverClient.emit("slave:" + self.slaveId + ":session:unloaded");
                    });
                });

                self.serverClient.emit("slave:" + self.slaveId + ":imprisoned", {
                    pubsubClientId: self.serverClient.id
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
        }
    };
}());