var faye = require("faye");
var uuid = require("node-uuid");
var bResourcesResourceSet = require("buster-resources/lib/resource-set");

module.exports = {
    create: function (payload, resourceSet) {
        var session = Object.create(this);
        session.joinable = ("joinable" in payload) ? !!payload.joinable : true;
        session.resourceSet = resourceSet;
        session.id = uuid();
        session.rootPath = "/sessions/" + session.id;
        session.bayeuxClientPath = session.rootPath + "/messaging";
        setUpResourceSet.call(session, payload);
        createBayeux.call(session);
        return session;
    },

    validate: function (payload) {
        if ("resourceSet" in payload) {
            return bResourcesResourceSet.validate(payload.resourceSet);
        }
    },

    toJSON: function () {
        return {
            id: this.id,
            rootPath: this.rootPath,
            resourceContextPath: this.resourceSet.contextPath,
            bayeuxClientPath: this.bayeuxClientPath
        }
    },

    publish: function (url, message) {
        return this._bayeux.getClient().publish(url, message);
    },

    subscribe: function (url, handler) {
        return this._bayeux.getClient().subscribe(url, handler);
    },

    destroy: function () {
        // TODO: Tear down and disconnect this._bayeux.
    }
};

function createBayeux() {
    var self = this;
    this._bayeux = new faye.NodeAdapter({mount: this.bayeuxClientPath, timeout: 1});
}

function setUpResourceSet(payload) {
    this.resourceSet.append(payload.resourceSet);
    this.resourceSet.contextPath = this.rootPath + "/resources";
    this.resourceSet.createDefaultRootResourceIfNotExists();
    this.resourceSet.addScriptLoadingToRootResource();

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