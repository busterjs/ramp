var busterResources = require("buster-resources");

module.exports = {
    respond: function (req, res) {
        if (req.method == "GET" && req.url == "/resources") {
            this.logger.debug("Listing known resources");
            this.listKnownResources(res);
            return true;
        }

        if (req.method == "DELETE" && req.url == "/resources") {
            this.logger.debug("Performing resource garbage collection");
            this.gc(res);
            return true;
        }

        var resourceSets = this.busterResources.resourceSets;
        for (var i = 0, ii = resourceSets.length; i < ii; i++) {
            if (resourceSets[i].getResourceViaHttp(req, res)) return true;
        }
    },

    listKnownResources: function (res) {
        res.writeHead(200);
        res.write(JSON.stringify(this.busterResources.getCachedResources()));
        res.end();
    },

    gc: function (res) {
        this.busterResources.gc();
        res.writeHead(200);
        res.end();
    },

    get busterResources() {
        return this._busterResources || (this._busterResources = Object.create(busterResources));
    }
};