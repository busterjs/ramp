var uuid = require("node-uuid");
var mori = require("mori");
var resourceSetHelper = require("./resource-set-helper");

var BASE_RESOURCE_SET = resourceSetHelper.createCombinedResourceSet(
    "/____ramp_internals-" + uuid() + ".js",
    require.resolve("./ramp-slave-chains-session-frame-initializer.js"));

module.exports.createSession = function (resourceSet, rampClientId) {
    var id = uuid();
    var contextPath = "/sessions/" + id;
    return mori.hash_map(
        "id", id,
        "rampClientId", rampClientId,
        "initializeUrl", contextPath + "/initialize",
        "pathRe", new RegExp("^\\/sessions\\/" + id + "(.*)$"),
        "resourcesPath", contextPath + "/resources",
        "resourceSet", BASE_RESOURCE_SET.concat(resourceSet),
        "sessionUrl", contextPath,
        "sessionClientToSlavesEventContextPath", contextPath + "/sc2s",
        "slaveToSessionClientEventContextPath", contextPath + "/s2sc",
        "privateEventContextPath", contextPath + "/private");

};

module.exports.matchPathForSession = function (session, path) {
    var pathRe = mori.get(session, "pathRe");
    return path.match(pathRe);
};

module.exports.toPublicValue = function (session) {
    return {
        id: mori.get(session, "id"),
        initializeUrl: mori.get(session, "initializeUrl"),
        resourcesPath: mori.get(session, "resourcesPath"),
        sessionClientToSlavesEventContextPath: mori.get(session, "sessionClientToSlavesEventContextPath"),
        slaveToSessionClientEventContextPath: mori.get(session, "slaveToSessionClientEventContextPath"),
        privateEventContextPath: mori.get(session, "privateEventContextPath"),
        sessionUrl: mori.get(session, "sessionUrl")
    }
};
