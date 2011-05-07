var URL = require("url");
var buster = require("buster-core");

var capturedClient = require("./captured-client");

module.exports = buster.extend({
    captureUrl: "/capture",

    respond: function (req, res) {
        var url = URL.parse(req.url);

        if (url.pathname == this.captureUrl) {
            this.captureClient(req, res);
            return true;
        }

        for (var i = 0, ii = this.capturedClients.length; i < ii; i++) {
            if (this.capturedClients[i].respond(req, res, url.pathname)) return true;
        }
    },

    captureClient: function (req, res) {
        if (typeof(this.capturedClientId) != "number") this.capturedClientId = 0;

        var client = capturedClient.create(++this.capturedClientId, this.multicastMiddleware);
        this.capturedClients.push(client);

        if (this.currentSession) {
            client.startSession(this.currentSession);
        }

        this.emit("client:capture", req, res, client);
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
        for (var i = 0, ii = this.capturedClients.length; i < ii; i++) {
            this.capturedClients[i].startSession(session);
        }
    },

    endSession: function () {
        this.currentSession = null;
        for (var i = 0, ii = this.capturedClients.length; i < ii; i++) {
            this.capturedClients[i].endSession();
        }
    },

    attachMulticastToClient: function (multicast) {
        for (var i = 0, ii = this.capturedClients.length; i < ii; i++) {
            var client = this.capturedClients[i];
            if (client.id == multicast.identifier) {
                client.attachMulticast(multicast);
                break;
            }
        }
    },

    get capturedClients() {
        return this._capturedClients || (this._capturedClients = []);
    }
}, Object.create(buster.eventEmitter));