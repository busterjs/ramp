var URL = require("url");
var buster = require("buster-core");

var busterClient = require("./client");

module.exports = buster.extend({
    captureUrl: "/capture",

    respond: function (req, res) {
        var url = URL.parse(req.url);

        if (url.pathname == this.captureUrl) {
            this.createClient(req, res);
            return true;
        }

        for (var i = 0, ii = this.clients.length; i < ii; i++) {
            if (this.clients[i].respond(req, res, url.pathname)) return true;
        }
    },

    createClient: function (req, res) {
        if (typeof(this.clientId) != "number") this.clientId = 0;

        var client = busterClient.create(++this.clientId, this.multicastMiddleware);
        this.clients.push(client);

        if (this.currentSession) {
            client.startSession(this.currentSession);
        }

        this.emit("client:create", req, res, client);
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

    bindToMulticastMiddleware: function (multicastMiddleware) {
        var self = this;
        this.multicastMiddleware = multicastMiddleware;
        multicastMiddleware.on("client:create", function (multicast) {
            self.attachMulticastToClient(multicast);
        });
    },

    startSession: function (session) {
        this.currentSession = session;
        for (var i = 0, ii = this.clients.length; i < ii; i++) {
            this.clients[i].startSession(session);
        }
    },

    endSession: function () {
        this.currentSession = null;
        for (var i = 0, ii = this.clients.length; i < ii; i++) {
            this.clients[i].endSession();
        }
    },

    attachMulticastToClient: function (multicast) {
        for (var i = 0, ii = this.clients.length; i < ii; i++) {
            var client = this.clients[i];
            if (client.id == multicast.identifier) {
                client.attachMulticast(multicast);
                break;
            }
        }
    },

    get clients() {
        return this._clients || (this._clients = []);
    }
}, Object.create(buster.eventEmitter));