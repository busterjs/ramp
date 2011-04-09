var clientMiddleware = require("./../lib/capture/client-middleware").create();
var sessionMiddleware = Object.create(require("./../lib/session/session-middleware"));

module.exports = {
    respond: function (req, res) {
        if (this.clientMiddleware.respond(req, res)) return true;
        if (this.sessionMiddleware.respond(req, res)) return true;
    },

    get clientMiddleware() {
        return this._clientMiddleware || (function (self) {
            var middleware = Object.create(clientMiddleware);
            middleware.bindToSessionMiddleware(self.sessionMiddleware);
            return (self._clientMiddleware = middleware);
        }(this));
    },

    get sessionMiddleware() {
        return this._sessionMiddleware || (this._sessionMiddleware = Object.create(sessionMiddleware));
    }
}