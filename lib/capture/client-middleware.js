var URL = require("url");

var busterClient = require("./client");
var multicastMiddleware = require("buster-multicast").multicastMiddleware;

module.exports = {
    create: function () {
        var clientMiddleware = Object.create(this);
        clientMiddleware.multicastMiddleware = Object.create(multicastMiddleware);

        return clientMiddleware;
    },

    respond: function (req, res) {
        var url = URL.parse(req.url);

        if (!this.clients) return false;
        for (var i = 0, ii = this.clients.length; i < ii; i++) {
            if (this.clients[i].respond(req, res, url.pathname)) return true;
        }

        if (this.multicastMiddleware.respond(req, res)) return true;
    },

    createClient: function (res) {
        if (typeof(this.clientId) != "number") this.clientId = 0;
        if (!this.clients) this.clients = [];

        var client = busterClient.create(++this.clientId, this.multicastMiddleware);
        this.clients.push(client);

        return client;
    },

    bindToSessionMiddleware: function (sessionMiddleware) {
        var self = this;
        sessionMiddleware.on("session:start", function (session) {
            self.startSession(session);
        });
        sessionMiddleware.on("session:end", function () {
            self.endSession();
        });
    },

    startSession: function (session) {
        for (var i = 0, ii = this.clients.length; i < ii; i++) {
            this.clients[i].multicast.emit([
                {topic: "session:start", data: session}
            ]);
        }
    },

    endSession: function () {
        for (var i = 0, ii = this.clients.length; i < ii; i++) {
            this.clients[i].multicast.emit([{topic: "session:end"}]);
        }
    }
};