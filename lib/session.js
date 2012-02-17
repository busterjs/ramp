var buster = require("buster-core");
var faye = require("faye");
var uuid = require("node-uuid");
var when = require("when");
var bResourcesResourceSet = require("buster-resources").resourceSet;

var internalResources = [
    require.resolve("buster-core"),
    require.resolve("./browser/slave-frame-load")
];

exports.create = function (payload, httpServer) {
    var bayeux;
    var bayeuxClientPath;
    var sessionOwnerFayeClientId;
    var ended = false;
    var sessionCreateDeferred = when.defer();

    var session = buster.extend(buster.eventEmitter.create(), {
        respond: function (req, res, pathname) {
            if (pathname == this.path && req.method == "DELETE") {
                this.logger.info("Destroying session via HTTP");
                this.end();
                res.writeHead(200);
                res.end();
                return true;
            }
        },

        end: function () {
            if (ended) return;
            ended = true;

            // TODO: Tear down and disconnect this._bayeux.
            this.logger.debug("Ending session " + this.id);
            this.emit("end");
        },

        serialize: function () {
            return {
                id: this.id,
                path: this.path,
                bayeuxClientPath: bayeuxClientPath,
                resourcesPath: this.resourcesPath
            };
        }
    });

    session.joinable = ("joinable" in payload) ? !!payload.joinable : true,
    session.id = uuid();
    session.path = "/sessions/" + session.id;
    if (payload.sharedResourcePath) {
        session.resourcesPath = "/sessions/current";
    } else {
        session.resourcesPath = session.path + "/resources";
    }
    bayeuxClientPath = session.path + "/messaging";

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

    bResourcesResourceSet.deserialize(payload.resourceSet).then(function (rs) {
        session.resourceSet = rs;
        // TODO: these files should be namespaced somehow, so they
        // are guaranteed to never conflict with files in the resource
        // set.
        var promises = [];
        promises = promises.concat(internalResources.map(function (path) {
            return rs.addFileResource(path);
        }));

        when.all(promises).then(function () {
            rs.loadPath.prepend(internalResources);

            // Make sure it's asynchronous.
            process.nextTick(function () {
                session.ready = true;
                sessionCreateDeferred.resolve(session);
            });
        });
    }, function (err) {
        sessionCreateDeferred.reject(err);
    });

    return sessionCreateDeferred.promise;
};