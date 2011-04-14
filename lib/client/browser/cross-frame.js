if (!this.buster) {
    var buster = {};
}

if (typeof buster.server == "undefined") {
    buster.server = {};
}

buster.server.crossFrame = {
    document: function () {
        return this.frame().contentDocument;
    },

    window: function () {
        return this.frame().contentWindow;
    },

    frame: function () {
        return window.parent.document.getElementById(this.targetFrameId);
    }
};