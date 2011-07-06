var buster = require("buster");
var assert = buster.assert;
var resourceSet = require("./../lib/resources/resource-set");

// For legacy reasons, most of the resource-set tests are encapsulated in session
// and capture tests.
buster.testCase("resource-set", {
    "test creating with blank object": function () {
        var r = resourceSet.create({});
        assert(r.load instanceof Array);
        assert.equals(r.load.length, 0);

        assert.equals("/res", r.resourceContextPath());
        assert.equals("/_", r.internalsContextPath());
    },

    "test setting context path after creation": function () {
        var r = resourceSet.create({});
        r.contextPath = "/foo";

        assert.equals("/foo/res", r.resourceContextPath());
        assert.equals("/foo/_", r.internalsContextPath());
    }
});