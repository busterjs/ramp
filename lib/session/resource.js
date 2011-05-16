var mime = require("node-mime");

module.exports = {
    create: function (path, resource) {
        var instance = Object.create(this);
        instance.path = path;

        for (var key in resource) {
            if (!resource.hasOwnProperty(key)) continue;
            instance[key] = resource[key];
        }

        return instance;
    },

    getHeaders: function () {
        var headers = {};

        if ("headers" in this) {
            for (var header in this.headers) {
                headers[header] = this.headers[header];
            }
        }

        if (!headers["Content-Type"]) {
            headers["Content-Type"] = mime.lookup(this.path);
        }

        return headers;
    }
};