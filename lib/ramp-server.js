var httpServReqListenerProxy = require("./http-server-request-listener-proxy");
var URL = require("url");
var mori = require("mori");
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
    writeJson(res, mori.into_array(mori.map(rampSlave.toPublicValue, mori.get(rampServer, "atoms").slaves)))
};

function performCapture(rampServer, req, res) {
    var slave = rampSlave.createSlave(req.headers["user-agent"]);
    mori.get(rampServer, "atoms").slaves = mori.conj(mori.get(rampServer, "atoms").slaves, slave)
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
    if (mori.is_empty(mori.get(rampServer, "atoms").slaves)) {
        res.writeHead(418);
        res.end("Cannot initialize session, no slaves are captured.");
        return;
    }

    mori.each(mori.get(rampServer, "atoms").slaves, mori.partial(rampSlave.initializeSession, mori.get(rampServer, "atoms").currentSession));

    writeJson(res, {
        session: rampSession.toPublicValue(mori.get(rampServer, "atoms").currentSession),
        slaves: mori.into_array(mori.map(rampSlave.toPublicValue, mori.get(rampServer, "atoms").slaves))
    });
};

function showTestBed(rampServer, req, res) {
    res.writeHead(200, {"Content-Type": "text/html"});
    res.end("OMG;;;");
};

function showSlaveChains(slave, req, res) {
    res.writeHead(200, {"Content-Type": "text/html"});
    res.end("OMG!!!");
};

function respond(rampServer, req, res) {
    var url = URL.parse(req.url);

    if (req.method === "GET" && url.path === "/slaves") {
        listSlaves(rampServer, req, res);
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

    if (mori.get(rampServer, "atoms").currentSession) {
        var match = rampSession.matchPathForSession(mori.get(rampServer, "atoms").currentSession, url.path);
        if (match) {
            var segment = match[1];

            if (req.method === "POST" && segment === "/initialize") {
                initializeSession(rampServer, req ,res);
                return true;
            }

            if (req.method === "GET" && segment === "/testbed") {
                showTestBed(rampServer, req, res);
                return true;
            }
        }
    }

    var slaveMatch = mori.some(function (slave) {
        var match = rampSlave.matchPathForSlave(url.path, slave);
        if (match) {
            return mori.hash_map("match", match, "slave", slave);
        }
    }, mori.get(rampServer, "atoms").slaves);

    if (slaveMatch) {
        var match = mori.get(slaveMatch, "match");
        var slave = mori.get(slaveMatch, "slave");
        var segment = match[1];

        if (req.method === "GET" && segment === "/chains") {
            showSlaveChains(slave, req, res);
            return true;
        }
    }
}

function attach(rampServer, httpServer) {
    httpServReqListenerProxy.attach(httpServer, mori.partial(respond, rampServer));
}


module.exports.createRampServer = function () {
    var rampServer = mori.hash_map(
        "atoms", {}
    );

    mori.get(rampServer, "atoms").slaves = mori.set();

    return {
        getSlaves: function () { return mori.into_array(mori.map(rampSlave.toPublicValue, mori.get(rampServer, "atoms").slaves)); },
        attach: mori.partial(attach, rampServer)
    }
};
