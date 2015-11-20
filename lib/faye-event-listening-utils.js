(function (GLOBAL) {
    "use strict";
    var VALID_FAYE_CHARS = /^[a-z0-9\-\_\!\~\(\)\$\@]+$/i;
    var PromiseConstructor;

    function escapeEventName(n) {
        var characters = n.split("");
        var result = [];
        var i, ii, c;
        n = n.replace(/\-/g, "--");

        for (i = 0, ii = characters.length; i < ii; i++) {
            c = characters[i];
            if (VALID_FAYE_CHARS.test(c)) {
                result[i] = c;
            } else {
                result[i] = "-" + c.charCodeAt(0);
            }
        }

        return result.join("");
    }

    function on(fayeClient, eventContextPath, event, handler) {
        if (handler) {
            event = eventContextPath + "/" + escapeEventName(event);
        } else {
            handler = event;
            event = eventContextPath + "/*";
        }

        return fayeClient.subscribe(event, handler);
    }

    function emit(fayeClient, eventContextPath, event, data) {
        return fayeClient.publish(eventContextPath + "/" + escapeEventName(event), data);
    }

    function fayeCallbackToPromise(cb) {
        return new PromiseConstructor(function (resolve, reject) {
            cb.callback(resolve);
            cb.errback(reject);
        });
    }

    if (typeof module === "object" && typeof module.exports === "object") {
        module.exports.on = on;
        module.exports.emit = emit;
        module.exports.fayeCallbackToPromise = fayeCallbackToPromise;
        PromiseConstructor = require("when/lib/Promise");
    } else {
        GLOBAL.FAYE_EVENT_LISTENING_UTILS = {
            on: on,
            emit: emit,
            fayeCallbackToPromise: fayeCallbackToPromise
        };
        PromiseConstructor = Promise; // rely on a shim
    }

}(this));
