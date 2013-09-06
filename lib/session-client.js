var when = require("when");
var mori = require("mori");
var faye = require("faye");
var convenientHttp = require("./convenient-http");
var fayeEventListeningUtils = require("./faye-event-listening-utils");
var homeless = require("./homeless");
var moriHashMapToObj = homeless.moriHashMapToObj;
var moriObjToHashMap = homeless.moriObjToHashMap;

function emit(sessionClient, event, data) {
    var fayeClient = mori.get(sessionClient, "fayeClient");
    var eventContextPath = mori.get_in(sessionClient, ["session", "eventContextPath"]);
    var publication = fayeEventListeningUtils.emit(fayeClient, eventContextPath, event, {data: data});
    return fayeEventListeningUtils.fayeCallbackToPromise(publication);
};

function on(sessionClient, event, handler) {
    var fayeClient = mori.get(sessionClient, "fayeClient");
    var eventContextPath = mori.get_in(sessionClient, ["session", "eventContextPath"]);
    var subscription = fayeEventListeningUtils.on(fayeClient, eventContextPath, event, handler);

    mori.get(sessionClient, "atoms").eventSubscriptions = mori.conj(mori.get(sessionClient, "atoms").eventSubscriptions, subscription);

    return fayeEventListeningUtils.fayeCallbackToPromise(subscription);
}

function onSlaveDeath(sessionClient, handler) {
    var fayeClient = mori.get(sessionClient, "fayeClient");
    var eventContextPath = mori.get_in(sessionClient, ["session", "privateEventContextPath"]);
    var subscription = fayeClient.subscribe(eventContextPath + "/slave_death", function (e) {
        handler(e);
    });

    mori.get(sessionClient, "atoms").eventSubscriptions = mori.conj(mori.get(sessionClient, "atoms").eventSubscriptions, subscription);

    return fayeEventListeningUtils.fayeCallbackToPromise(subscription);
};

function getSession (session) {
    return moriHashMapToObj(session);
};

function endSession (sessionClient, session) {
    var deferred = when.defer();

    mori.each(mori.get(sessionClient, "atoms").eventSubscriptions, function (s) { s.cancel() });

    var sessionUrl = mori.get(session, "sessionUrl");
    mori.get(sessionClient, "http")("DELETE", sessionUrl).then(
        function () {
            deferred.resolve()
        },
        deferred.reject
    );

    return deferred.promise;
};

function getSlaves (slaves) {
    return mori.into_array(mori.map(moriHashMapToObj, slaves));
};

function createSessionClient(sessionClient, session, slaves) {
    return {
        getSession: mori.partial(getSession, session),
        getSlaves: mori.partial(getSlaves, slaves),
        endSession: mori.partial(endSession, sessionClient, session),
        on: mori.partial(on, sessionClient),
        emit: mori.partial(emit, sessionClient),
        onSlaveDeath: mori.partial(onSlaveDeath, sessionClient)
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
                deferred.reject({message: e.body})
            }
        },
        deferred.reject
    );

    return deferred.promise;
};

module.exports.createSessionClientInitializer = function (session, port, host, fayeClient) {
    var sessionClient = mori.hash_map(
        "host", host,
        "port", port,
        "session", session,
        "http", mori.partial(convenientHttp, host, port),
        "fayeClient", fayeClient,
        "atoms", {
            eventSubscriptions: mori.set()
        });

    return {
        getSession: mori.partial(getSession, session),
        initialize: mori.partial(initialize, sessionClient),
        on: mori.partial(on, sessionClient),
        emit: mori.partial(emit, sessionClient),
        onSlaveDeath: mori.partial(onSlaveDeath, sessionClient)
    };
};
