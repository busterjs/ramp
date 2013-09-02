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
    req.on("data", function (chunk) {
        body += chunk;
    })
    req.on("end", function () {
        if (req.headers["content-type"] === "application/json") {
            try {
                deferred.resolve(JSON.parse(body));
            } catch (e) {
                res.writeHead(400);
                res.end("JSON parse error: " + e.message);
            }
        } else {
            deferred.resolve(body);
        }
        deferred.resolve(body)
    })
    return deferred.promise;
};

function listSlaves(rampServer, req, res) {
    writeJson(res, mori.into_array(mori.map(rampSlave.toPublicValue, mori.get(rampServer, "atoms").activeSlaves)))
};

function performCapture(rampServer, req, res) {
    var slave = rampSlave.createSlave(mori.hash_map(
        "userAgent", req.headers["user-agent"],
        "header", mori.get(rampServer, "header")
    ));

    mori.get(rampServer, "atoms").allSlaves = mori.assoc(mori.get(rampServer, "atoms").allSlaves, mori.get(slave, "id"), slave);
    mori.get(rampServer, "atoms").loadingSlaves = mori.conj(mori.get(rampServer, "atoms").loadingSlaves, slave);

    mori.get(rampServer, "resourceMiddleware").mount(
        mori.get(slave, "chainsPath"),
        mori.get(slave, "chainsResourceSet")
    );

    res.writeHead(302, {"Location": mori.get(slave, "chainsPath")})
    res.end();
};

function createSession(rampServer, req, res) {
    if (mori.get(rampServer, "atoms").currentSession) {
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
        mori.get(rampServer, "atoms").currentSession = session;
        writeJson(res, rampSession.toPublicValue(session));
    }, function () {
        res.writeHead(500);
        res.end();
    });
}

function initializeSession(rampServer, req, res) {
    var slaves = mori.get(rampServer, "atoms").activeSlaves;

    if (mori.is_empty(slaves)) {
        res.writeHead(418);
        res.end("Cannot initialize session, no slaves are captured.");
        return;
    }

    var session = (mori.get(rampServer, "atoms").currentSession = mori.assoc(mori.get(rampServer, "atoms").currentSession, "slaves", slaves));

    mori.get(rampServer, "resourceMiddleware").mount(mori.get(session, "resourcesPath"), mori.get(session, "resourceSet"));
    mori.each(slaves, mori.partial(rampSlave.initializeSession, mori.get(rampServer, "fayeClient"), session));

    writeJson(res, {
        session: rampSession.toPublicValue(session),
        slaves: mori.into_array(mori.map(rampSlave.toPublicValue, slaves))
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

    if (mori.get(rampServer, "atoms").currentSession) {
        var match = rampSession.matchPathForSession(mori.get(rampServer, "atoms").currentSession, url.path);
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

        var slave = mori.first(mori.filter(function (slave) { return mori.get(slave, "id") === slaveId; }, mori.get(rampServer, "atoms").loadingSlaves));

        if (slave) {
            // Don't return - continue as normal, but mark as loaded.
            mori.get(rampServer, "atoms").loadingSlaves = mori.disj(mori.get(rampServer, "atoms").loadingSlaves, slave);
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


module.exports.createRampServer = function () {
    var fayeAdapter = new faye.NodeAdapter({
        mount: "/messaging"
    });

    var rampServer = mori.hash_map(
        "atoms", {},
        "resourceMiddleware", rampResources.createMiddleware(),
        "resourceCache", rampResources.createCache(),
        "fayeAdapter", fayeAdapter,
        "fayeClient", fayeAdapter.getClient()
    );

    mori.get(rampServer, "atoms").allSlaves = mori.hash_map();
    mori.get(rampServer, "atoms").activeSlaves = mori.set();
    mori.get(rampServer, "atoms").loadingSlaves = mori.set();

    fayeAdapter.getClient().subscribe("/slave_ready", function (e) {
        var slave = mori.get(mori.get(rampServer, "atoms").allSlaves, e.slaveId);
        var slave = mori.assoc(slave, "fayeClientId", e.fayeClientId);

        mori.get(rampServer, "atoms").activeSlaves = mori.conj(mori.get(rampServer, "atoms").activeSlaves, slave)
    });

    return {
        getSlaves: function () { return mori.into_array(mori.map(rampSlave.toPublicValue, mori.get(rampServer, "atoms").activeSlaves)); },
        attach: mori.partial(attach, rampServer)
    }
};
