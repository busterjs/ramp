var buster = require("buster-core");
var faye = require("buster-faye");
var uuid = require("node-uuid");
var when = require("when");
var bResourcesResourceSet = require("buster-resources").resourceSet;

var internalResources = [
    require.resolve("buster-core"),
    require.resolve("./browser/slave-frame-load")
];

exports.create = function (payload, bayeuxServer) {
    var bayeuxContextPath;
    var sessionOwnerFayeClientId;
    var ended = false;
    var sessionCreateDeferred = when.defer();

    var session = buster.extend(buster.eventEmitter.create(), {
        respond: function (req, res, pathname) {
            if (pathname == this.path && req.method == "DELETE") {
                this.end();
                res.writeHead(200);
                res.end();
                return true;
            }
        },

        end: function () {
            if (ended) return;
            ended = true;

            this.emit("end");
        },

        serialize: function () {
            return {
                id: this.id,
                path: this.path,
                bayeuxContextPath: bayeuxContextPath,
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
    bayeuxContextPath = session.path + "/messaging";

    bResourcesResourceSet.deserialize(payload.resourceSet).then(function (rs) {
        session.resourceSet = rs;
        // TODO: these files should be namespaced somehow, so they
        // are guaranteed to never conflict with files in the resource
        // set.
        var slaveResourcesName = "/buster-capture-server-internals.js";
        var promises = [];
        promises = promises.concat(internalResources.map(function (path) {
            return rs.addFileResource(path);
        }));
        promises.push(rs.addResource({
            path: slaveResourcesName,
            combine: internalResources
        }));

        when.all(promises).then(function () {
            rs.loadPath.prepend(slaveResourcesName);

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