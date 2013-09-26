var fs = require("fs");
var rampResources = require("ramp-resources");
var bufferUtils = require("./buffer-utils");

var NEWLINE = new Buffer([0x0a]);

/**
 * Like join, but creates array with items injected intead of string.
 *
 *   ["a", "b", "c"].join(",") => "a,b,c"
 *   joinAry["a", "b", "c"], ",") => ["a", ",", "b", ",", "c"];
 */
function joinAry(ary, x) {
    var result = [];

    if (ary.length === 0) return result;

    ary.slice(0, ary.length - 1).forEach(function (item) {
        result.push(item);
        result.push(x);
    });
    result.push(ary[ary.length - 1]);
    return result;
};

function createCombinedResourceSet() {
    var name = arguments[0];
    var scripts = Array.prototype.slice.call(arguments, 1);

    var resourceSet = rampResources.createResourceSet();
    resourceSet.add({
        path: name,
        content: bufferUtils.concatBuffers(joinAry(scripts.map(function (script) {
            return fs.readFileSync(script);
        }), NEWLINE))
    });
    resourceSet.loadPath.append(name);
    return resourceSet;

};

module.exports.createCombinedResourceSet = createCombinedResourceSet;
