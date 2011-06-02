var resourceSet = require("./../resources/resource-set");

// TODO: Make this module less worthless. Currently it's just a resourceSet with some extra crap.
module.exports = {
    create: function (id, data, resourceMiddleware) {
        var session = Object.create(this);
        session.id = id;
        session.rootPath = "/sessions/" + session.id;

        data.contextPath = session.rootPath + "/resources";
        session.resourceSet = resourceMiddleware.createResourceSet(data);
        session.resourceContextPath = session.resourceSet.resourceContextPath();

        return session;
    },

    respond: function (req, res) {
    },

    // addResource: function (path, resource) {
    //     this.resourceSet.addResource(path, resource);
    // },

    validate: function (data) {
        return resourceSet.validate(data);
    },

    toJSON: function () {
        return {
            rootPath: this.rootPath,
            resourceContextPath: this.resourceContextPath,
            multicastUrl: this.multicast.url,
            multicastClientId: this.multicast.clientId
        }
    },
};