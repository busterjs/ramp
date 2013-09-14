module.exports = {
    paths: [
        "lib/amd-shim.js",
        "lib/ramp-slave-chains-frameset.js",
        "lib/ramp-slave-chains-session-frame-initializer.js",
        "lib/faye-event-listening-utils.js"
    ],
    linterOptions: {
        browser: true,
        plusplus: true,
        maxlen: 999999,
        vars: true,
        regexp: true,
        predef: [
            "when",
            "module",
            "require"
        ]
    }
};
