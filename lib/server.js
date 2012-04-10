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

        var pubsubClient = bCaptureServerPubsubClient.create({
            fayeClient: instance.bayeuxServer.getClient()
        });

        instance.sessionQueue.on("slave:captured", function (slave) {
            pubsubClient.emit("slave:captured", slave);
        });

        instance.sessionQueue.on("slave:freed", function (slave) {
            pubsubClient.emit("slave:freed", slave);
        });

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
        slave.attach(this._httpServer);
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