var uuid = require("node-uuid");
var mori = require("mori");
var ejs = require("ejs");
var fs = require("fs");
var rampResources = require("ramp-resources");

var PRISON_TEMPLATE = fs.readFileSync(__dirname + "/templates/slave_chains.html", "utf8");

var libraries = [
    require.resolve("./../vendor/json2.js"),
    require.resolve("bane"),
    require.resolve("faye/browser/faye-browser-min")
];

var BASE_RESOURCE_SET = rampResources.createResourceSet();
BASE_RESOURCE_SET.addResources(libraries.map(function (lib) {
    return {path: lib, content: fs.readFileSync(lib)}
}))
BASE_RESOURCE_SET.addResource({path: "/prison.js", combine: libraries});
BASE_RESOURCE_SET.loadPath.append("/prison.js");

function renderChains(opts) {
    var locals = {};
    locals.hasHeader = !!mori.get(opts, "header");
    if (locals.hasHeader) {
        locals.headerHeight = mori.get_in(opts, "header", "height");
        locals.headerPath = mori.get_in(opts, "header", "path") + "/";
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

module.exports.initializeSession = function (session, slave) {
};

module.exports.toPublicValue = function (slave) {
    return {
        id: mori.get(slave, "id"),
        chainsPath: mori.get(slave, "chainsPath"),
        userAgent: mori.get(slave, "userAgent")
    };
};
