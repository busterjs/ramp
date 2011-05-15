var resourceSet = require("./resource-set");

module.exports = {
    create: function (id, data) {
        var session = Object.create(this);
        session.id = id;
        session.rootPath = "/sessions/" + session.id;
        session.resourceContextPath = session.rootPath + "/resources";

        data.resourceContextPath = session.resourceContextPath;
        data.internalsContextPath = session.rootPath;
        session.resourceSet = resourceSet.create(data);

        return session;
    },

    respond: function (req, res) {
        return this.resourceSet.respond(req, res);
    },

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