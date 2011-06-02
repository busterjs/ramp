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

    // Temporary returning an empty array. In the future, it should list
    // all known resources from all sessions, for the purpose of caching.
    // See section A552C in August Lilleaas' brain for more information.
    listKnownResources: function (res) {
        res.writeHead(200);
        res.write("[]");
        res.end();
    },

    get resourceSets() {
        return this._resourceSets || (this._resourceSets = []);
    }
};