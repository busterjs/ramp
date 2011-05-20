var buster = require("buster");
var resourceSet = require("./../lib/resources/resource-set");

// For legacy reasons, most of the resource-set tests are encapsulated in session
// and capture tests.
buster.testCase("resource-set", {
    "test creating with blank object": function () {
        var r = resourceSet.create({});
        buster.assert(r.load instanceof Array);
        buster.assert.equals(r.load.length, 0);
    }
});