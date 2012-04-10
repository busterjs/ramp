var buster = require("buster-core");
var when = require("when");
var uuid = require("node-uuid");
var bResources = require("buster-resources");
var bCaptureServerPubsubClient = require("./pubsub-client");

module.exports = buster.extend(buster.eventEmitter.create(), {
    create: function (sessionData, fayeAdapter) {
        var deferred = when.defer();

        var instance = Object.create(this);
        instance.id = uuid();
        instance.path = "/sessions/" + instance.id;
        instance.messagingPath = instance.path + "/messaging";
        setJoinable(instance, sessionData);
        setResourcesPath(instance, sessionData);

        var serializedResourceSet = sessionData.resourceSet;
        delete sessionData.resourceSet;

        var allProps = Object.keys(sessionData);
        if (allProps.length > 0) {
            deferred.reject({
                message: "Unknown property '" + allProps[0] + "'."
            });
        } else {
            bResources.resourceSet.deserialize(serializedResourceSet)
                .then(function (resourceSet) {
                    instance.resourceSet = resourceSet;
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
        var sessionOwnerFayeClientId;

        this._fayeAdapterDetach();
        this._fayeAdapter = fayeAdapter;

        this._pubsubClient = bCaptureServerPubsubClient.create({
            contextPath: this.messagingPath,
            fayeClient: fayeAdapter.getClient()
        });
        this._pubsubClient.on("end", function () {
            this._end();
        }.bind(this));

        var initPath = this.messagingPath
            + bCaptureServerPubsubClient._getEventName("initialize");
        this.fayeAdapterExtensionInitialize = {
            incoming: function (message, callback) {
                if (message.channel == initPath) {
                    if (message.data.data.isOwner) {
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

        this._pubsubClient.disconnect();
        delete this._pubsubClient;
        // TODO: Unsubscribe from all events for this session
    },

    serialize: function () {
        return {
            id: this.id,
            resourcesPath: this.resourcesPath,
            messagingPath: this.messagingPath
        }
    },

    started: function () {
        this._pubsubClient.emit("session:started", {
            session: this.serialize()
        });
    },

    loaded: function (slaves) {
        this._pubsubClient.emit("session:loaded", {
            session: this.serialize()
        });
    },

    aborted: function (err) {
        this._pubsubClient.emit("session:aborted", {
            session: this.serialize(),
            error: err
        });
    },

    ended: function () {
        this._pubsubClient.emit("session:ended", {
            session: this.serialize()
        });
    },

    unloaded: function () {
        this._pubsubClient.emit("session:unloaded", {
            session: this.serialize()
        });
    },

    capturedSlave: function (slave) {
        this._pubsubClient.emit("slave:captured", {
            session: this.serialize(),
            slave: slave.serialize()
        });
    },

    freedSlave: function (slave) {
        this._pubsubClient.emit("slave:freed", {
            session: this.serialize(),
            slave: slave.serialize()
        });
    }
});

function setJoinable(session, sessionData) {
    if (sessionData.joinable === false) session.joinable = false;
    delete sessionData.joinable;
}

function setResourcesPath(session, sessionData) {
    if (sessionData.staticResourcePath) {
        session.resourcesPath = "/sessions/static";
    } else {
        session.resourcesPath = session.path + "/resources";
    }

    delete sessionData.staticResourcePath;
}