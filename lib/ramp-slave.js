var uuid = require("node-uuid");
var mori = require("mori");

module.exports.createSlave = function (userAgent) {
    var id = uuid();
    var contextPath = "/slaves/" + id;

    return mori.hash_map(
        "id", id,
        "chainsPath", contextPath + "/chains",
        "userAgent", userAgent,
        "pathRe", new RegExp("^\\/slaves/" + id + "(.*)$"));
};

module.exports.initializeSession = function (session, slave) {
};

module.exports.toPublicValue = function (slave) {
    return {
        id: mori.get(slave, "id"),
        chainsPath: mori.get(slave, "chainsPath"),
        userAgent: mori.get(slave, "userAgent")
    };
};

module.exports.matchPathForSlave = function (path, slave) {
    var pathRe = mori.get(slave, "pathRe");
    return path.match(pathRe);
};
