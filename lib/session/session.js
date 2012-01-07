var buster = require("buster-core");
var faye = require("faye");
var uuid = require("node-uuid");
var bResourcesResourceSet = require("buster-resources/lib/resource-set");

module.exports = buster.extend(buster.eventEmitter.create(), {
    create: function (payload, resourceSet) {
        var session = Object.create(this);
        session.joinable = ("joinable" in payload) ? !!payload.joinable : true;
        session.resourceSet = resourceSet;
        session.id = uuid();
        session.rootPath = "/sessions/" + session.id;
        session.bayeuxClientPath = session.rootPath + "/messaging";
        setUpResourceSet.call(session, payload);
        createBayeux.call(session);
        return session;
    },

    validate: function (payload) {
        if ("resourceSet" in payload) {
            return bResourcesResourceSet.validate(payload.resourceSet);
        }
    },

    toJSON: function () {
        return {
            id: this.id,
            rootPath: this.rootPath,
            resourceContextPath: this.resourceSet.contextPath,
            bayeuxClientPath: this.bayeuxClientPath
        }
    },

    publish: function (url, message) {
        return this._bayeux.getClient().publish(url, message);
    },

    subscribe: function (url, handler) {
        return this._bayeux.getClient().subscribe(url, handler);
    },

    end: function () {
        if (this._ended) return;
        this._ended = true;

        // TODO: Tear down and disconnect this._bayeux.
        this.emit("end");
    }
});

function createBayeux() {
    var self = this;
    this._bayeux = new faye.NodeAdapter({mount: this.bayeuxClientPath, timeout: 1});

    this._bayeux.addExtension({
        incoming: function (message, callback) {
            if (message.channel == "/session-owner") {
                self.logger.debug("Setting session owner to " + message.clientId);
                self.sessionOwnerFayeClientId = message.clientId;
            }

            callback(message);
        }
    });
    this._bayeux.bind("disconnect", function (clientId) {
        if (clientId == self.sessionOwnerFayeClientId) {
            self.logger.debug("Deleting current session (" + self.id + "), due to death of session owner " + clientId);
            self.end();
        }
    });
}

function setUpResourceSet(payload) {
    this.resourceSet.append(payload.resourceSet);
    this.resourceSet.contextPath = this.rootPath + "/resources";
    this.resourceSet.createDefaultRootResourceIfNotExists();
    this.resourceSet.addScriptLoadingToRootResource();

    // TODO: should be in a separate namespace, so stuff doesn't
    // break in the unlikely event of a session containing resources
    // with names that conflict with these internal resources.
    var internalResources = [
        require.resolve("buster-core"),
        require.resolve("./../browser/cross-frame"),
        require.resolve("./../browser/client-frame-load")
    ];

    for (var i = 0, ii = internalResources.length; i < ii; i++) {
        this.resourceSet.addFile(internalResources[i]);
    }

    // Prepend internalResources, they should load first.
    this.resourceSet.prependToLoad(internalResources);
}