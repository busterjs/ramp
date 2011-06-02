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
        if (this.capture.respond(req, res)) return true;
        if (this.session.respond(req, res)) return true;
        if (this.multicast.respond(req, res)) return true;
    },

    setupMiddlewares: function () {
        this.multicast = Object.create(multicastMiddleware);
        this.multicast.contextPath = "/sessions/messaging";

        this.session = Object.create(sessionMiddleware);
        this.session.multicast = this.multicast.createClient();
        this.session.multicast.url = "/sessions/messaging";

        this.capture = Object.create(captureMiddleware);
        this.capture.multicastMiddleware = this.multicast;
        this.capture.bindToSessionMiddleware(this.session);
    }
}