var when = require("when");
var when_pipeline = require("when/pipeline");
var mori = require("mori");
var faye = require("faye");
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
            return mori.get(rampClient, "http")("POST", "/sessions", serializedResourceSet);
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

module.exports.createRampClient = function (port, host) {
    var fayeClientUrl = "http://" + (host || "127.0.0.1") + ":" + port + "/messaging";

    var rampClient = mori.hash_map(
        "host", host,
        "port", port,
        "http", mori.partial(convenientHttp, host, port),
        "fayeClient", new faye.Client(fayeClientUrl));

    return {
        createSession: mori.partial(createSession, rampClient),
        getCurrentSession: mori.partial(getCurrentSession, rampClient),
        getSlaves: mori.partial(getSlaves, rampClient),
        purgeAllCaches: mori.partial(purgeAllCaches, rampClient)
    }
};
