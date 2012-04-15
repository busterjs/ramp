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
    create: function () {
        var instance = Object.create(this);
        instance._id = uuid();
        instance._isReady = false;
        instance.prisonPath = "/slaves/" + instance._id + "/prison";
        instance.prisonResourceSet = basePrisonResourceSet;
        return instance;
    },

    attach: function (httpServer, pubsubServer) {
        httpServerRequestListenerProxy.attach(httpServer, this._respond.bind(this));

        this._pubsubClient = bCapServPubsubClient.create({
            fayeClient: pubsubServer.getClient()
        });
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

        pubsubServer.on("client:disconnect", function (clientId) {
            if (clientId == this._prisonPubsubClientId) {
                this.emit("end");
            }
        }.bind(this));
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
            prisonPath: this.prisonPath
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

    _respond: function (req, res) {
        if (req.method === "GET" && req.url == this.prisonPath) {
            var locals = {
                scripts: this.prisonResourceSet.loadPath.paths().map(function (path) {
                    return this.prisonPath + path;
                }.bind(this)),
                hasHeaderFrame: false
            };

            res.writeHead(200);
            res.write(ejs.render(PRISON_TEMPLATE, {locals: locals}));
            res.end();
        }
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
    }
});