if (typeof buster == "undefined") {
    var buster = {};
}

if (typeof buster.server == "undefined") {
    buster.server = {};
}

(function () {
    var serverRoot = window.location.protocol + "//" + window.location.host;

    buster.server.controlFrame = {
        listen: function () {
            var self = this;
            this.sessionFrame = buster._captureCrossBrowserUtil.frame(document.getElementById("session_frame"));

            this.bayeuxClient = this.createBayeuxClient();

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

        createBayeuxClient: function () {
            var self = this;
            var bayeuxClient = new Faye.Client(serverRoot + buster.env.bayeuxPath);

            bayeuxClient.connect(function () {
                bayeuxClient.publish("/" + buster.env.slaveId + "/ready", bayeuxClient.getClientId());
            }, bayeuxClient);

            bayeuxClient.subscribe("/" + buster.env.slaveId + "/session/start", function (e) {
                self.sessionStart(e);
            });

            bayeuxClient.subscribe("/" + buster.env.slaveId + "/session/end", function (e) {
                self.sessionEnd(e);
            });

            return bayeuxClient;
        },

        sessionStart: function (session) {
            var self = this;

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

            this.sessionFrame.setSrc(session.resourceContextPath + "/");
            this.sessionFrame.addLoadListener(function () {
                self.sessionFrame.window().focus();
                readyHandler();
            });
        },

        sessionEnd: function (event) {
            this.sessionFrame.setSrc("");
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