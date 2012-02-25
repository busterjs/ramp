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

            this.bayeuxClient = new Faye.Client(serverRoot + buster.env.bayeuxPath);

            var subs = this.bayeuxClient.subscribe("/" + buster.env.slave.id + "/session/start", function (e) {
                self.sessionStart(e);
            });
            // When any subscription is successful, we know the bayeux client
            // is up and running.
            subs.callback(function () {
                self.bayeuxClient.publish(buster.env.slave.becomesReadyPath, {});
            });

            this.bayeuxClient.subscribe("/" + buster.env.slave.id + "/session/end", function (e) {
                self.sessionEnd(e);
            });

            // Note: this code has no automated tests. There's no good way to
            // integration test this, and it's not a public API in faye.
            this.bayeuxClient.addExtension({
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

            buster.slaveReady = function () {
                self.exposeBusterObject(session);
            };

            this.sessionFrame.setSrc(session.resourcesPath + "/", function () {
                self.sessionFrame.window().focus();
                var sessLoadedUrl = "/" + buster.env.slave.id + "/session/" + session.id + "/ready";
                self.bayeuxClient.publish(sessLoadedUrl, {});
            });
        },

        sessionEnd: function (event) {
            var self = this;
            this.sessionFrame.setSrc(buster.env.slave.noSessionPath, function () {
                self.bayeuxClient.publish("/" + buster.env.slave.id + "/session/unloaded", {});
            });
        },

        exposeBusterObject: function (session) {
            var self = this;
            var busterObj = this.sessionFrame.window().buster;

            busterObj.subscribe = function (url, handler) {
                return self.bayeuxClient.subscribe(session.bayeuxContextPath + url, handler);
            };
            busterObj.publish = function (url, message) {
                return self.bayeuxClient.publish(session.bayeuxContextPath + url, message);
            };

            busterObj.env = busterObj.env || {};
            busterObj.env.contextPath = session.resourcesPath;
            busterObj.env.id = buster.env.slave.id;
        }
    };
}());