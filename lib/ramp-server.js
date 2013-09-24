var httpServReqListenerProxy = require("./http-server-request-listener-proxy");
var URL = require("url");
var mori = require("mori");
var faye = require("faye");
var when = require("when");
var when_pipeline = require("when/pipeline");
var rampResources = require("ramp-resources");

var rampSlave = require("./ramp-slave");
var rampSession = require("./ramp-session");
var homeless = require("./homeless");
var bufferUtils = require("./buffer-utils");
var moriHashMapToObj = homeless.moriHashMapToObj;
var NOOP = function () {};


DEFAULT_SLAVE_IDLE_RESOURCE_SET = rampResources.createResourceSet();
DEFAULT_SLAVE_IDLE_RESOURCE_SET.addResource({
    path: "/",
    content: "<p>Waiting for some work...</p>"
});

function writeJson(res, data) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
};

function listSlaves(rampServer, req, res) {
    writeJson(res, mori.into_array(
        mori.map(
            rampSlave.toPublicValue,
            mori.get(rampServer, "atoms").activeSlaves)))
};

function performCapture(rampServer, logger, req, res) {
    var slave = rampSlave.createSlave(mori.hash_map(
        "userAgent", req.headers["user-agent"],
        "header", mori.get(rampServer, "header")
    ));

    var atoms = mori.get(rampServer, "atoms");

    atoms.allSlaves = mori.assoc(atoms.allSlaves, mori.get(slave, "id"), slave);
    atoms.loadingSlaves = mori.conj(atoms.loadingSlaves, slave);
    var slaveMaxLoadTime = new Date().getTime() + mori.get(rampServer, "slaveLoadTimeHint")
    atoms.slaveHeartbeats = mori.assoc(atoms.slaveHeartbeats, mori.get(slave, "id"), slaveMaxLoadTime);

    mori.get(rampServer, "resourceMiddleware").mount(
        mori.get(slave, "chainsPath"),
        mori.get(slave, "chainsResourceSet"));

    res.writeHead(302, {"Location": mori.get(slave, "chainsPath")})
    res.end();

    logger.info("Capturing new slave.", rampSlave.toPublicValue(slave));
};

function createSession(rampServer, logger, req, res) {
    var atoms = mori.get(rampServer, "atoms");

    if (atoms.currentSession) {
        var msg = "Cannot create session, a session is already in progress";
        logger.info(msg);
        res.writeHead(409);
        res.end(msg);
        return;
    }

    logger.info("Creating new session");
    var bodyDeferred = bufferUtils.concatHttpBody(req);

    when_pipeline([
        function () { return bodyDeferred; },
        function (body) {
            try {
                return JSON.parse(body.toString("utf8"))
            } catch (e) {
                return when.reject("JSON parse error: " + e.message)
            }
        },
        function (body) {
            logger.info("Creating new session: Deserializing resource set");

            var deferred = when.defer();
            rampResources.deserialize(body.resourceSetValue).then(
                function (resourceSet) {
                    // For some reason, resolving resourceSet directly breaks
                    // when so it doesn't actually resolve. Wrapping it in an
                    // object seems to help.
                    deferred.resolve({resourceSet: resourceSet, rampClientId: body.rampClientId});
                },
                deferred.reject
            );
            return deferred.promise;
        },
        function (e) {
            logger.info("Creating new session: Inflating resource set from cache");

            var deferred = when.defer();
            // Same as above. Fails if passing resourceSet directly.
            mori.get(rampServer, "resourceCache").inflate(e.resourceSet).then(function (resourceSet) {
                deferred.resolve({resourceSet: resourceSet, rampClientId: e.rampClientId});
            }, deferred.reject)
            return deferred.promise;
        },
    ]).then(function (e) {
        var session = rampSession.createSession(e.resourceSet, e.rampClientId)
        var sessionPublicValue = rampSession.toPublicValue(session);
        atoms.rampClientHeartbeats = mori.assoc(atoms.rampClientHeartbeats, e.rampClientId, new Date().getTime());
        atoms.currentSession = session;
        writeJson(res, sessionPublicValue);

        logger.info("Creating new session: done", sessionPublicValue);
    }, function (err) {
        logger.info("Failed to create new session", err);
        res.writeHead(500);
        res.end(JSON.stringify(err));
    });
}

function initializeSession(rampServer, logger, req, res) {
    var atoms = mori.get(rampServer, "atoms");
    var activeSlaves = atoms.activeSlaves;

    if (mori.is_empty(activeSlaves)) {
        mori.get(rampServer, "atoms").currentSession = null;
        res.writeHead(400);
        var msg = "Cannot initialize session, no slaves are captured.";
        logger.info(msg);
        res.end(msg);
        return;
    }

    var session = atoms.currentSession = mori.assoc(atoms.currentSession, "slaves", activeSlaves);

    mori.get(rampServer, "resourceMiddleware").mount(
        mori.get(session, "resourcesPath"),
        mori.get(session, "resourceSet"));

    mori.each(activeSlaves, mori.partial(
        rampSlave.initializeSession,
        mori.get(rampServer, "fayeClient"),
        session));

    logger.info("Initialized session");

    writeJson(res, {
        session: rampSession.toPublicValue(session),
        initialSlaves: mori.into_array(mori.map(rampSlave.toPublicValue, activeSlaves))
    });
};

function doEndSession(rampServer, session) {
    mori.get(rampServer, "resourceMiddleware").unmount(mori.get(session, "resourcesPath"));
    delete mori.get(rampServer, "atoms").currentSession;
    mori.each(mori.get(session, "slaves"), mori.partial(rampSlave.endSession, mori.get(rampServer, "fayeClient")));
    mori.get(rampServer, "fayeClient").publish(
        mori.get(session, "privateEventContextPath") + "/session_abort",
        {});
};

function endSession(rampServer, logger, req, res) {
    var session = mori.get(rampServer, "atoms").currentSession;

    if (session) {
        logger.info("Ending session");
        doEndSession(rampServer, session);
        res.writeHead(200)
        res.end();
    } else {
        var msg = "No session currently running, cannot end current session."
        logger.info(msg);
        res.writeHead(404);
        res.end(msg);
    }
};

function getCurrentSession(rampServer, req, res) {
    var session = mori.get(rampServer, "atoms").currentSession;

    if (session) {
        writeJson(res, rampSession.toPublicValue(session));
    } else {
        res.writeHead(404);
        res.end("No session currently running.");
    }
};

function listResourceCache(rampServer, req, res) {
    writeJson(res, mori.get(rampServer, "resourceCache").resourceVersions());
};

function purgeResourceCache(rampServer, req, res) {
    mori.get(rampServer, "resourceCache").purgeAll();
    res.end();
};

function respond(rampServer, logger, req, res) {
    var atoms = mori.get(rampServer, "atoms");
    var url = URL.parse(req.url);

    if (req.method === "GET" && url.path === "/slaves") {
        listSlaves(rampServer, req, res);
        return true;
    }

    if (req.method === "GET" && url.path === "/capture") {
        performCapture(rampServer, logger, req, res)
        return true;
    }

    if (req.method === "POST" && url.path === "/sessions") {
        createSession(rampServer, logger, req, res)
        return true;
    }

    if (req.method === "GET" && url.path === "/current_session") {
        getCurrentSession(rampServer, req, res)
        return true;
    }

    if (url.path === "/resources") {
        if (req.method === "GET") {
            listResourceCache(rampServer, req, res);
            return true;
        }

        if (req.method === "DELETE") {
            purgeResourceCache(rampServer, req, res);
            return true;
        }
    }

    if (atoms.currentSession) {
        var match = rampSession.matchPathForSession(atoms.currentSession, url.path);
        if (match) {
            var segment = match[1];

            if (req.method === "POST" && segment === "/initialize") {
                initializeSession(rampServer, logger, req ,res);
                return true;
            }

            if (req.method === "DELETE" && segment === "") {
                endSession(rampServer, logger, req, res);
                return true;
            }
        }
    }

    var match = url.path.match(/^\/slaves\/([^\/]+)\/chains$/);
    if (match) {
        var slaveId = match[1];

        var slave = mori.first(
            mori.filter(
                function (slave) { return mori.get(slave, "id") === slaveId; },
                atoms.loadingSlaves));

        if (slave) {
            // Don't return - continue as normal, but mark as loaded.
            atoms.loadingSlaves = mori.disj(mori.get(rampServer, "atoms").loadingSlaves, slave);
        } else {
            // Slave is already loaded, create a new one.
            logger.info("Attemtping to load chains for slave 2nd time - creating new slave", slaveId);
            performCapture(rampServer, logger, req, res);
            return true;
        }
    }

    if (mori.get(rampServer, "resourceMiddleware").respond(req, res)) return true;
}

/**
 * heartBeats is a hashmap where the value is
 * an int for unix time.
 */
function findTimedOut(heartbeats, timeout) {
    var now = new Date().getTime();

    return mori.filter(function (heartBeat) {
        var lastSeen = mori.get(heartBeat, 1);
        return (now - lastSeen) >= timeout;
    }, heartbeats);
}

function checkRampClientTimeouts (rampServer, logger) {
    var atoms = mori.get(rampServer, "atoms");

    setTimeout(function () {
        var timedOut = findTimedOut(atoms.rampClientHeartbeats, 1000);
        var session = atoms.currentSession;

        mori.each(timedOut, function (heartBeat) {
            var rampClientId = mori.get(heartBeat, 0);
            logger.info("Ramp client timed out", rampClientId);
            atoms.rampClientHeartbeats = mori.dissoc(atoms.rampClientHeartbeats, rampClientId);
            if (mori.get(session, "rampClientId") === rampClientId) {
                logger.info("Ramp client initiated current session, ending session now.");
                doEndSession(rampServer, session);
            }
        });

        checkRampClientTimeouts(rampServer, logger);
    }, 500);
}

function attach(rampServer, logger, httpServer) {
    httpServReqListenerProxy.attach(httpServer, function (req, res) {
        if (respond(rampServer, logger, req, res)) {
            logger.info("[REQ] ", req.url, req.method);
            return true;
        }
    });
    mori.get(rampServer, "fayeAdapter").attach(httpServer);

    checkSlaveTimeouts(rampServer, logger);
    checkRampClientTimeouts(rampServer, logger);
}

function removeSlave(rampServer, slave) {
    var atoms = mori.get(rampServer, "atoms");
    atoms.slaveHeartbeats = mori.dissoc(atoms.slaveHeartbeats, mori.get(slave, "id"));
    atoms.allSlaves = mori.dissoc(atoms.allSlaves, mori.get(slave, "id"));
    atoms.activeSlaves = mori.disj(atoms.activeSlaves, slave);
    atoms.loadingSlaves = mori.disj(atoms.loadingSlaves, slave);

    if (atoms.currentSession) {
        var sessionSlaves = mori.get(atoms.currentSession, "slaves");

        if (mori.has_key(sessionSlaves, slave)) {
            atoms.currentSession = mori.assoc(
                atoms.currentSession,
                "slaves",
                mori.disj(sessionSlaves, slave));
            mori.get(rampServer, "fayeClient").publish(
                mori.get(atoms.currentSession, "privateEventContextPath") + "/slave_death",
                {slaveId: mori.get(slave, "id")});
        }
    }

    mori.get(rampServer, "resourceMiddleware").unmount(mori.get(slave, "chainsPath"));
};

function checkSlaveTimeouts(rampServer, logger) {
    var atoms = mori.get(rampServer, "atoms");
    var timeout = mori.get(rampServer, "slaveTimeoutHint");

    setTimeout(function () {
        var deadSlaves = findTimedOut(atoms.slaveHeartbeats, timeout);

        mori.each(deadSlaves, function (heartBeat) {
            var slaveId = mori.get(heartBeat, 0);
            var lastSeen = mori.get(heartBeat, 1);

            logger.info("Slave timed out", slaveId);

            var slave = mori.get(atoms.allSlaves, slaveId);
            removeSlave(rampServer, slave);
        });

        checkSlaveTimeouts(rampServer, logger);
    }, 500);
};

function onSlaveDisconnect(rampServer, logger, e) {
    var atoms = mori.get(rampServer, "atoms");
    var slave = mori.get(atoms.allSlaves, e.slaveId);

    logger.info("Slave disconnected gracefully", e.slaveId);
    if (slave) {
        removeSlave(rampServer, slave);
    }
};

function onSlaveReady(rampServer, logger, e) {
    var atoms = mori.get(rampServer, "atoms");
    var slave = mori.get(atoms.allSlaves, e.slaveId);

    logger.info("Slave is ready.", e.slaveId);
    atoms.activeSlaves = mori.conj(atoms.activeSlaves, slave);
};

function onSlaveHeartbeat(rampServer, logger, e) {
    var atoms = mori.get(rampServer, "atoms");
    var slaveId = e.slaveId;

    if (mori.has_key(atoms.allSlaves, slaveId)) {
        atoms.slaveHeartbeats = mori.assoc(atoms.slaveHeartbeats, slaveId, new Date().getTime());
    } else {
        mori.get(rampServer, "fayeClient").publish("/slaves/" + slaveId + "/recapture", {});
    }
};

function onRampClientDisconnect(rampServer, logger, e) {
    var atoms = mori.get(rampServer, "atoms");
    var rampClientId = e.rampClientId;
    var session = atoms.currentSession;

    logger.info("Ramp client disconnected gracefully", rampClientId);

    if (mori.get(session, "rampClientId") === rampClientId) {
        logger.info("Ramp client initiated current session, ending session now.");
        doEndSession(rampServer, session);
    }
};

function onRampClientHeartbeat(rampServer, logger, e) {
    var rampClientId = e.rampClientId;
    var atoms = mori.get(rampServer, "atoms");
    atoms.rampClientHeartbeats = mori.assoc(atoms.rampClientHeartbeats, rampClientId, new Date().getTime());
};

function getActiveSlaves(rampServer, logger) {
    var atoms = mori.get(rampServer, "atoms");
    return mori.into_array(mori.map(rampSlave.toPublicValue, atoms.activeSlaves));
}

module.exports.createServer = function (opts) {
    var logger = opts.logger || {debug: NOOP, info: NOOP, log: NOOP, warn: NOOP, error: NOOP};

    var fayeAdapter = new faye.NodeAdapter({
        mount: "/messaging"
    });

    if (opts.veryVeryVerbose) {
        function logFayeMessage(prefix, msg) {
            logger.debug(prefix, msg);
        }
    } else {
        function logFayeMessage(prefix, msg) {
            if (msg.subscription === "/ramp_client_heartbeat") return;
            if (msg.subscription === "/slave_heartbeat") return;
            logger.debug(prefix, msg);
        }
    }

    fayeAdapter.addExtension({
        incoming: function (msg, callback) {
            logFayeMessage("[BAYEUX IN ] ", msg);
            callback(msg);
        },
        outgoing: function (msg, callback) {
            logFayeMessage("[BAYEUX OUT] ", msg);
            callback(msg);
        }
    })

    var rampServer = mori.hash_map(
        "atoms", {
            allSlaves: mori.hash_map(),
            slaveHeartbeats: mori.hash_map(),
            activeSlaves:  mori.set(),
            loadingSlaves: mori.set(),
            rampClientHeartbeats: mori.hash_map()
        },
        "resourceMiddleware", rampResources.createMiddleware(),
        "resourceCache", rampResources.createCache(),
        "fayeAdapter", fayeAdapter,
        "fayeClient", fayeAdapter.getClient(),
        "slaveTimeoutHint", opts.slaveTimeoutHint || 10000,
        "slaveLoadTimeHint", opts.slaveLoadTimeHint || 10000
    );

    if ("header" in opts) {
        var header = opts.header;
        if (!header.resourceSet) throw new Exception("Expected header option to specify 'resourceSet'.")
        if (!header.height) throw new Exception("Expected header option to specify 'height'.")

        var headerPath = "/slave_header/";

        rampServer = mori.assoc(rampServer, "header", mori.hash_map(
            "height", header.height,
            "path", headerPath));

        mori.get(rampServer, "resourceMiddleware").mount(headerPath, rampSlave.processResourceSet(header.resourceSet));
    }

    mori.get(rampServer, "resourceMiddleware").mount("/slave_idle", opts.idleResourceSet || DEFAULT_SLAVE_IDLE_RESOURCE_SET);

    fayeAdapter.getClient().subscribe("/slave_ready", mori.partial(onSlaveReady, rampServer, logger));
    fayeAdapter.getClient().subscribe("/slave_disconnect", mori.partial(onSlaveDisconnect, rampServer, logger));
    fayeAdapter.getClient().subscribe("/slave_heartbeat", mori.partial(onSlaveHeartbeat, rampServer, logger));
    fayeAdapter.getClient().subscribe("/ramp_client_disconnect", mori.partial(onRampClientDisconnect, rampServer, logger));
    fayeAdapter.getClient().subscribe("/ramp_client_heartbeat", mori.partial(onRampClientHeartbeat, rampServer, logger));

    return {
        getSlaves: mori.partial(getActiveSlaves, rampServer, logger),
        attach: mori.partial(attach, rampServer, logger)
    }
};
