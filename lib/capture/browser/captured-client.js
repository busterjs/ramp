if (typeof buster == "undefined") {
    var buster = {};
}

if (typeof buster.server == "undefined") {
    buster.server = {};
}

// TODO: Cover this code with tests.
buster.server.capturedClient = {
    targetFrameId: "client_frame",

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