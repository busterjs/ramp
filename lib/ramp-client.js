var when_pipeline = require("when/pipeline");
var mori = require("mori");
var faye = require("faye");
var uuid = require("uuid");
var rampResources = require("ramp-resources");
var convenientHttp = require("./convenient-http");
var sessionClient = require("./session-client");

var homeless = require("./homeless");
var moriObjToHashMap = homeless.moriObjToHashMap;

function newRequestError(body, statusCode) {
    var err = new Error(body);
    err.code = statusCode;
    return err;
}

function createSession(rampClient, resourceSet, options) {

    options = options || {};
    if (!resourceSet) resourceSet = rampResources.createResourceSet();

    return when_pipeline([
        function () {
            if (options.cache) {
                delete options.cache;
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
                rampClientId: mori.get(rampClient, "id"),
                options: options
            });
        }
    ]).then(function (e) {
            if (e.res.statusCode === 200) {
                var session = moriObjToHashMap(e.body);
                return sessionClient.createSessionClientInitializer(session, mori.get(rampClient, "port"), mori.get(rampClient, "host"), mori.get(rampClient, "fayeClient"));
            }
        throw newRequestError(e.body, e.res.statusCode);
        });
}

function getCurrentSession(rampClient) {
    return mori.get(rampClient, "http")("GET", "/current_session")
        .then(function (e) {
            if (e.res.statusCode === 200) {
                return e.body;
            }
            if (e.res.statusCode === 404) {
                return null;
            }

            throw newRequestError(e.body, e.res.statusCode);
        });
}

function getSlaves(rampClient) {
    return mori.get(rampClient, "http")("GET", "/slaves")
        .then(function (e) {
            if (e.res.statusCode === 200) {
                return e.body;
            }
            throw newRequestError(e.body, e.res.statusCode);
        });
}

function purgeAllCaches(rampClient) {
    return mori.get(rampClient, "http")("DELETE", "/resources")
        .then(function (e) {
            if (e.res.statusCode === 200) {
                return;
            }
            throw newRequestError(e.body, e.res.statusCode);
        });
}

function sendHeartbeat(rampClient) {
    var fayeClient = mori.get(rampClient, "fayeClient");
    fayeClient.publish("/ramp_client_heartbeat", {
        rampClientId: mori.get(rampClient, "id")
    });
}

function destroy(rampClient, heartbeatInterval, callback) {
    clearInterval(heartbeatInterval);
    var fayeClient = mori.get(rampClient, "fayeClient");

    function onDestroyed() {
        fayeClient.disconnect();
        if (callback) callback();
    }

    var publication = fayeClient.publish("/ramp_client_disconnect", {
        rampClientId: mori.get(rampClient, "id")
    });

    publication.callback(function () {
        onDestroyed();
    });

    publication.errback(function () {
        onDestroyed();
    });

    publication.timeout(function () {
        onDestroyed();
    });
}

module.exports.createRampClient = function (port, host) {
    var fayeClientUrl = "http://" + (host || "127.0.0.1") + ":" + port + "/messaging";

    var rampClient = mori.hashMap(
        "id", uuid(),
        "host", host,
        "port", port,
        "http", mori.partial(convenientHttp, host, port),
        "fayeClient", new faye.Client(fayeClientUrl));

    var heartbeatInterval = setInterval(mori.partial(sendHeartbeat, rampClient), 250);

    return {
        createSession: mori.partial(createSession, rampClient),
        getCurrentSession: mori.partial(getCurrentSession, rampClient),
        getSlaves: mori.partial(getSlaves, rampClient),
        purgeAllCaches: mori.partial(purgeAllCaches, rampClient),
        destroy: mori.partial(destroy, rampClient, heartbeatInterval)
    }
};
