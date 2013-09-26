var uuid = require("node-uuid");
var mori = require("mori");
var ejs = require("ejs");
var fs = require("fs");
var resourceSetHelper = require("./resource-set-helper");

var rampSession = require("./ramp-session");
var PRISON_TEMPLATE = fs.readFileSync(__dirname + "/templates/slave_chains.html", "utf8");

var BASE_RESOURCE_SET = resourceSetHelper.createCombinedResourceSet(
    "prison.js",
    require.resolve("./amd-shim.js"),
    require.resolve("./../vendor/json2.js"),
    require.resolve("faye/browser/faye-browser-min"),
    require.resolve("when"),
    require.resolve("./faye-event-listening-utils.js"),
    require.resolve("./ramp-slave-chains-frameset.js"));

var BASE_HEADER_RESOURCE_SET = resourceSetHelper.createCombinedResourceSet(
    "/____ramp_header_internals-" + uuid() + ".js",
    require.resolve("./ramp-slave-chains-header-frame-initializer.js"));

function renderChains(opts) {
    var locals = {};
    locals.hasHeader = !!mori.get(opts, "header");
    if (locals.hasHeader) {
        locals.headerHeight = mori.get_in(opts, ["header", "height"]);
        locals.headerPath = mori.get_in(opts, ["header", "path"]);
    }


    return ejs.render(PRISON_TEMPLATE, {locals: locals});
};

module.exports.createSlave = function (opts) {
    var id = uuid();
    var contextPath = "/slaves/" + id;

    var chainsResourceSet = BASE_RESOURCE_SET.concat();
    chainsResourceSet.addResource({
        path: "/",
        content: mori.partial(renderChains, opts)
    });

    return mori.hash_map(
        "id", id,
        "chainsPath", contextPath + "/chains",
        "chainsResourceSet", chainsResourceSet,
        "userAgent", mori.get(opts, "userAgent"));
};

module.exports.initializeSession = function (fayeClient, session, slave) {
    fayeClient.publish(
        "/slaves/" + mori.get(slave, "id") + "/sessionLoad",
        rampSession.toPublicValue(session));
};

module.exports.endSession = function (fayeClient, slave) {
    fayeClient.publish(
        "/slaves/" + mori.get(slave, "id") + "/sessionUnload", {});
};

module.exports.toPublicValue = function (slave) {
    return {
        id: mori.get(slave, "id"),
        chainsPath: mori.get(slave, "chainsPath"),
        userAgent: mori.get(slave, "userAgent")
    };
};

module.exports.processResourceSet = function (resourceSet) {
    return BASE_HEADER_RESOURCE_SET.concat(resourceSet);
};
