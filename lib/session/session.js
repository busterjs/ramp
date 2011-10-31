var faye = require("faye");
var uuid = require("node-uuid");
var resourceSet = require("buster-resources/lib/resource-set");

module.exports = {
    create: function (data, resourceMiddleware, server) {
        var session = Object.create(this);
        session.id = uuid();
        session.rootPath = "/sessions/" + session.id;
        // They're the same, but they might not be in the future so we provide
        // a separate API.
        session.messageContextPath = session.rootPath;
        session._server = server;
        session._resourceMiddleware = resourceMiddleware;

        createResourceSet.call(session, data);

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
            messagingContextPath: this.messageContextPath
        }
    },

    publish: function (url, message) {
        return this._server.bayeux.publish(this.messageContextPath + url, message);
    },

    subscribe: function (url, handler) {
        return this._server.bayeux.subscribe(this.messageContextPath + url, handler);
    },

    destroy: function () {
        this._resourceMiddleware.busterResources.removeResourceSet(this.resourceSet);
        // TODO: investigate if this actually unsubscribes
        this._server.bayeux.unsubscribe(this.messageContextPath + "/*");
    }
};

function createResourceSet(data) {
    data.contextPath = this.rootPath + "/resources";
    this.resourceSet = this._resourceMiddleware.busterResources.createResourceSet(data);

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