var bResources = require("buster-resources");
var bCapServPubsubServer = require("./pubsub-server");
var bCapServSessionQueue = require("./session-queue");
var bCapServPubsubClient = require("./pubsub-client.js");
var bCapServSlave = require("./slave.js");
var bCapServSession = require("./session");
var httpServerRequestListenerProxy = require("./http-server-request-listener-proxy");
var URL = require("url");
var when = require("when");

module.exports = {
    create: function () {
        var instance = Object.create(this);
        instance._pubsubServer = bCapServPubsubServer.create(null, "/messaging");
        instance._sessionQueue = bCapServSessionQueue.create();
        instance._resourceMiddleware = bResources.resourceMiddleware.create();
        instance._resourceCache = bResources.resourceSetCache.create();

        instance._pubsubClient = instance._pubsubServer.createClient();

        instance._sessionQueue.on("slave:captured", function (slave) {
            instance._onSlaveCaptured(slave);
        });

        instance._sessionQueue.on("slave:freed", function (slave) {
            instance._onSlaveFreed(slave);
        });

        instance._sessionQueue.prepareSession = function (session) {
            return instance._onPrepareSession(session);
        };

        instance._sessionQueue.teardownSession = function (session) {
            instance._onTeardownSession(session);
        };

        return instance;
    },

    attach: function (httpServer) {
        this._pubsubServer.attach(httpServer);
        httpServerRequestListenerProxy.attach(httpServer, this._respond.bind(this));
        this._httpServer = httpServer;
    },

    setHeader: function (height, resourceSet) {
        this.hasHeader = true;
        this.headerHeight = height;
        this.headerResourceSet = resourceSet;
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

        if (this._resourceMiddleware.respond(req, res)) return true;
    },

    _createSessionFromRequest: function (body, res) {
        var sessionData;
        try {
            sessionData = JSON.parse(body);
        } catch (e) {
            return failWithError(res, "JSON parse error");
        }

        bCapServSession.create(sessionData, this._pubsubServer).then(function (session) {
            this._sessionQueue.enqueueSession(session);
            res.writeHead(201);
            res.write(JSON.stringify(session.serialize()));
            res.end();
        }.bind(this), function (err) {
            failWithError(res, err.message);
        });
    },

    _captureSlave: function (res) {
        var slave = bCapServSlave.create(this._resourceMiddleware, this._pubsubServer);

        this._sessionQueue.addSlave(slave);

        if (this.hasHeader) {
            slave.setHeader(this.headerHeight, this.headerResourceSet);
        }

        res.writeHead(302, {"Location": slave.prisonPath});
        res.end();
    },

    _listCachedResources: function (res) {
        res.writeHead(200, {"Content-Type": "application/json"});
        res.write(JSON.stringify(this._resourceCache.resourceVersions()));
        res.end();
    },

    _onSlaveCaptured: function (slave) {
        this._pubsubClient.emit("slave:captured", slave.serialize());
    },

    _onSlaveFreed: function (slave) {
        this._pubsubClient.emit("slave:freed", slave.serialize());
        slave.teardown();
    },

    _onPrepareSession: function (session) {
        var deferred = when.defer();

        this._resourceCache.inflate(session.resourceSet).then(function (rs) {
            this._resourceMiddleware.mount(session.resourcesPath, rs);
            deferred.resolve(session);
        }.bind(this));

        return deferred.promise;
    },

    _onTeardownSession: function (session) {
        this._resourceMiddleware.unmount(session.resourcesPath);
        session.teardown();
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
