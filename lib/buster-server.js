var captureMiddleware = require("./../lib/capture/capture-middleware");
var sessionMiddleware = Object.create(require("./../lib/session/session-middleware"));
var multicastMiddleware = require("buster-multicast").multicastMiddleware;

module.exports = {
    create: function () {
        var instance = Object.create(this);
        instance.setupMiddlewares();
        return instance;
    },

    respond: function (req, res) {
        if (this.captureMiddleware.respond(req, res)) return true;
        if (this.sessionMiddleware.respond(req, res)) return true;
        if (this.multicastMiddleware.respond(req, res)) return true;
    },

    createSession: function (data) {
        return this.sessionMiddleware.createSession(data);
    },

    destroySession: function (id) {
        return this.sessionMiddleware.destroySession(id);
    },

    captureClient: function (req, res) {
        return this.captureMiddleware.captureClient(req, res);
    },

    setupMiddlewares: function () {
        this.multicastMiddleware = Object.create(multicastMiddleware);
        this.multicastMiddleware.contextPath = "/sessions/messaging";

        this.sessionMiddleware = Object.create(sessionMiddleware);
        this.sessionMiddleware.multicast = this.multicastMiddleware.createClient();
        this.sessionMiddleware.multicast.url = "/sessions/messaging";

        this.captureMiddleware = Object.create(captureMiddleware);
        this.captureMiddleware.multicastMiddleware = this.multicastMiddleware;
        this.captureMiddleware.bindToSessionMiddleware(this.sessionMiddleware);
    }
}