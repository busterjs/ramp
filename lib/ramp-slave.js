var uuid = require("node-uuid");
var mori = require("mori");

module.exports.createSlave = function (userAgent) {
    var id = uuid();
    return mori.hash_map(
        "id", id,
        "chainsPath", "/slave/" + id + "/chains",
        "userAgent", userAgent);
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
