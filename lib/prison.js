(function () {
    buster.captureServer = buster.captureServer || {};
    buster.captureServer.prison = {
        create: function () {
            var instance = buster.create(this);

            instance._emitQueue = [];
            instance._firstSessionClientSeen = false;

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
            var sessionFrame = document.getElementById("session_frame");

            this.serverClient.connect().then(function () {
                self.serverClient.on("slave:" + self.slaveId + ":session:load", function (session) {
                    self.sessionClient = buster.captureServer.sessionClient.create({
                        session: session,
                        fayeClient: self.serverClient._fayeClient
                    });

                    self.sessionClient.on("initialize", function () {
                        self._onSessionClientInitialized();
                    });

                    var frame = buster.captureServer.prisonUtil.frame(sessionFrame);
                    frame.setSrc(session.resourcesPath, function () {
                        self.serverClient.emit("slave:" + self.slaveId + ":session:loaded");
                    });
                });
                self.serverClient.on("slave:" + self.slaveId + ":session:unload", function () {
                    // self.serverClient.emit("slave:" + self.slaveId + ":session:unloaded");
                });

                self.serverClient.emit("slave:" + self.slaveId + ":imprisoned", {
                    pubsubClientId: self.serverClient.id
                });
            });
        },

        initSessionFrame: function (sessionBuster) {
            var self = this;

            this._sessionBuster = sessionBuster;
            sessionBuster.emit = function (event, data) {
                self._emitQueue.push([event, data]);
            };
            sessionBuster.on = function (event, handler) {
            };
        },

        _onSessionClientInitialized: function () {
            var self = this;
            if (this._firstSessionClientSeen) return;
            this._firstSessionClientSeen = true;

            this._sessionBuster.emit = function (event, data) {
                self.sessionClient.emit(event, data);
            };

            for (var i = 0, ii = this._emitQueue.length; i < ii; i++) {
                var queueItem = this._emitQueue[i];
                this._sessionBuster.emit(queueItem[0], queueItem[1]);
            }
            this._emitQueue = null;
        },
    };
}());