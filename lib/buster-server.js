var faye = require("faye");
var captureMiddleware = require("./../lib/capture/capture-middleware");
var sessionMiddleware = Object.create(require("./../lib/session/session-middleware"));
var resourceMiddleware = require("./resources/resource-middleware");

var MESSAGING_CONTEXT_PATH = "/sessions/messaging";

module.exports = {
    create: function (httpServer) {
        var instance = Object.create(this);
        instance.bayeuxServer = new faye.NodeAdapter({mount: MESSAGING_CONTEXT_PATH, timeout: 1});
        instance.bayeuxServer.attach(httpServer);
        attach.call(instance, httpServer);
        setupMiddlewares.call(instance);
        return instance;
    },

    respond: function (req, res) {
        if (this.capture.respond(req, res)) return true;
        if (this.session.respond(req, res)) return true;
        if (this.resource.respond(req, res)) return true;
    },

    set captureUrl(value) {
        this.capture.captureUrl = value;
    },

    get captureUrl() {
        return this.capture.captureUrl;
    },

    set oncapture(value) {
        this.capture.oncapture = value;
    },

    get oncapture() {
        return this.capture.oncapture;
    },

    createSession: function () {
        return this.session.createSession.apply(this.session, arguments);
    },

    destroySession: function () {
        return this.session.destroySession.apply(this.session, arguments);
    },  

    get bayeux() {
        return this.bayeuxServer.getClient();
    }
}

function attach(httpServer) {
    var self = this;
    var requestListeners = httpServer.listeners("request");
    httpServer.removeAllListeners("request");

    httpServer.on("request", function (req, res) {
        if (self.respond(req, res)) return;

        for (var i = 0, ii = requestListeners.length; i < ii; i++) {
            requestListeners[i](req, res);
        }
    });

    this.address = httpServer.address();
    this.bayeuxClientUrl = "http://" + this.address.address + ":" + this.address.port
        + MESSAGING_CONTEXT_PATH
}

function setupMiddlewares() {
    this.resource = Object.create(resourceMiddleware);

    this.session = Object.create(sessionMiddleware);
    this.session.resourceMiddleware = this.resource;
    this.session.server = this;

    this.capture = Object.create(captureMiddleware);
    this.capture.resourceMiddleware = this.resource;
    this.capture.server = this;
    this.capture.bindToSessionMiddleware(this.session);
}