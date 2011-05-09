if (typeof buster == "undefined") {
    var buster = {};
}

if (typeof buster.server == "undefined") {
    buster.server = {};
}

buster.server.controlFrame = {
    listen: function () {
        var self = this;
        this.createMulticastClient();
        buster.nextTick(function () {
            self.multicastClient.connect(buster.env.multicastUrl);
        });
    },

    createMulticastClient: function () {
        var self = this;
        this.multicastClient = this.createMulticastClientInstance();

        this.multicastClient.on("session:start", function (e) {
            self.sessionStart(e);
        });

        this.multicastClient.on("session:end", function (e) {
            self.sessionEnd(e);
        });
    },

    createMulticastClientInstance: function () {
        return buster.multicastClient.create({
            httpClient: buster.ajax.json.poller.create()
        });
    },

    sessionStart: function (event) {
        var self = this;
        buster.clientReady = function () { self.exposeBusterObject(); };
        this.crossFrame().frame().src = event.data.resourceContextPath + "/";
        this.crossFrame().addOnLoadListener(function () {
            setTimeout(function () {
                self.crossFrame().window().focus();
            }, 1);
        });
    },

    sessionEnd: function (event) {
        this.crossFrame().frame().src = "";
    },

    exposeBusterObject: function () {
        this.crossFrame().window().buster.multicastClient = this.multicastClient;
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