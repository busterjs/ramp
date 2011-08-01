var resourceSet = require("./resource-set");

module.exports = {
    respond: function (req, res) {
        if (req.method == "GET" && req.url == "/resources") {
            this.listKnownResources(res);
            return true;
        }

        for (var i = 0, ii = this.resourceSets.length; i < ii; i++) {
            if (this.resourceSets[i].respond(req, res)) return true;
        }
    },

    createResourceSet: function (data) {
        var r = resourceSet.create(data);
        this.resourceSets.push(r);
        return r;
    },

    removeResourceSet: function (resourceSet) {
        for (var i = 0, ii = this.resourceSets.length; i < ii; i++) {
            if (this.resourceSets[i] == resourceSet) {
                this.resourceSets.splice(i, 1);
                break;
            }
        }
    },

    listKnownResources: function (res) {
        res.writeHead(200);
        var output = [];
        for (var i = 0, ii = this.resourceSets.length; i < ii; i++) {
            var resources = this.resourceSets[i].resources;
            for (var key in resources) {
                var resource = resources[key];
                if ("etag" in resource) {
                    output.push({
                        path: resource.path,
                        etag: resource.etag
                    });
                }
            }
        }
        res.write(JSON.stringify(output));
        res.end();
    },

    get resourceSets() {
        return this._resourceSets || (this._resourceSets = []);
    }
};