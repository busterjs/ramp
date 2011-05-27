if (!this.buster) {
    var buster = {};
}

if (typeof buster.server == "undefined") {
    buster.server = {};
}

buster.server.crossFrame = {
    document: function () {
        var frame = this.frame();
        return frame.contentDocument || frame.contentWindow.document;
    },

    window: function () {
        return this.frame().contentWindow;
    },

    frame: function () {
        return window.parent.document.getElementById(this.targetFrameId);
    },

    addOnLoadListener: function (cb) {
        var frame = this.frame();
        if (frame.addEventListener) {
            frame.addEventListener("load", cb, false);
        } else if (frame.attachEvent) {
            frame.attachEvent("onload", cb);
        }
    }
};