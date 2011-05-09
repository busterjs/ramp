var captureMiddleware = require("./../lib/capture/capture-middleware");
var sessionMiddleware = Object.create(require("./../lib/session/session-middleware"));
var multicastMiddleware = require("buster-multicast").multicastMiddleware;

module.exports = {
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

    get captureMiddleware() {
        this.setupMiddlewares();
        return this._captureMiddleware;
    },

    get sessionMiddleware() {
        this.setupMiddlewares();
        return this._sessionMiddleware;
    },

    get multicastMiddleware() {
        this.setupMiddlewares();
        return this._multicastMiddleware;
    },

    setupMiddlewares: function () {
        if (!this._multicastMiddleware) {
            this._multicastMiddleware = Object.create(multicastMiddleware);
            this._multicastMiddleware.contextPath = "/sessions/messaging";
        }

        if (!this._sessionMiddleware) {
            this._sessionMiddleware = Object.create(sessionMiddleware);
            this._sessionMiddleware.multicast = this._multicastMiddleware.createClient();
            this._sessionMiddleware.multicast.url = "/sessions/messaging";
        }

        if (!this._captureMiddleware) {
            this._captureMiddleware = Object.create(captureMiddleware);
            this._captureMiddleware.multicastMiddleware = this._multicastMiddleware;
            this._captureMiddleware.bindToSessionMiddleware(this._sessionMiddleware);
        }
    }
}