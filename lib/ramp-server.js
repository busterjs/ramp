var httpServReqListenerProxy = require("./http-server-request-listener-proxy");
var URL = require("url");
var uuid = require("node-uuid");
var mori = require("mori");

var homeless = require("./homeless");
var moriHashMapToObj = homeless.moriHashMapToObj;

function writeJson(res, data) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
}

function listSlaves(rampServer, req, res) {
    writeJson(res, mori.into_array(mori.map(moriHashMapToObj, rampServer.slaves)))
};

function performCapture(rampServer, req, res) {
    var ua = req.headers["user-agent"];
    var slaveId = uuid();

    var slave = mori.hash_map(
        "id", slaveId,
        "prisonPath", "/slave/" + slaveId + "/prison",
        "userAgent", ua);

    rampServer.slaves = mori.conj(rampServer.slaves, slave)

    res.writeHead(302, {"Location": slave.prisonPath})
    res.end();
};

function createSession(rampServer, req, res) {
    if (rampServer.currentSession) {
        res.writeHead(409);
        res.end("A session is already in progress.");
        return;
    }

    var sessionId = uuid();
    var contextPath = "/sessions/" + sessionId;
    var session = mori.hash_map(
        "id", sessionId,
        "initializeUrl", contextPath + "/initialize");

    rampServer.currentSession = session;

    writeJson(res, moriHashMapToObj(session));
}

function initializeSession(rampServer, req, res) {
    if (mori.is_empty(rampServer.slaves)) {
        res.writeHead(418);
        res.end("Cannot initialize session, no slaves are captured.");
        return;
    }

    mori.each(rampServer.slaves, function (slave) {
    });

    writeJson(res, {
        session: moriHashMapToObj(rampServer.currentSession),
        slaves: mori.into_array(mori.map(moriHashMapToObj, rampServer.slaves))
    });
};

function showTestBed(rampServer, req, res) {
    res.writeHead(200, {"Content-Type": "text/html"});
    res.end("OMG;;;");
};

var createSessionPathRegexp = homeless.memoizeSingleton(function (session) {
    return new RegExp("^\\/sessions\\/" + mori.get(session, "id") + "(.*)$");
});

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

    if (rampServer.currentSession) {
        var pathRe = createSessionPathRegexp(mori.hash(rampServer.currentSession), rampServer.currentSession);
        var match = url.path.match(pathRe);
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
}

function attach(rampServer, httpServer) {
    httpServReqListenerProxy.attach(httpServer, mori.partial(respond, rampServer));
}


module.exports.createRampServer = function () {
    var rampServer = {
        slaves: mori.set(),
    };

    return {
        getSlaves: function () { return mori.into_array(mori.map(moriHashMapToObj, rampServer.slaves)); },
        attach: mori.partial(attach, rampServer)
    }
};
