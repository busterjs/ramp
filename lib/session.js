var buster = require("buster-core");
var when = require("when");
var uuid = require("node-uuid");
var bResources = require("buster-resources");

module.exports = buster.extend(buster.eventEmitter.create(), {
    create: function (sessionData) {
        var deferred = when.defer();

        var instance = Object.create(this);

        instance.id = uuid();
        instance.path = "/sessions/" + instance.id;
        instance.messagingPath = instance.path + "/messaging";

        if (sessionData.joinable === false) instance.joinable = false;
        delete sessionData.joinable;

        instance.resourcesPath = sessionData.staticResourcePath
            ? "/sessions/static"
            : instance.path + "/resources";
        delete sessionData.staticResourcePath;

        var serializedResourceSet = sessionData.resourceSet;
        delete sessionData.resourceSet;

        var allProps = Object.keys(sessionData);
        if (allProps.length > 0) {
            deferred.reject({
                message: "Unknown property '" + allProps[0] + "'."
            });
        } else {
            bResources.resourceSet.deserialize(serializedResourceSet)
                .then(function () {
                    deferred.resolve(instance);
                }, function (err) {
                    deferred.reject(err);
                });
        }

        return deferred.promise;
    },

    attach: function (fayeAdapter) {
        var fayeClient = fayeAdapter.getClient();

        fayeClient.subscribe(this.messagingPath + "/end", function () {
            this.emit("end");
        }.bind(this));
    },

    serialize: function () {
        return {
            id: this.id,
            resourcesPath: this.resourcesPath,
            messagingPath: this.messagingPath
        }
    },

    started: function () {
        // /session/started [session]
    },

    loaded: function (slaves) {
        // /session/loaded [session]
    },

    aborted: function (err) {
        // /session/aborted [session, err]
    },

    ended: function () {
        // /session/ended [session]
    },

    unloaded: function () {
        // /session/unloaded [session]
    },

    capturedSlave: function (slave) {
        // /slave/captured [slave]
    },

    freedSlave: function (slave) {
        // /slave/freed [slave]
    }
});