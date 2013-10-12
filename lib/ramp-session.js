var uuid = require("node-uuid");
var mori = require("mori");
var resourceSetHelper = require("./resource-set-helper");

var BASE_RESOURCE_SET = resourceSetHelper.createCombinedResourceSet(
    "/____ramp_internals-" + uuid() + ".js",
    require.resolve("./ramp-slave-chains-session-frame-initializer.js"));

var STATIC_RESOURCES_PATH = "/session_static_resources_path";

function getResourcesPath(contextPath, options) {
    if (options.staticResourcesPath) {
        return STATIC_RESOURCES_PATH;
    } else {
        return contextPath + "/resources";
    }
}

function getPathRe(options, id) {
    if (options.staticResourcesPath) {
        return new RegExp("^\\" + STATIC_RESOURCES_PATH + "(.*)$");
    } else {
        return new RegExp("^\\/sessions\\/" + id + "(.*)$")
    }
}

function getInitializeUrl(contextPath, options) {
    if (options.staticResourcesPath) {
        return STATIC_RESOURCES_PATH + "/initialize";
    } else {
        return contextPath + "/initialize";
    }
}

function getSessionUrl(contextPath, options) {
    if (options.staticResourcesPath) {
        return STATIC_RESOURCES_PATH;
    } else {
        return contextPath;
    };
}

module.exports.createSession = function (resourceSet, rampClientId, options) {
    var id = uuid();
    var contextPath = "/sessions/" + id;
    return mori.hash_map(
        "id", id,
        "rampClientId", rampClientId,
        "initializeUrl", getInitializeUrl(contextPath, options),
        "pathRe", getPathRe(options, id),
        "resourcesPath", getResourcesPath(contextPath, options),
        "resourceSet", BASE_RESOURCE_SET.concat(resourceSet),
        "sessionUrl", getSessionUrl(contextPath, options),
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
