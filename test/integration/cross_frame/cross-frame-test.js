(function () {
    var cf = buster.create(buster.server.crossFrame);
    cf.targetFrameId = "target_frame";
    cf.document().getElementById("test_element").innerHTML = "Test passed, yay for " + cf.window().location + ".";


    var cf = buster.create(buster.server.crossFrame);
    cf.targetFrameId = "other_frame";
    cf.addOnLoadListener(function () {
        cf.document().getElementById("target").innerHTML = "Yay, load event worked";
    });
    cf.frame().src = "_event.html";
}());