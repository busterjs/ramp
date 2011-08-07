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
        var r = resourceSet.create(data, this);
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

        for (var path in resourceSet.resources) {
            var resource = resourceSet.resources[path];
            if ("etag" in resource) {
                this.removedEtagResources.push({path: path, etag: resource.etag});
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

        for (var i = 0, ii = this.removedEtagResources.length; i < ii; i++) {
            output.push(this.removedEtagResources[i]);
        }

        res.write(JSON.stringify(output));
        res.end();
    },

    getResourceForPathWithEtag: function (path, etag) {
        for (var i = 0, ii = this.resourceSets.length; i < ii; i++) {
            var resources = this.resourceSets[i].resources;
            for (var key in resources) {
                var resource = resources[key];
                if ("etag" in resource) {
                    if (resource.path == path && resource.etag == etag) {
                        return resource;
                    }
                }
            }
        }

        throw new Error("Resource with path '" + path + "' and etag '" + etag + "' not found.");
    },

    get resourceSets() {
        return this._resourceSets || (this._resourceSets = []);
    },

    get removedEtagResources() {
        return this._cachedRes || (this._cachedRes = []);
    },
};