var mori = require("mori");
var convenientHttp = require("./convenient-http");
var fayeEventListeningUtils = require("./faye-event-listening-utils");
var homeless = require("./homeless");
var moriHashMapToObj = homeless.moriHashMapToObj;
var moriObjToHashMap = homeless.moriObjToHashMap;

function emit(sessionClient, event, data) {
    var fayeClient = mori.get(sessionClient, "fayeClient");
    var sessionClientToSlavesEventContextPath = mori.getIn(sessionClient, ["session", "sessionClientToSlavesEventContextPath"]);
    var publication = fayeEventListeningUtils.emit(fayeClient, sessionClientToSlavesEventContextPath, event, {data: data});
    return fayeEventListeningUtils.fayeCallbackToPromise(publication);
}

function on(sessionClient, event, handler) {
    var fayeClient = mori.get(sessionClient, "fayeClient");
    var slaveToSessionClientEventContextPath = mori.getIn(sessionClient, ["session", "slaveToSessionClientEventContextPath"]);

    if (handler) {
        var subscription = fayeEventListeningUtils.on(fayeClient, slaveToSessionClientEventContextPath, event, handler);
    } else {
        handler = function (e) {
            event(e.event, e);
        };
        var subscription = fayeEventListeningUtils.on(fayeClient, slaveToSessionClientEventContextPath, handler);
    }

    mori.get(sessionClient, "atoms").eventSubscriptions = mori.conj(mori.get(sessionClient, "atoms").eventSubscriptions, subscription);

    return fayeEventListeningUtils.fayeCallbackToPromise(subscription);
}

function listenToPrivateEvent(sessionClient, handler, event) {
    var fayeClient = mori.get(sessionClient, "fayeClient");
    var eventContextPath = mori.getIn(sessionClient, ["session", "privateEventContextPath"]);
    var subscription = fayeClient.subscribe(eventContextPath + event, function (e) {
        handler(e);
    });

    mori.get(sessionClient, "atoms").eventSubscriptions = mori.conj(mori.get(sessionClient, "atoms").eventSubscriptions, subscription);

    return fayeEventListeningUtils.fayeCallbackToPromise(subscription);
}

function onSlaveDeath(sessionClient, handler) {
    return listenToPrivateEvent(sessionClient, handler, "/slave_death");
}

function onSessionAbort(sessionClient, handler) {
    return listenToPrivateEvent(sessionClient, handler, "/session_abort");
}

function getSession (session) {
    return moriHashMapToObj(session);
}

function endSession (sessionClient, session) {
    mori.each(mori.get(sessionClient, "atoms").eventSubscriptions, function (s) { s.cancel() });

    var sessionUrl = mori.get(session, "sessionUrl");
    return mori.get(sessionClient, "http")("DELETE", sessionUrl);
}

function getInitialSlaves (slaves) {
    return mori.intoArray(mori.map(moriHashMapToObj, slaves));
}

function createSessionClient(sessionClient, session, slaves) {
    return {
        getSession: mori.partial(getSession, session),
        getInitialSlaves: mori.partial(getInitialSlaves, slaves),
        endSession: mori.partial(endSession, sessionClient, session),
        on: mori.partial(on, sessionClient),
        emit: mori.partial(emit, sessionClient),
        onSlaveDeath: mori.partial(onSlaveDeath, sessionClient),
        onSessionAbort: mori.partial(onSessionAbort, sessionClient)
    };
}

function initialize(sessionClient) {
    var initializeUrl = mori.getIn(sessionClient, ["session", "initializeUrl"]);
    return mori.get(sessionClient, "http")("POST", initializeUrl, {})
        .then(function (e) {
            if (e.res.statusCode === 200) {
                return createSessionClient(
                    sessionClient,
                    moriObjToHashMap(e.body.session),
                    mori.set(e.body.initialSlaves.map(moriObjToHashMap)));
            }
            throw new Error(e.body);
        });
}

module.exports.createSessionClientInitializer = function (session, port, host, fayeClient) {
    var sessionClient = mori.hashMap(
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
        endSession: mori.partial(endSession, sessionClient, session),
        initialize: mori.partial(initialize, sessionClient),
        on: mori.partial(on, sessionClient),
        emit: mori.partial(emit, sessionClient),
        onSlaveDeath: mori.partial(onSlaveDeath, sessionClient),
        onSessionAbort: mori.partial(onSessionAbort, sessionClient)
    };
};
