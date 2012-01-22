(function () {
    buster._captureCrossBrowserUtil.addEventListener(window, "load", function () {
        var sessionLoader = buster.create(buster._captureSesssionLoader);
        sessionLoader.listen();
    });
}());
