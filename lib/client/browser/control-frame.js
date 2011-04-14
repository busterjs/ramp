if (typeof buster == "undefined") {
    var buster = {};
}

if (typeof buster.server == "undefined") {
    buster.server = {};
}

// TODO: Cover this code with tests.
buster.server.controlFrame = {
    targetFrameId: "client_frame",

    listen: function () {
        var self = this;
        this.createMulticastClient();
        buster.nextTick(function () {
            self.multicastClient.listen({
                clientId: buster.env.multicastClientId,
                url: buster.env.multicastUrl
            })
        });
    },

    createMulticastClient: function () {
        var self = this;
        this.multicastClient = buster.multicastClient.create({
            httpClient: buster.ajax.json.poller.create()
        });

        this.multicastClient.on("session:start", function (e) {
            self.sessionStart(e);
        });

        this.multicastClient.on("session:end", function (e) {
            console.log("foo");
            self.sessionEnd(e);
        });

    },

    exposeBusterObject: function () {
        this.crossFrame().window().buster = {
            multicastClient: this.multicastClient
        };
    },

    sessionStart: function (event) {
        this.crossFrame().frame().src = event.data.resourceContextPath + "/";
    },

    sessionEnd: function () {
        this.crossFrame().frame().src = "";
    },

    crossFrame: function () {
        if (this.crossFrameInstance) return this.crossFrameInstance;

        this.crossFrameInstance = buster.create(buster.server.crossFrame);
        this.crossFrameInstance.targetFrameId = this.targetFrameId;
        return this.crossFrameInstance;
    }
};