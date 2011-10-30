if (typeof buster == "undefined") {
    var buster = {};
}

if (typeof buster.server == "undefined") {
    buster.server = {};
}

buster.server.controlFrame = {
    listen: function () {
        var self = this;
        this.bayeuxClient = this.createBayeuxClient();
        this.bayeuxClient.publish("/" + buster.env.clientId + "/ready", {});
    },

    createBayeuxClient: function () {
        var self = this;
        var bayeuxClient = new Faye.Client(buster.env.bayeuxUrl);

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

        busterObj.subscribe = function (url, handler) {
            self.bayeuxClient.subscribe(session.messagingContextPath + url, handler);
        };
        busterObj.publish = function (url, message) {
            self.bayeuxClient.publish(session.messagingContextPath + url, message);
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