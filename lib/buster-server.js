var clientMiddleware = require("./../lib/client/client-middleware");
var sessionMiddleware = Object.create(require("./../lib/session/session-middleware"));
var multicastMiddleware = require("buster-multicast").multicastMiddleware;

module.exports = {
    respond: function (req, res) {
        if (this.clientMiddleware.respond(req, res)) return true;
        if (this.sessionMiddleware.respond(req, res)) return true;
        if (this.multicastMiddleware.respond(req, res)) return true;
    },

    createSession: function (data) {
        return this.sessionMiddleware.createSession(data);
    },

    destroySession: function (id) {
        return this.sessionMiddleware.destroySession(id);
    },

    createClient: function () {
        return this.clientMiddleware.createClient();
    },

    get clientMiddleware() {
        this.setupMiddlewares();
        return this._clientMiddleware;
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
        }

        if (!this._sessionMiddleware) {
            this._sessionMiddleware = Object.create(sessionMiddleware)
            this._sessionMiddleware.multicast = this._multicastMiddleware.createClient();
            this._sessionMiddleware.multicast.url = "/sessions/messaging"
        }

        if (!this._clientMiddleware) {
            this._clientMiddleware = Object.create(clientMiddleware);
            this._clientMiddleware.multicastMiddleware = this._multicastMiddleware;
            this._clientMiddleware.bindToSessionMiddleware(this._sessionMiddleware);
        }
    }
}