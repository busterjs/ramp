(function () {
    buster._captureCrossBrowserUtil.addEventListener(window, "load", function () {
        var sessionLoader = buster._captureSesssionLoader.create();
        sessionLoader.listen();
    });
}());
