(function () {
    buster.server.controlFrame.addEventListener(window, "load", function () {
        var controlFrame = buster.create(buster.server.controlFrame);
        controlFrame.listen();
    });
}());
