var when = require("when");
var mori = require("mori");
var faye = require("faye");
var convenientHttp = require("./convenient-http");
var homeless = require("./homeless");
var moriHashMapToObj = homeless.moriHashMapToObj;
var moriObjToHashMap = homeless.moriObjToHashMap;


var VALID_FAYE_CHARS = /^[a-z0-9\-\_\!\~\(\)\$\@]+$/i
function escapeEventName(n) {
    n = n.replace(/\-/g, "--");

    var characters = n.split("");
    var result = [];
    for (var i = 0, ii = characters.length; i < ii; i++) {
        var c = characters[i];
        if (VALID_FAYE_CHARS.test(c)) {
            result[i] = c;
        } else {
            result[i] = "-" + c.charCodeAt(0);
        }
    }

    return result.join("");
};

function on(sessionClient) {
    var fayeClient = mori.get(sessionClient, "fayeClient");
    var session = mori.get(sessionClient, "session")
    var eventContextPath = "/sessions/" + mori.get(session, "id");

    if (arguments.length === 2) {
        var event = eventContextPath + "/*";
        var handler = arguments[1];
    } else if (arguments.length === 3) {
        var event = eventContextPath + "/" + escapeEventName(arguments[1]);
        var handler = arguments[2];
    } else {
        throw new Exception("Unexpected number of arguments passed to 'on'.");
    }

    var deferred = when.defer();
    var subscription = fayeClient.subscribe(event, handler);
    subscription.callback(deferred.resolve);
    subscription.errback(deferred.reject);

    mori.get(sessionClient, "atoms").eventSubscriptions = mori.conj(mori.get(sessionClient, "atoms").eventSubscriptions, subscription);

    return deferred.promise;
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
        on: mori.partial(on, sessionClient)
    };
};
