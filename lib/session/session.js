var resourceSet = require("./../resources/resource-set");

module.exports = {
    create: function (id, data, resourceMiddleware, multicast) {
        var session = Object.create(this);
        session.id = id;
        session.rootPath = "/sessions/" + session.id;
        session.multicast = multicast;
        session.createResourceSet(data, resourceMiddleware);

        return session;
    },

    validate: function (data) {
        return resourceSet.validate(data);
    },

    toJSON: function () {
        return {
            rootPath: this.rootPath,
            resourceContextPath: this.resourceSet.contextPath
        }
    },

    createResourceSet: function (data, resourceMiddleware) {
        // TODO: should be in a separate namespace, so stuff doesn't
        // break in the unlikely event of a session containing resources
        // with names that conflict with these internal resources.
        var internalResources = [
            require.resolve("buster-core"),
            require.resolve("./../browser/cross-frame"),
            require.resolve("./../browser/client-frame-load")
        ];

        // Prepend internalResources, they should load first.
        data.load = data.load || [];
        data.load = internalResources.concat(data.load);

        data.contextPath = this.rootPath + "/resources";
        this.resourceSet = resourceMiddleware.createResourceSet(data);

        for (var i = 0, ii = internalResources.length; i < ii; i++) {
            this.resourceSet.addFile(internalResources[i]);
        }
    }
};