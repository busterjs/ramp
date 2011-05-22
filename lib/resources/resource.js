var mime = require("node-mime");
var minifyProcessor = require("./processors/minifier");

module.exports = {
    create: function (path, resource) {
        var instance = Object.create(this);
        instance.path = path;
        instance.content = resource.content;
        instance.headers = resource.headers;
        instance.combine = resource.combine;
        instance.backend = resource.backend;

        instance.processors = [];

        if (resource.minify) {
            instance.processors.push(Object.create(minifyProcessor));
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
            if (this.path == "/") {
                headers["Content-Type"] = "text/html";
            } else {
                headers["Content-Type"] = mime.lookup(this.path);
            }
        }

        return headers;
    },

    getContent: function () {
        var content = this.content;

        for (var i = 0, ii = this.processors.length; i < ii; i++) {
            content = this.processors[i].process(content);
        }

        return content;
    },

    addProcessor: function (processor) {
        this.processors.push(processor);
    }
};