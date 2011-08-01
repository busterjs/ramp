var mime = require("mime");
var busterPromise = require("buster-promise");
var minifyProcessor = require("./processors/minifier");

module.exports = {
    create: function (path, resource) {
        var instance = Object.create(this);
        instance.path = path;
        instance.content = resource.content;
        instance.headers = resource.headers || {};
        instance.combine = resource.combine;
        instance.backend = resource.backend;
        if ("etag" in resource) {
            instance.etag = resource.etag;
        }

        instance.processors = [];

        if (resource.minify) {
            instance.processors.push(Object.create(minifyProcessor));
        }

        return instance;
    },

    getHeaders: function () {
        var headers = {};

        for (var header in this.headers) {
            headers[header] = this.headers[header];
        }

        if (!headers["Content-Type"]) {
            headers["Content-Type"] = mime.lookup(this.path);
        }

        return headers;
    },

    getContent: function () {
        var self = this;
        var promise = busterPromise.create();

        if (typeof(this.content) == "function") {
            var cPromise = busterPromise.create();
            this.content(cPromise);
            cPromise.then(function (content) {
                promise.resolve(self.applyFilters(content));
            }, function (err) {
                promise.reject(err);
            });
        } else {
            promise.resolve(this.applyFilters(this.content));
        }

        return promise;
    },

    applyFilters: function (content) {
        for (var i = 0, ii = this.processors.length; i < ii; i++) {
            content = this.processors[i].process(content);
        }

        return content;
    },

    addProcessor: function (processor) {
        this.processors.push(processor);
    }
};