var busterResources = require("buster-resources");

module.exports = {
    create: function () {
        var instance = Object.create(this);
        return instance;
    },

    respond: function (req, res) {
        if (req.method == "GET" && req.url == "/resources") {
            this.listKnownResources(res);
            return true;
        }

        if (req.method == "DELETE" && req.url == "/resources") {
            this.gc(res);
            return true;
        }

        if (this.busterResources.getResourceViaHttp(req, res)) return true;
    },

    listKnownResources: function (res) {
        this.logger.debug("Listing known resources");
        res.writeHead(200);
        res.write(JSON.stringify(this.busterResources.getCachedResources()));
        res.end();
    },

    gc: function (res) {
        this.logger.debug("Performing resource garbage collection");
        this.busterResources.gc();
        res.writeHead(200);
        res.end();
    },

    get busterResources() {
        return this._busterResources || (this._busterResources = Object.create(busterResources));
    }
};