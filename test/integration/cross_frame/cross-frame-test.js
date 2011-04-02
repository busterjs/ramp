(function () {
    var cf = buster.create(buster.crossFrame);
    cf.targetFrameId = "target_frame";

    cf.document().getElementById("test_element").innerHTML = "Test passed.";
}());