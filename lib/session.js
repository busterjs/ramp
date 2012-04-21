var buster = require("buster-core");
var when = require("when");
var fs = require("fs");
var uuid = require("node-uuid");
var bResources = require("buster-resources");
var bCapServPubsubClient = require("./pubsub-client");

var libraries = [
    require.resolve("buster-core"),
    require.resolve("./prison-util"),
    require.resolve("./prison-session-initializer")
];

var baseSessionResourceSet = bResources.resourceSet.create();
baseSessionResourceSet.addResources(libraries.map(function (path) {
    return {path: path, content: fs.readFileSync(path)};
}).concat([{path: "/_session_internals.js", combine: libraries}]))
    .then(function () {
        baseSessionResourceSet.loadPath.append("/_session_internals.js")
    });

module.exports = buster.extend(buster.eventEmitter.create(), {
    create: function (sessionData, pubsubServer) {
        var deferred = when.defer();

        var instance = Object.create(this);
        instance.id = uuid();
        instance.path = "/sessions/" + instance.id;
        instance.messagingPath = instance.path + "/messaging";
        instance.state = {
            started: false,
            loaded: false,
            aborted: false,
            ended: false,
            unloaded: false
        };
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
                    instance.resourceSet = baseSessionResourceSet.concat(resourceSet);
                    instance._pubsubServerAttach(pubsubServer);
                    deferred.resolve(instance);
                }, function (err) {
                    deferred.reject(err);
                });
        }

        return deferred.promise;
    },

    serialize: function () {
        return {
            id: this.id,
            resourcesPath: this.resourcesPath,
            messagingPath: this.messagingPath,
            state: this.state
        }
    },

    started: function () {
        this.state.started = true;
        this._pubsubClient.emit("session:started", {
            session: this.serialize()
        });
    },

    loaded: function (slaves) {
        this.state.loaded = true;
        this._pubsubClient.emit("session:loaded", {
            session: this.serialize()
        });
    },

    aborted: function (err) {
        this.state.aborted = true;
        this._pubsubClient.emit("session:aborted", {
            session: this.serialize(),
            error: err
        });
    },

    ended: function () {
        this.state.ended = true;
        this._pubsubClient.emit("session:ended", {
            session: this.serialize()
        });
    },

    unloaded: function () {
        this.state.unloaded = true;
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
    },

    _end: function () {
        this._pubsubServerDetach();
        this.emit("end");
    },

    _pubsubServerAttach: function (pubsubServer) {
        var sessionOwnerPubsubClientId;

        this._pubsubServerDetach();
        this._pubsubServer = pubsubServer;

        this._pubsubClient = bCapServPubsubClient.create({
            contextPath: this.messagingPath,
            fayeClient: pubsubServer.getClient()
        });
        this._pubsubClient.on("end", function () {
            this._end();
        }.bind(this));

        this._pubsubClient.on("initialize", function (e) {
            if (e.isOwner) {
                sessionOwnerPubsubClientId = e.pubsubClientId;
            }
        });

        this.pubsubServerDisconnectHandler = function (clientId) {
            if (clientId == sessionOwnerPubsubClientId) {
                this._end();
            }
        }.bind(this);

        pubsubServer.on("client:disconnect", this.pubsubServerDisconnectHandler);
    },

    _pubsubServerDetach: function () {
        if (!this._pubsubServer) return;

        this._pubsubServer.removeListener("client:disconnect", this.pubsubServerDisconnectHandler);
        delete this._pubsubServer;

        this._pubsubClient.disconnect();
        delete this._pubsubClient;
        // TODO: Unsubscribe from all events for this session
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