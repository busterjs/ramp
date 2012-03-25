var bBayeuxServer = require("./bayeux-server");
var bSessionQueue = require("./session-queue");
var bSession = require("./session");
var httpServerRequestListenerProxy = require("./http-server-request-listener-proxy");
var URL = require("url");
var when = require("when");

var NOOP = function(){};
var NOOP_LOGGER = {error:NOOP,warn:NOOP,log:NOOP,info:NOOP,debug:NOOP};

module.exports = {
    create: function () {
        var instance = Object.create(this);
        instance.logger = NOOP_LOGGER;
        instance.bayeuxServer = bBayeuxServer.create(instance.logger);
        instance.sessionQueue = bSessionQueue.create();
        return instance;
    },

    attach: function (httpServer) {
        this.bayeuxServer.attach(httpServer);
        httpServerRequestListenerProxy.attach(httpServer, this._respond.bind(this));
    },

    _respond: function (req, res) {
        var url = URL.parse(req.url);

        if (req.method == "POST" && url.path == "/sessions") {
            concatReqBody(req).then(function (body) {
                this._createSessionFromRequest(body, res);
            }.bind(this));
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