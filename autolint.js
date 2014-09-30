module.exports = {
    paths: [
        "lib/**/*.js",
        "test/**/*.js"
    ],
    linterOptions: {
        browser: true,
        node: true,
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
