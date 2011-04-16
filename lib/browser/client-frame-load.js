(function () {
    var crossFrame = buster.create(buster.server.crossFrame);
    crossFrame.targetFrameId = "control_frame";
    crossFrame.window().buster.clientReady();
}());