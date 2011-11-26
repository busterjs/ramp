var URL = require("url");
var buster = require("buster-core");

var capturedClient = require("./captured-client");

module.exports = {
    capturePath: "/capture",

    create: function (busterResources, sessionMiddleware, server) {
        var instance = Object.create(this);
        instance.busterResources = busterResources;
        instance.server = server;
        bindToSessionMiddleware.call(instance, sessionMiddleware);
        return instance;
    },

    respond: function (req, res) {
        var url = URL.parse(req.url);

        if (url.pathname == this.capturePath) {
            this.logger.info("Capturing new client");
            captureClient.call(this, req, res);
            return true;
        }

        for (var i = 0, ii = this.capturedClients.length; i < ii; i++) {
            if (this.capturedClients[i].respond(req, res, url.pathname)) return true;
        }
    },

    startSession: function (session) {
        this.logger.debug("Broadcasting session start to captured clients");
        this.currentSession = session;
        for (var i = 0, ii = this.capturedClients.length; i < ii; i++) {
            this.capturedClients[i].startSession(session);
        }
    },

    endSession: function () {
        this.logger.debug("Broadcasting session end to captured clients");
        this.currentSession = null;
        for (var i = 0, ii = this.capturedClients.length; i < ii; i++) {
            this.capturedClients[i].endSession();
        }
    },

    header: function (height, resourceSetOpts) {
        this.headerHeight = height;
        resourceSetOpts.contextPath = "/clientHeader";
        this.headerResourceSet = this.busterResources.createResourceSet(resourceSetOpts);
        return this.headerResourceSet;
    },

    destroyClientByBayeuxClientId: function (bayeuxClientId) {
        for (var i = 0, ii = this.capturedClients.length; i < ii; i++) {
            var client = this.capturedClients[i];
            if (client.bayeuxClientId == bayeuxClientId) {
                this.destroyClient(client);
                break;
            }
        }
    },

    destroyClient: function (capturedClient) {
        for (var i = 0, ii = this.capturedClients.length; i < ii; i++) {
            if (this.capturedClients[i] === capturedClient) {
                this.capturedClients[i].destroy();
                this.capturedClients.splice(i, 1);
                break;
            }
        }
    },

    get capturedClients() {
        return this._capturedClients || (this._capturedClients = []);
    }
};

function captureClient(req, res) {
    if (typeof(this.oncapture) != "function") {
        res.writeHead(500);
        res.write("Client was created with no 'oncapture' handler.");
        res.end();
        return;
    }

    var client = capturedClient.create(this.server, this.busterResources,
                                       this.headerResourceSet, this.headerHeight);
    this.capturedClients.push(client);
    if (this.currentSession && !(this.currentSession.joinable == false)) {
        client.startSession(this.currentSession);
    }
    this.oncapture(req, res, client);
}

function bindToSessionMiddleware(sessionMiddleware) {
    var self = this;
    sessionMiddleware.on("session:start", function (session) {
        self.startSession(session);
    });
    sessionMiddleware.on("session:end", function () {
        self.endSession();
    });
}