var resourceSet = require("./../resources/resource-set");

module.exports = {
    create: function (id, data, resourceMiddleware, multicast) {
        var session = Object.create(this);
        session.id = id;
        session.rootPath = "/sessions/" + session.id;
        session.multicast = multicast;

        data.contextPath = session.rootPath + "/resources";
        session.resourceSet = resourceMiddleware.createResourceSet(data);

        return session;
    },

    validate: function (data) {
        return resourceSet.validate(data);
    },

    toJSON: function () {
        return {
            rootPath: this.rootPath,
            resourceContextPath: this.resourceSet.resourceContextPath(),
            multicastUrl: this.multicast.url,
            multicastClientId: this.multicast.clientId
        }
    },
};