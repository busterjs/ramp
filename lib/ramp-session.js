var uuid = require("node-uuid");
var mori = require("mori");
var fs = require("fs");
var rampResources = require("ramp-resources");

var BASE_SCRIPTS = [
    require.resolve("./ramp-slave-chains-session-frame-initializer.js")
];
var BASE_SCRIPT_NAME = "/____ramp_internals-" + uuid() + ".js";
var BASE_RESOURCE_SET = rampResources.createResourceSet();
BASE_RESOURCE_SET.addResources(BASE_SCRIPTS.map(function (lib) {
    return {path: lib, content: fs.readFileSync(lib)}
}))
BASE_RESOURCE_SET.addResource({path: BASE_SCRIPT_NAME, combine: BASE_SCRIPTS});
BASE_RESOURCE_SET.loadPath.append(BASE_SCRIPT_NAME);

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
        "eventContextPath", contextPath + "/slaves",
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
        eventContextPath: mori.get(session, "eventContextPath"),
        privateEventContextPath: mori.get(session, "privateEventContextPath"),
        sessionUrl: mori.get(session, "sessionUrl")
    }
};
