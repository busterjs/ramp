var when = require("when");
var mori = require("mori");
var convenientHttp = require("./convenient-http");
var homeless = require("./homeless");
var moriHashMapToObj = homeless.moriHashMapToObj;
var moriObjToHashMap = homeless.moriObjToHashMap;

function on(sessionClient) {
    if (arguments.length === 2) {
        var handler = arguments[1];
        return;
    }

    if (arguments.length === 3) {
        var event = arguments[1];
        var handler = arguments[2];
        return;
    }

    throw new Exception("Unexpected number of arguments passed to 'on'.");
};

function emit(sessionClient, event, data) {
};

function getSession (session) {
    return moriHashMapToObj(session);
};

function getSlaves (slaves) {
    return mori.into_array(mori.map(moriHashMapToObj, slaves));
};

function createSessionClient(sessionClient, session, slaves) {
    return {
        getSession: mori.partial(getSession, session),
        getSlaves: mori.partial(getSlaves, slaves),
        on: mori.partial(on, sessionClient),
        emit: mori.partial(emit, sessionClient)
    };
};

function initialize(sessionClient) {
    var deferred = when.defer();
    var initializeUrl = mori.get_in(sessionClient, ["session", "initializeUrl"]);
    mori.get(sessionClient, "http")("POST", initializeUrl, {}).then(
        function (e) {
            if (e.res.statusCode === 200) {
                deferred.resolve(createSessionClient(
                    sessionClient,
                    moriObjToHashMap(e.body.session),
                    mori.set(e.body.slaves.map(moriObjToHashMap))));
            } else {
                deferred.reject(e.body)
            }
        },
        deferred.reject
    );

    return deferred.promise;
};

module.exports.createSessionClientInitializer = function (session, port, host) {
    var sessionClient = mori.hash_map(
        "host", host,
        "port", port,
        "session", session,
        "http", mori.partial(convenientHttp, host, port),
        "fayeClient", "No faye client yet");

    return {
        getSession: mori.partial(getSession, session),
        initialize: mori.partial(initialize, sessionClient),
        on: mori.partial(on, sessionClient)
    };
};
