(function () {
    var serverRoot = window.location.protocol + "//" + window.location.host;

    buster._captureSesssionLoader = {
        create: function () {
            var instance = buster.create(this);
            instance.sessionFrame = buster._captureCrossBrowserUtil.frame(document.getElementById("session_frame"));
            return instance;
        },

        listen: function () {
            var self = this;

            var bayeuxClient = this.bayeuxClient = new Faye.Client(serverRoot + buster.env.bayeuxPath);

            bayeuxClient.connect(function () {
                self.resetSessionFrame(function () {
                    bayeuxClient.publish("/" + buster.env.slaveId + "/ready", bayeuxClient.getClientId());
                });
            }, bayeuxClient);

            bayeuxClient.subscribe("/" + buster.env.slaveId + "/session/start", function (session) {
                self.loadSession(session);
            });

            bayeuxClient.subscribe("/" + buster.env.slaveId + "/session/end", function () {
                self.unloadSession();
            });

            bayeuxClient.addExtension({
                incoming: function (message, callback) {
                    if (message.channel == "/meta/connect" && message.successful == false && (/^401/.test(message.error))) {
                        window.location = serverRoot + buster.env.capturePath;
                        return;
                    }
                    callback(message);
                }
            });
        },

        loadSession: function (session) {
            var self = this;
            this.currentSession = session;

            // Is called when the faye client has connected and
            // when onload has triggered on the session frame.
            var readyHandler = function () {
                if (++readyHandler.timesCalled == 2) {
                    var sessLoadedUrl = "/" + buster.env.slaveId + "/session/" + session.id + "/ready";
                    self.bayeuxClient.publish(sessLoadedUrl, {});
                }
            };
            readyHandler.timesCalled = 0;

            buster.slaveReady = function () {
                self.exposeBusterObject(session, readyHandler);
            };

            this.sessionFrame.load(session.resourceContextPath + "/", function () {
                self.sessionFrame.window().focus();
                readyHandler();
            });
        },

        unloadSession: function () {
            var self = this;
            this.resetSessionFrame(function () {
                var url = "/" + buster.env.slaveId + "/session/" + self.currentSession.id + "/unloaded";
                delete self.currentSession;
                self.bayeuxClient.publish(url);
            });
        },

        resetSessionFrame: function (cb) {
            this.sessionFrame.load(buster.env.sessionResetPath, cb);
        },

        exposeBusterObject: function (session, cb) {
            var self = this;
            var busterObj = this.sessionFrame.window().buster;
            var bayeuxClient = new Faye.Client(serverRoot + session.bayeuxClientPath);

            busterObj.subscribe = function (url, handler) {
                return bayeuxClient.subscribe(url, handler);
            };
            busterObj.publish = function (url, message) {
                return bayeuxClient.publish(url, message);
            };

            // Hack we use to get notified when the client is actually ready
            // This exists: bayeuxClient.connect(cb, bayeuxClient);
            // But does not work for some reason.
            var event = "/" + session.id + "/tmp-event";
            var tempHandler = function(){
                bayeuxClient.unsubscribe(event, tempHandler);
            };
            var subscription = bayeuxClient.subscribe(event, tempHandler);
            subscription.callback(cb);
        }
    };
}());