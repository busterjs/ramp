var faye = require("faye");
var resourceSet = require("buster-resources/lib/resource-set");

module.exports = {
    create: function (id, data, resourceMiddleware, server) {
        var session = Object.create(this);
        session.id = id;
        session.rootPath = "/sessions/" + session.id;
        var bayeuxClientPath = session.rootPath + "/messaging";
        session.bayeuxClientUrl = server.address + bayeuxClientPath;

        var bayeux = new faye.NodeAdapter({mount: bayeuxClientPath, timeout: 1})
        bayeux.attach(server.httpServer);

        createResourceSet.call(session, data, resourceMiddleware);

        return session;
    },

    validate: function (data) {
        return resourceSet.validate(data);
    },

    toJSON: function () {
        return {
            id: this.id,
            rootPath: this.rootPath,
            resourceContextPath: this.resourceSet.contextPath,
            bayeuxClientUrl: this.bayeuxClientUrl
        }
    }
};

function createResourceSet(data, resourceMiddleware) {
    data.contextPath = this.rootPath + "/resources";
    this.resourceSet = resourceMiddleware.busterResources.createResourceSet(data);

    // TODO: should be in a separate namespace, so stuff doesn't
    // break in the unlikely event of a session containing resources
    // with names that conflict with these internal resources.
    var internalResources = [
        require.resolve("buster-core"),
        require.resolve("./../browser/cross-frame"),
        require.resolve("./../browser/client-frame-load")
    ];

    for (var i = 0, ii = internalResources.length; i < ii; i++) {
        this.resourceSet.addFile(internalResources[i]);
    }

    // Prepend internalResources, they should load first.
    this.resourceSet.prependToLoad(internalResources);
}