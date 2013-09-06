var rampResources = require("ramp-resources");

function createLogger(verbosity) {
    var level = verbosity ? verbosity.slice(1).length : 0;
    var logger = {};

    var levels = ["debug", "info", "log", "warn", "error"]
    var minLevel = (2 - level);
    for (var i = 0, ii = levels.length; i < ii; i++) {
        var level = levels[i];
        if (i < minLevel) {
            logger[level] = function(){};
        } else {
            logger[level] = console.log
        }
    }

    return logger;
};

function createHeaderResourceSet() {
    var rs = rampResources.createResourceSet();
    rs.addResource({
        path: "/",
        content: "<p>This is the slave header.</p><style>body { background-color: #336699; color: #fff; text-align: center; }</style>"
    });

    return rs;
};

module.exports.createLogger = createLogger;
module.exports.createHeaderResourceSet = createHeaderResourceSet;
