var buster = require("buster-core");
var when = require("when");
var uuid = require("node-uuid");
var bResources = require("buster-resources");

module.exports = buster.extend(buster.eventEmitter.create(), {
    create: function (sessionData, fayeAdapter) {
        var deferred = when.defer();

        var instance = Object.create(this);

        instance.id = uuid();
        instance.path = "/sessions/" + instance.id;
        instance.messagingPath = instance.path + "/messaging";
        instance.userMessagingPath = instance.messagingPath + "/user";

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
                    instance._fayeAdapterAttach(fayeAdapter);
                    deferred.resolve(instance);
                }, function (err) {
                    deferred.reject(err);
                });
        }

        return deferred.promise;
    },

    _end: function () {
        this._fayeAdapterDetach();
        this.emit("end");
    },

    _fayeAdapterAttach: function (fayeAdapter) {
        this._fayeAdapterDetach();
        this._fayeAdapter = fayeAdapter;

        this._fayeClient = fayeAdapter.getClient();
        var sessionOwnerFayeClientId;

        this._fayeClient.subscribe(this.messagingPath + "/end", function () {
            this._end();
        }.bind(this));

        var initPath = this.messagingPath + "/initialize";
        this.fayeAdapterExtensionInitialize = {
            incoming: function (message, callback) {
                if (message.channel == initPath) {
                    if (message.data.isOwner) {
                        sessionOwnerFayeClientId = message.clientId;
                    }
                }

                callback(message);
            }.bind(this)
        };
        fayeAdapter.addExtension(this.fayeAdapterExtensionInitialize);

        this.fayeAdapterDisconnectHandler = function (clientId) {
            if (clientId == sessionOwnerFayeClientId) {
                this._end();
            }
        }.bind(this);
        fayeAdapter.bind("disconnect", this.fayeAdapterDisconnectHandler);
    },

    _fayeAdapterDetach: function () {
        if (!this._fayeAdapter) return;

        this._fayeAdapter.removeExtension(this.fayeAdaperExtensionInitialize);
        this._fayeAdapter.unbind("disconnect", this.fayeAdapterDisconnectHandler);
        delete this._fayeAdapter;
        // TODO: Unsubscribe from all events for this session
    },

    serialize: function () {
        return {
            id: this.id,
            resourcesPath: this.resourcesPath,
            messagingPath: this.messagingPath,
            userMessagingPath: this.userMessagingPath
        }
    },

    started: function () {
        var path = this.userMessagingPath + "/session/started";
        this._fayeClient.publish(path, {
            session: this.serialize()
        });
    },

    loaded: function (slaves) {
        var path = this.userMessagingPath + "/session/loaded";
        this._fayeClient.publish(path, {
            session: this.serialize()
        });
    },

    aborted: function (err) {
        var path = this.userMessagingPath + "/session/aborted";
        this._fayeClient.publish(path, {
            session: this.serialize(),
            error: err
        });
    },

    ended: function () {
        var path = this.userMessagingPath + "/session/ended";
        this._fayeClient.publish(path, {
            session: this.serialize()
        });
    },

    unloaded: function () {
        var path = this.userMessagingPath + "/session/unloaded";
        this._fayeClient.publish(path, {
            session: this.serialize()
        });
    },

    capturedSlave: function (slave) {
        var path = this.userMessagingPath + "/slave/captured";
        this._fayeClient.publish(path, {
            session: this.serialize(),
            slave: slave.serialize()
        });
    },

    freedSlave: function (slave) {
        var path = this.userMessagingPath + "/slave/freed";
        this._fayeClient.publish(path, {
            session: this.serialize(),
            slave: slave.serialize()
        });
    }
});