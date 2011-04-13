var clientMiddleware = require("./../lib/capture/client-middleware").create();
var sessionMiddleware = Object.create(require("./../lib/session/session-middleware"));

module.exports = {
    respond: function (req, res) {
        if (this.clientMiddleware.respond(req, res)) return true;
        if (this.sessionMiddleware.respond(req, res)) return true;
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

    setupMiddlewares: function () {
        if (!this._sessionMiddleware) {
            this._sessionMiddleware = Object.create(sessionMiddleware)
        }

        if (!this._clientMiddleware) {
            var middleware = Object.create(clientMiddleware);
            middleware.bindToSessionMiddleware(this._sessionMiddleware);
            this._clientMiddleware = middleware;
        }
    }
}