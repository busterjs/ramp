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
            this.bayeuxClient = this.createBayeuxClient();

            // Note: this code has no automated tests. There's no good way to
            // integration test this, and it's not a public API in faye.
            this.bayeuxClient.addExtension({
                incoming: function (message, callback) {
                    if (message.channel == "/meta/connect" && message.successful == false && (/^401/.test(message.error))) {
                        window.parent.location = serverRoot + buster.env.capturePath;
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
                bayeuxClient.publish("/" + buster.env.clientId + "/ready", bayeuxClient.getClientId());
            }, bayeuxClient);

            bayeuxClient.subscribe("/" + buster.env.clientId + "/session/start", function (e) {
                self.sessionStart(e);
            });

            bayeuxClient.subscribe("/" + buster.env.clientId + "/session/end", function (e) {
                self.sessionEnd(e);
            });

            return bayeuxClient;
        },

        sessionStart: function (session) {
            var self = this;
            buster.clientReady = function () { self.exposeBusterObject(session); };
            this.crossFrame().frame().src = session.resourceContextPath + "/";
            this.crossFrame().addOnLoadListener(function () {
                setTimeout(function () {
                    self.crossFrame().window().focus();
                }, 1);
            });
        },

        sessionEnd: function (event) {
            this.crossFrame().frame().src = "";
        },

        exposeBusterObject: function (session) {
            var self = this;
            var busterObj = this.crossFrame().window().buster;
            var bayeuxClient = new Faye.Client(serverRoot + session.bayeuxClientPath);

            busterObj.subscribe = function (url, handler) {
                return bayeuxClient.subscribe(url, handler);
            };
            busterObj.publish = function (url, message) {
                return bayeuxClient.publish(url, message);
            };
        },

        crossFrame: function () {
            var self = this;
            return this.crossFrameInstance || (function () {
                var instance = self.createCrossFrameInstance();
                instance.targetFrameId = "client_frame";
                return self.crossFrameInstance = instance;
            }());
        },

        createCrossFrameInstance: function () {
            return buster.create(buster.server.crossFrame);
        }
    };
}());