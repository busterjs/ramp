var faye = require("faye");
var captureMiddleware = require("./../lib/capture/capture-middleware");
var sessionMiddleware = Object.create(require("./../lib/session/session-middleware"));
var resourceMiddleware = require("./resources/resource-middleware");

var NOOP = function(){};

module.exports = {
    messagingContextPath: "/sessions/messaging",

    create: function () {
        var instance = Object.create(this);
        setupMiddlewares.call(instance);
        instance.logger = {"error":NOOP,"warn":NOOP,"log":NOOP,"info":NOOP,"debug":NOOP};
        setupBayeux.call(instance);
        return instance;
    },

    respond: function (req, res) {
        if (this.capture.respond(req, res)) return true;
        if (this.session.respond(req, res)) return true;
        if (this.resource.respond(req, res)) return true;
    },

    set capturePath(value) {
        this.capture.capturePath = value;
    },

    get capturePath() {
        return this.capture.capturePath;
    },

    get capturedClients() {
        return this.capture.capturedClients;
    },

    set oncapture(value) {
        this.capture.oncapture = value;
    },

    get oncapture() {
        return this.capture.oncapture;
    },

    set logger(value) {
        this._logger = value;
        this.resource.logger = value;
        this.session.logger = value;
        this.capture.logger = value;
    },

    get logger() {
        return this._logger;
    },

    header: function () {
        return this.capture.header.apply(this.capture, arguments);
    },

    createSession: function () {
        return this.session.createSession.apply(this.session, arguments);
    },

    destroySession: function () {
        return this.session.destroySession.apply(this.session, arguments);
    },

    get bayeux() {
        return this.bayeuxServer.getClient();
    },

    attach: function (httpServer) {
        this.httpServer = httpServer;

        var self = this;
        this.bayeuxServer.attach(httpServer);
        proxyThroughRespond(httpServer, this);

        httpServer.on("close", function () {
            self.bayeux.disconnect();
        });
    }
}

function proxyThroughRespond(httpServer, middleware) {
    var requestListeners = httpServer.listeners("request");
    httpServer.removeAllListeners("request");

    httpServer.on("request", function (req, res) {
        if (middleware.respond(req, res)) return;

        for (var i = 0, ii = requestListeners.length; i < ii; i++) {
            requestListeners[i](req, res);
        }
    });
}

function setupMiddlewares() {
    this.resource = resourceMiddleware.create();
    this.session = sessionMiddleware.create(this.resource.busterResources, this);
    this.capture = captureMiddleware.create(this.resource.busterResources, this.session, this);
}

function setupBayeux() {
    var self = this;
    this.bayeuxServer = new faye.NodeAdapter({mount: this.messagingContextPath, timeout: 1});

    this.bayeuxServer.addExtension({
        incoming: function (message, callback) {
            logBayeuxMessage.call(self, "[BAYEUX IN ]", message)
            return callback(message);
        },

        outgoing: function (message, callback) {
            logBayeuxMessage.call(self, "[BAYEUX OUT]", message)
            return callback(message);
        }
    });

    this.bayeuxServer.bind("disconnect", function (clientId) {
        self.capture.destroyClientByBayeuxClientId(clientId);
    });
}

function logBayeuxMessage(prefix, message) {
    if (message.channel == "/meta/connect") return;

    this.logger.debug(prefix, message.channel, message);
}