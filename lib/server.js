var bResources = require("buster-resources");
var bBayeuxServer = require("./bayeux-server");
var bSessionQueue = require("./session-queue");
var bSession = require("./session");
var httpServerRequestListenerProxy = require("./http-server-request-listener-proxy");
var URL = require("url");
var when = require("when");
var bCaptureServerPubsubClient = require("./pubsub-client.js");
var bCaptureServerSlave = require("./slave.js");

var NOOP = function(){};
var NOOP_LOGGER = {error:NOOP,warn:NOOP,log:NOOP,info:NOOP,debug:NOOP};

module.exports = {
    create: function () {
        var instance = Object.create(this);
        instance.logger = NOOP_LOGGER;
        instance.bayeuxServer = bBayeuxServer.create(instance.logger, "/messaging");
        instance.sessionQueue = bSessionQueue.create();
        instance._resourceMiddleware = bResources.resourceMiddleware.create();
        instance._resourceCache = bResources.resourceSetCache.create();

        instance._pubsubClient = bCaptureServerPubsubClient.create({
            fayeClient: instance.bayeuxServer.getClient()
        });

        instance.sessionQueue.on("slave:captured", function (slave) {
            instance._pubsubClient.emit("slave:captured", slave);
        });

        instance.sessionQueue.on("slave:freed", function (slave) {
            instance._pubsubClient.emit("slave:freed", slave);
        });

        instance.sessionQueue.prepareSession = function (session) {
            var deferred = when.defer();

            instance._resourceCache.inflate(session.resourceSet).then(function (rs) {
                instance._resourceMiddleware.mount(session.resourcesPath, rs);
                deferred.resolve(session);
            });

            return deferred.promise;
        };

        return instance;
    },

    attach: function (httpServer) {
        this.bayeuxServer.attach(httpServer);
        httpServerRequestListenerProxy.attach(httpServer, this._respond.bind(this));
        this._httpServer = httpServer;
    },

    _respond: function (req, res) {
        var url = URL.parse(req.url);

        if (req.method == "POST" && url.path == "/sessions") {
            concatReqBody(req).then(function (body) {
                this._createSessionFromRequest(body, res);
            }.bind(this));
            return true;
        }

        if (req.method == "GET" && url.path == "/capture") {
            this._captureSlave(res);
            return true;
        }

        if (req.method == "GET" && url.path == "/resources") {
            this._listCachedResources(res);
            return true;
        }
    },

    _createSessionFromRequest: function (body, res) {
        var sessionData;
        try {
            sessionData = JSON.parse(body);
        } catch (e) {
            return failWithError(res, "JSON parse error");
        }

        bSession.create(sessionData, this.bayeuxServer).then(function (session) {
            this.sessionQueue.enqueueSession(session);
            res.writeHead(201);
            res.write(JSON.stringify(session.serialize()));
            res.end();
        }.bind(this), function (err) {
            failWithError(res, err.message);
        });
    },

    _captureSlave: function (res) {
        var slave = this._createSlave();
        res.writeHead(302, {"Location": slave.prisonPath});
        res.end();
    },

    _createSlave: function () {
        var slave = bCaptureServerSlave.create();
        this.sessionQueue.addSlave(slave);
        this._attachSlave(slave);
        return slave;
    },

    _attachSlave: function (slave) {
        slave.attach(this._httpServer, this._pubsubClient);
    },

    _listCachedResources: function (res) {
        res.writeHead(200, {"Content-Type": "application/json"});
        res.write(JSON.stringify(this._resourceCache.resourceVersions()));
        res.end();
    }
};

function concatReqBody(req) {
    var deferred = when.defer();

    var body = "";
    req.setEncoding("utf8");
    req.on("data", function (chunk) { body += chunk;});
    req.on("end", function () { deferred.resolve(body); });

    return deferred.promise;
}

function failWithError(res, message) {
    res.writeHead(400);
    res.end(JSON.stringify({message: message}));
}