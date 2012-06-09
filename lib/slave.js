var uuid = require("node-uuid");
var when = require("when");
var ejs = require("ejs");
var fs = require("fs");
var bResources = require("buster-resources");
var bCapServPubsubClient = require("./pubsub-client");
var PRISON_TEMPLATE = fs.readFileSync(__dirname + "/templates/slave_prison.html", "utf8");

var httpServerRequestListenerProxy = require("./http-server-request-listener-proxy");

var libraries = [
    require.resolve("./../vendor/json/json2"),
    require.resolve("buster-core"),
    require.resolve("buster-core/lib/buster-event-emitter"),
    require.resolve("faye/browser/faye-browser-min"),
    require.resolve("when"),
    require.resolve("node-uuid"),
    require.resolve("./pubsub-client"),
    require.resolve("./session-client"),
    require.resolve("./prison-util"),
    require.resolve("./prison"),
    require.resolve("./prison-init")
];

var basePrisonResourceSet = bResources.resourceSet.create();
basePrisonResourceSet.addResources(libraries.map(function (path) {
    return {path: path, content: fs.readFileSync(path)};
}).concat([{path: "/prison.js", combine: libraries}]))
    .then(function () {
        basePrisonResourceSet.loadPath.append("/prison.js")
    });

module.exports = buster.extend(buster.eventEmitter.create(), {
    create: function (resourceMiddleware, pubsubServer) {
        var instance = Object.create(this);
        instance._id = uuid();
        instance._isReady = false;
        instance.prisonPath = "/slaves/" + instance._id + "/prison";

        instance._clientDisconnectListener = function (clientId) {
            if (clientId == this._prisonPubsubClientId) {
                this.emit("end");
            }
        }.bind(instance);

        instance._resourceMiddleware = resourceMiddleware;
        instance._attachResourceSet();

        instance._pubsubServer = pubsubServer;
        instance._attachPubsubServer();

        return instance;
    },

    teardown: function () {
        this._resourceMiddleware.unmount(this.prisonPath);
        this._pubsubClient.teardown();
        this._pubsubServer.removeListener("client:disconnect", this._clientDisconnectListener);
    },

    prepare: function () {
        var deferred = when.defer();

        if (this._isReady) {
            deferred.resolve();
        } else {
            this._imprisonmentDeferred = deferred;
        }

        return deferred.promise;
    },

    serialize: function () {
        return {
            prisonPath: this.prisonPath,
            id: this._id
        }
    },

    loadSession: function (session) {
        this._loadSessionDeferred = when.defer();
        this._pubsubClient.emit("slave:" + this._id + ":session:load", session.serialize());
        return this._loadSessionDeferred;
    },

    unloadSession: function () {
        this._unloadSessionDeferred = when.defer();
        this._pubsubClient.emit("slave:" + this._id + ":session:unload");
        return this._unloadSessionDeferred;
    },

    _onSessionLoaded: function () {
        this._loadSessionDeferred.resolve();
    },

    _onSessionUnloaded: function () {
        this._unloadSessionDeferred.resolve();
    },

    _onImprisoned: function (e) {
        this._prisonPubsubClientId = e.pubsubClientId;
        this._imprisonmentDeferred.resolve();
    },

    _attachResourceSet: function () {
        var prisonPath = this.prisonPath;

        var prisonResourceSet = basePrisonResourceSet.concat();
        prisonResourceSet.addResource({
            path: "/",
            content: function () {
                var locals = {
                    scripts: prisonResourceSet.loadPath.paths().map(function (path) {
                        return prisonPath + path;
                    }),
                    hasHeaderFrame: false
                };

                return ejs.render(PRISON_TEMPLATE, {locals: locals});
            }
        });

        this._resourceMiddleware.mount(prisonPath, prisonResourceSet);
    },

    _attachPubsubServer: function () {
        this._pubsubClient = this._pubsubServer.createClient();
        this._pubsubClient.on(
            "slave:" + this._id + ":session:loaded",
            this._onSessionLoaded.bind(this)
        );
        this._pubsubClient.on(
            "slave:" + this._id + ":session:unloaded",
            this._onSessionUnloaded.bind(this)
        );

        this._pubsubClient.on(
            "slave:" + this._id + ":imprisoned",
            this._onImprisoned.bind(this)
        );

        this._pubsubServer.on("client:disconnect", this._clientDisconnectListener);
    }
});
