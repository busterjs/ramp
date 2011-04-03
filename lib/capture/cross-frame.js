if (!this.buster) {
    var buster = {};
}

buster.crossFrame = {
    document: function () {
        return this.frame().contentDocument;
    },

    frame: function () {
        return window.parent.document.getElementById(this.targetFrameId);
    }
};