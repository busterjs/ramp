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

    destroyClient: function (capturedClient) {
        for (var i = 0, ii = this.capturedClients.length; i < ii; i++) {
            if (this.capturedClients[i] === capturedClient) {
                this.capturedClients[i].end();
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
                                       this.headerResourceSet, this.headerHeight,
                                       this.currentSession);
    client.on("end", function () {
        unloadClient.call(this, client);
    }.bind(this));
    this.capturedClients.push(client);
    this.oncapture(req, res, client);
}

function unloadClient(client) {
    for (var i = 0, ii = this.capturedClients.length; i < ii; i++) {
        if (this.capturedClients[i] === client) {
            this.capturedClients.splice(i, 1);
            break;
        }
    }
}

function bindToSessionMiddleware(sessionMiddleware) {
    sessionMiddleware.on("session:start", function (session) {
        this.startSession(session);
    }.bind(this));

    sessionMiddleware.on("session:end", function () {
        this.endSession();
    }.bind(this));
}