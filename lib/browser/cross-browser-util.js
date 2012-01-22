(function () {
    buster._captureCrossBrowserUtil = {
        addEventListener: function (element, event, handler) {
            if (element.addEventListener) {
                element.addEventListener(event, handler, false);
            } else if (element.attachEvent) {
                element.attachEvent("on" + event, handler);
            }
        },

        frame: function (element) {
            return {
                window: function () {
                    return element.contentWindow;
                },

                setSrc: function (src) {
                    element.src = src;
                },

                addLoadListener: function (listener) {
                    buster._captureCrossBrowserUtil.addEventListener(element, "load", function () {
                        setTimeout(listener, 1);
                    });
                }
            }
        }
    };
}());