if (typeof buster == "undefined") {
    var buster = {};
}

if (typeof buster.server == "undefined") {
    buster.server = {};
}

// TODO: Cover this code with tests.
buster.server.capturedClient = {
    targetFrameId: "client_frame",

    listen: function () {
        this.createMessagingClient();
        buster.nextTick(buster.bind(this.messagingClient, "listen"));
    },

    createMessagingClient: function () {
        var self = this;
        this.messagingClient = buster.multicastClient.create(null, {
            httpClient: buster.ajax.json.poller.create()
        });
        this.messagingClient.id = busterSessionEnv.messagingClientId;
        this.messagingClient.url = busterSessionEnv.messagingUrl;

        this.messagingClient.on("session:start", function (e) {
            self.sessionStart(e);
        });

        this.messagingClient.on("session:end", function (e) {
            console.log("foo");
            self.sessionEnd(e);
        });
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