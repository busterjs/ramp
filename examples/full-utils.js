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
        content: "<p>This is the slave header.</p>"
    });
    rs.addResource({
        path: "/status.js",
        content: "buster.onConnectionStatusChange(function (status) { document.body.className = status ? 'connected' : 'disconnected' })"
    });
    rs.loadPath.append("/status.js");
    rs.addResource({
        path: "/status.css",
        content: "body { background-color: #336699; color: #fff; text-align: center; } body.disconnected { background-color: red; }"
    });
    rs.loadPath.append("/status.css");

    return rs;
};

module.exports.createLogger = createLogger;
module.exports.createHeaderResourceSet = createHeaderResourceSet;
