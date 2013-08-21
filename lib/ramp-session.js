var uuid = require("node-uuid");
var mori = require("mori");

module.exports.createSession = function () {
    var id = uuid();
    var contextPath = "/sessions/" + id;
    return mori.hash_map(
        "id", id,
        "initializeUrl", contextPath + "/initialize",
        "pathRe", new RegExp("^\\/sessions\\/" + id + "(.*)$"));

};

module.exports.matchPathForSession = function (session, path) {
    var pathRe = mori.get(session, "pathRe");
    return path.match(pathRe);
};

module.exports.toPublicValue = function (session) {
    return {
        id: mori.get(session, "id"),
        initializeUrl: mori.get(session, "initializeUrl")
    }
};
