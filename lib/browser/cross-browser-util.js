(function () {
    buster._captureCrossBrowserUtil = {
        addEventListener: function (element, event, handler) {
            if (element.addEventListener) {
                element.addEventListener(event, handler, false);
            } else if (element.attachEvent) {
                element.attachEvent("on" + event, handler);
            }
        },

        removeEventListener: function (element, event, handler) {
            if (element.removeEventListener) {
                element.removeEventListener(event, handler, false);
            } else if (element.detachEvent) {
                element.detachEvent("on" + event, handler);
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
                },

                load: function (url, handler) {
                    element.src = url;

                    var wrappedHandler = function () {
                        setTimeout(handler, 1);
                        buster._captureCrossBrowserUtil.removeEventListener(element, "load", wrappedHandler);
                    };
                    buster._captureCrossBrowserUtil.addEventListener(element, "load", wrappedHandler);
                }
            }
        }
    };
}());