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
var moriHashMapToObj = homeless.moriHashMapToObj;

function writeJson(res, data) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
}

function concatBody(req, res) {
    var deferred = when.defer();
    var body = "";
    req.setEncoding("utf8");
    req.on("data", function (chunk) { body += chunk; });
    req.on("end", function () {
        try {
            deferred.resolve(JSON.parse(body));
        } catch (e) { deferred.reject(e); }
    })
    return deferred.promise;
};

function listSlaves(rampServer, req, res) {
    writeJson(res, mori.into_array(
        mori.map(
            rampSlave.toPublicValue,
            mori.get(rampServer, "atoms").activeSlaves)))
};

function performCapture(rampServer, req, res) {
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
};

function createSession(rampServer, req, res) {
    var atoms = mori.get(rampServer, "atoms");

    if (atoms.currentSession) {
        res.writeHead(409);
        res.end("A session is already in progress.");
        return;
    }

    when_pipeline([
        mori.partial(concatBody, req, res),
        function (resourceSetValue) {
            var deferred = when.defer();
            rampResources.deserialize(resourceSetValue).then(
                function (resourceSet) {
                    // For some reason, resolving resourceSet directly breaks
                    // when so it doesn't actually resolve. Wrapping it in an
                    // object seems to help.
                    deferred.resolve({resourceSet: resourceSet});
                },
                deferred.reject
            );
            return deferred.promise;
        },
        function (e) {
            var deferred = when.defer();
            // Same as above. Fails if passing resourceSet directly.
            mori.get(rampServer, "resourceCache").inflate(e.resourceSet).then(function (resourceSet) {
                deferred.resolve({resourceSet: resourceSet});
            }, deferred.reject)
            return deferred.promise;
        },
    ]).then(function (e) {
        var session = rampSession.createSession(e.resourceSet)
        atoms.currentSession = session;
        writeJson(res, rampSession.toPublicValue(session));
    }, function () {
        res.writeHead(500);
        res.end();
    });
}

function initializeSession(rampServer, req, res) {
    var atoms = mori.get(rampServer, "atoms");
    var activeSlaves = atoms.activeSlaves;

    if (mori.is_empty(activeSlaves)) {
        mori.get(rampServer, "atoms").currentSession = null;
        res.writeHead(418);
        res.end("Cannot initialize session, no slaves are captured.");
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

    writeJson(res, {
        session: rampSession.toPublicValue(session),
        slaves: mori.into_array(mori.map(rampSlave.toPublicValue, activeSlaves))
    });
};

function endSession(rampServer, req, res) {
    var session = mori.get(rampServer, "atoms").currentSession;

    if (session) {
        mori.get(rampServer, "resourceMiddleware").unmount(mori.get(session, "resourcesPath"));
        delete mori.get(rampServer, "atoms").currentSession;
        mori.each(mori.get(session, "slaves"), mori.partial(rampSlave.endSession, mori.get(rampServer, "fayeClient")));
        res.writeHead(200)
        res.end();
    } else {
        res.writeHead(404);
        res.end("No session found, cannot end.");
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

function showSlaveIdle(rampServer, req, res) {
    res.end("Idle...");
}

function listResourceCache(rampServer, req, res) {
    writeJson(res, mori.get(rampServer, "resourceCache").resourceVersions());
};

function purgeResourceCache(rampServer, req, res) {
    mori.get(rampServer, "resourceCache").purgeAll();
    res.end();
};

function respond(rampServer, req, res) {
    var atoms = mori.get(rampServer, "atoms");
    var url = URL.parse(req.url);

    if (req.method === "GET" && url.path === "/slaves") {
        listSlaves(rampServer, req, res);
        return true;
    }

    if (req.method === "GET" && url.path === "/slave_idle") {
        showSlaveIdle(rampServer, req, res);
        return true;
    }

    if (req.method === "GET" && url.path === "/capture") {
        performCapture(rampServer, req, res)
        return true;
    }

    if (req.method === "POST" && url.path === "/sessions") {
        createSession(rampServer, req, res)
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
                initializeSession(rampServer, req ,res);
                return true;
            }

            if (req.method === "DELETE" && segment === "") {
                endSession(rampServer, req, res);
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
            performCapture(rampServer, req, res);
            return true;
        }
    }

    if (mori.get(rampServer, "resourceMiddleware").respond(req, res)) return true;
}

function attach(rampServer, httpServer) {
    httpServReqListenerProxy.attach(httpServer, mori.partial(respond, rampServer));
    mori.get(rampServer, "fayeAdapter").attach(httpServer);
}

function removeSlave(rampServer, slave) {
    var atoms = mori.get(rampServer, "atoms");
    atoms.slaveHeartbeats = mori.dissoc(atoms.slaveHeartbeats, mori.get(slave, "id"));
    atoms.allSlaves = mori.dissoc(atoms.allSlaves, mori.get(slave, "id"));
    atoms.activeSlaves = mori.disj(atoms.activeSlaves, slave);
    atoms.loadingSlaves = mori.disj(atoms.loadingSlaves, slave);

    mori.get(rampServer, "resourceMiddleware").unmount(mori.get(slave, "chainsPath"));
};

function checkSlaveTimeouts(rampServer) {
    var atoms = mori.get(rampServer, "atoms");
    var timeout = mori.get(rampServer, "slaveTimeoutHint");

    setTimeout(function () {
        var now = new Date().getTime();

        var deadSlaves = mori.filter(function (heartBeat) {
            var slaveId = mori.get(heartBeat, 0);
            var lastSeen = mori.get(heartBeat, 1);

            return (now - lastSeen) >= timeout;
        }, atoms.slaveHeartbeats);

        mori.each(deadSlaves, function (heartBeat) {
            var slaveId = mori.get(heartBeat, 0);
            var lastSeen = mori.get(heartBeat, 1);

            var slave = mori.get(atoms.allSlaves, slaveId);
            removeSlave(rampServer, slave);
        });

        checkSlaveTimeouts(rampServer);
    }, 500);
};


module.exports.createRampServer = function (opts) {
    var fayeAdapter = new faye.NodeAdapter({
        mount: "/messaging"
    });
    var atoms = {};

    var rampServer = mori.hash_map(
        "atoms", atoms,
        "resourceMiddleware", rampResources.createMiddleware(),
        "resourceCache", rampResources.createCache(),
        "fayeAdapter", fayeAdapter,
        "fayeClient", fayeAdapter.getClient(),
        "slaveTimeoutHint", opts.slaveTimeoutHint || 10000,
        "slaveLoadTimeHint", opts.slaveLoadTimeHint || 10000
    );

    atoms.allSlaves = mori.hash_map();
    atoms.slaveHeartbeats = mori.hash_map();
    atoms.activeSlaves = mori.set();
    atoms.loadingSlaves = mori.set();

    fayeAdapter.getClient().subscribe("/slave_ready", function (e) {
        var slave = mori.get(atoms.allSlaves, e.slaveId);
        atoms.activeSlaves = mori.conj(atoms.activeSlaves, slave);
    });

    fayeAdapter.getClient().subscribe("/slave_disconnect", function (e) {
        var slave = mori.get(atoms.allSlaves, e.slaveId);
        removeSlave(rampServer, slave);
    });

    fayeAdapter.getClient().subscribe("/slave_heartbeat", function (e) {
        var slaveId = e.slaveId;

        if (mori.has_key(atoms.allSlaves, slaveId)) {
            atoms.slaveHeartbeats = mori.assoc(atoms.slaveHeartbeats, slaveId, new Date().getTime());
        } else {
            mori.get(rampServer, "fayeClient").publish("/slave/" + slaveId + "/recapture", {});
        }
    });

    checkSlaveTimeouts(rampServer);

    return {
        getSlaves: function () { return mori.into_array(mori.map(rampSlave.toPublicValue, atoms.activeSlaves)); },
        attach: mori.partial(attach, rampServer)
    }
};
