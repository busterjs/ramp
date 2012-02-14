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
                bayeuxClient.publish(buster.env.slave.becomesReadyPath, bayeuxClient.getClientId());
            }, bayeuxClient);

            bayeuxClient.subscribe("/" + buster.env.slave.id + "/session/start", function (e) {
                self.sessionStart(e);
            });

            bayeuxClient.subscribe("/" + buster.env.slave.id + "/session/end", function (e) {
                self.sessionEnd(e);
            });

            // Note: this code has no automated tests. There's no good way to
            // integration test this, and it's not a public API in faye.
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

        sessionStart: function (session) {
            var self = this;

            // Is called when the faye client has connected and
            // when onload has triggered on the session frame.
            var readyHandler = function () {
                if (++readyHandler.timesCalled == 2) {
                    var sessLoadedUrl = "/" + buster.env.slave.id + "/session/" + session.id + "/ready";
                    self.bayeuxClient.publish(sessLoadedUrl, {});
                }
            };
            readyHandler.timesCalled = 0;

            buster.slaveReady = function () {
                self.exposeBusterObject(session, readyHandler);
            };

            this.sessionFrame.setSrc(session.resourcesPath + "/", function () {
                self.sessionFrame.window().focus();
                readyHandler();
            });
        },

        sessionEnd: function (event) {
            var self = this;
            this.sessionFrame.setSrc(buster.env.slave.noSessionPath, function () {
                self.bayeuxClient.publish("/" + buster.env.slave.id + "/session/unloaded", {});
            });
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

            busterObj.env = busterObj.env || {};
            busterObj.env.contextPath = session.resourcesPath;
            busterObj.env.id = buster.env.slave.id;

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