var when = require("when");
var when_pipeline = require("when/pipeline");
var mori = require("mori");
var rampResources = require("ramp-resources");
var convenientHttp = require("./convenient-http");
var sessionClient = require("./session-client");

var homeless = require("./homeless");
var moriObjToHashMap = homeless.moriObjToHashMap;

function createSession(rampClient, resourceSet, options) {
    var deferred = when.defer();

    if (!resourceSet) resourceSet = rampResources.createResourceSet();

    when_pipeline([
        function () {
            return resourceSet.serialize()
        },
        function (serializedResourceSet) {
            return mori.get(rampClient, "http")("POST", "/sessions", serializedResourceSet);
        }
    ]).then(
        function (e) {
            if (e.res.statusCode === 200) {
                var session = moriObjToHashMap(e.body);
                deferred.resolve(sessionClient.createSessionClientInitializer(session, mori.get(rampClient, "port"), mori.get(rampClient, "host")));
            } else {
                deferred.reject({message: e.body, code: e.res.statusCode})
            }
        },
        deferred.reject);

    return deferred.promise;
}

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

module.exports.createRampClient = function (port, host) {
    var rampClient = mori.hash_map(
        "host", host,
        "port", port,
        "http", mori.partial(convenientHttp, host, port));

    return {
        createSession: mori.partial(createSession, rampClient),
        getSlaves: mori.partial(getSlaves, rampClient)
    }
};
