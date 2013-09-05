var when = require("when");
var when_pipeline = require("when/pipeline");
var mori = require("mori");
var faye = require("faye");
var uuid = require("node-uuid");
var rampResources = require("ramp-resources");
var convenientHttp = require("./convenient-http");
var sessionClient = require("./session-client");

var homeless = require("./homeless");
var moriObjToHashMap = homeless.moriObjToHashMap;

function createSession(rampClient, resourceSet, options) {
    var deferred = when.defer();

    options = options || {};
    if (!resourceSet) resourceSet = rampResources.createResourceSet();

    when_pipeline([
        function () {
            if (options.cache) {
                return mori.get(rampClient, "http")("GET", "/resources");
            }
        },
        function (res) {
            if (res) {
                var cacheManifest = res.body;
                return resourceSet.serialize(cacheManifest);
            } else {
                return resourceSet.serialize()
            }
        },
        function (serializedResourceSet) {
            return mori.get(rampClient, "http")("POST", "/sessions", {
                resourceSetValue: serializedResourceSet,
                rampClientId: mori.get(rampClient, "id")
            });
        }
    ]).then(
        function (e) {
            if (e.res.statusCode === 200) {
                var session = moriObjToHashMap(e.body);
                deferred.resolve(sessionClient.createSessionClientInitializer(session, mori.get(rampClient, "port"), mori.get(rampClient, "host"), mori.get(rampClient, "fayeClient")));
            } else {
                deferred.reject({message: e.body, code: e.res.statusCode})
            }
        },
        deferred.reject);

    return deferred.promise;
}

function getCurrentSession(rampClient) {
    var deferred = when.defer();
    mori.get(rampClient, "http")("GET", "/current_session").then(
        function (e) {
            if (e.res.statusCode === 200) {
                deferred.resolve(e.body);
            } else if (e.res.statusCode === 404) {
                deferred.resolve(null);
            } else {
                deferred.reject({message: e.body, code: e.res.statusCode})
            }
        },
        deferred.reject
    );
    return deferred.promise;
};

function getSlaves(rampClient) {
    var deferred = when.defer();
    mori.get(rampClient, "http")("GET", "/slaves").then(
        function (e) {
            if (e.res.statusCode === 200) {
                deferred.resolve(e.body);
            } else {
                deferred.reject({message: e.body, code: e.res.statusCode});
            }
        },
        deferred.reject);
    return deferred.promise;
}

function purgeAllCaches(rampClient) {
    var deferred = when.defer();
    mori.get(rampClient, "http")("DELETE", "/resources").then(
        function (e) {
            if (e.res.statusCode === 200) {
                deferred.resolve();
            } else {
                deferred.reject({message: e.body, code: e.res.statusCode});
            }
        },
        deferred.reject);
    return deferred.promise;
};

function sendHeartbeat(rampClient) {
    var fayeClient = mori.get(rampClient, "fayeClient");
    fayeClient.publish("/ramp_client_heartbeat", {
        rampClientId: mori.get(rampClient, "id")
    });
};

function gracefulExit (rampClient) {
    var fayeClient = mori.get(rampClient, "fayeClient");

    var publication = fayeClient.publish("/ramp_client_disconnect", {
        rampClientId: mori.get(rampClient, "id")
    });

    publication.callback(function () {
        process.exit();
    });

    publication.errback(function () {
        process.exit();
    });
};

function destroy(rampClient, heartbeatInterval, processSigintListener) {
    clearInterval(heartbeatInterval);
    process.removeListener("SIGINT", processSigintListener);
    mori.get(rampClient, "fayeClient").disconnect();
};

module.exports.createRampClient = function (port, host) {
    var fayeClientUrl = "http://" + (host || "127.0.0.1") + ":" + port + "/messaging";

    var rampClient = mori.hash_map(
        "id", uuid(),
        "host", host,
        "port", port,
        "http", mori.partial(convenientHttp, host, port),
        "fayeClient", new faye.Client(fayeClientUrl));

    var heartbeatInterval = setInterval(mori.partial(sendHeartbeat, rampClient), 250);

    process.stdin.resume();
    var processSigintListener = mori.partial(gracefulExit, rampClient);
    process.on("SIGINT", processSigintListener);

    return {
        createSession: mori.partial(createSession, rampClient),
        getCurrentSession: mori.partial(getCurrentSession, rampClient),
        getSlaves: mori.partial(getSlaves, rampClient),
        purgeAllCaches: mori.partial(purgeAllCaches, rampClient),
        destroy: mori.partial(destroy, rampClient, heartbeatInterval, processSigintListener)
    }
};
