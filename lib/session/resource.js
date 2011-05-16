var mime = require("node-mime");

module.exports = {
    create: function (path, resource) {
        var instance = Object.create(this);
        instance.path = path;
        instance.content = resource.content;
        instance.headers = resource.headers;
        instance.minify = resource.minify
        instance.combine = resource.combine;
        instance.backend = resource.backend;

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