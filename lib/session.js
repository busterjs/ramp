var buster = require("buster-core");
var faye = require("faye");
var uuid = require("node-uuid");
var bResourcesResourceSet = require("buster-resources/lib/resource-set");

exports.create = function (payload, resourceSet, httpServer) {
    var bayeux;
    var bayeuxClientPath;
    var sessionOwnerFayeClientId;
    var ended = false;

    var session = buster.extend(buster.eventEmitter.create(), {
        respond: function (req, res, pathname) {
            if (pathname == this.rootPath && req.method == "DELETE") {
                this.logger.info("Destroying session via HTTP");
                this.end();
                res.writeHead(200);
                res.end();
                return true;
            }
        },

        toJSON: function () {
            return {
                id: this.id,
                rootPath: this.rootPath,
                resourceContextPath: this.resourceSet.contextPath,
                bayeuxClientPath: bayeuxClientPath
            }
        },

        publish: function (url, message) {
            return bayeux.getClient().publish(url, message);
        },

        subscribe: function (url, handler) {
            return bayeux.getClient().subscribe(url, handler);
        },

        end: function () {
            if (ended) return;
            ended = true;

            // TODO: Tear down and disconnect this._bayeux.
            this.logger.debug("Ending session " + this.id);
            this.emit("end");
        }
    });

    Object.defineProperty(session, "bayeuxClientPath", {
        get: function () {
            return bayeuxClientPath;
        }
    });

    session.joinable = ("joinable" in payload) ? !!payload.joinable : true,
    session.resourceSet = resourceSet;
    session.id = uuid();
    session.rootPath = "/sessions/" + session.id;
    bayeuxClientPath = session.rootPath + "/messaging";

    bayeux = new faye.NodeAdapter({mount: bayeuxClientPath, timeout: 1});
    bayeux.attach(httpServer);

    bayeux.addExtension({
        incoming: function (message, callback) {
            if (message.channel == "/session-owner") {
                session.logger.debug("Setting session owner to " + message.clientId);
                sessionOwnerFayeClientId = message.clientId;
            }

            callback(message);
        }
    });
    bayeux.bind("disconnect", function (clientId) {
        if (clientId == sessionOwnerFayeClientId) {
            session.logger.debug("Deleting current session (" + session.id + "), due to death of session owner " + clientId);
            session.end();
        }
    });

    session.resourceSet.append(payload.resourceSet);
    session.resourceSet.contextPath = session.rootPath + "/resources";
    session.resourceSet.createDefaultRootResourceIfNotExists();
    session.resourceSet.addScriptLoadingToRootResource();

    // TODO: should be in a separate namespace, so stuff doesn't
    // break in the unlikely event of a session containing resources
    // with names that conflict with these internal resources.
    var internalResources = [
        require.resolve("buster-core"),
        require.resolve("./browser/cross-frame"),
        require.resolve("./browser/slave-frame-load")
    ];

    for (var i = 0, ii = internalResources.length; i < ii; i++) {
        session.resourceSet.addFile(internalResources[i]);
    }

    // Prepend internalResources, they should load first.
    session.resourceSet.prependToLoad(internalResources);

    return session;
};

exports.validate = function (payload) {
    if ("resourceSet" in payload) {
        return bResourcesResourceSet.validate(payload.resourceSet);
    }
}