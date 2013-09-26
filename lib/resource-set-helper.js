var fs = require("fs");
var rampResources = require("ramp-resources");

function createCombinedResourceSet() {
    var name = arguments[0];
    var scripts = Array.prototype.slice.call(arguments, 1);

    var resourceSet = rampResources.createResourceSet();
    scripts.forEach(function (script) {
        resourceSet.addResource({path: script, content: fs.readFileSync(script)})
    });
    resourceSet.addResource({path: name, combine: scripts});
    resourceSet.loadPath.append(name);
    return resourceSet;

};

module.exports.createCombinedResourceSet = createCombinedResourceSet;
