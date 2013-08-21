var httpServReqListenerProxy = require("./http-server-request-listener-proxy");
var URL = require("url");
var mori = require("mori");

var rampSlave = require("./ramp-slave");
var rampSession = require("./ramp-session");
var homeless = require("./homeless");
var moriHashMapToObj = homeless.moriHashMapToObj;

function writeJson(res, data) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
}

function listSlaves(rampServer, req, res) {
    writeJson(res, mori.into_array(mori.map(rampSlave.toPublicValue, rampServer.slaves)))
};

function performCapture(rampServer, req, res) {
    var slave = rampSlave.createSlave(req.headers["user-agent"]);
    rampServer.slaves = mori.conj(rampServer.slaves, slave)
    res.writeHead(302, {"Location": mori.get(slave, "chainsPath")})
    res.end();
};

function createSession(rampServer, req, res) {
    if (rampServer.currentSession) {
        res.writeHead(409);
        res.end("A session is already in progress.");
        return;
    }

    var session = rampSession.createSession()
    rampServer.currentSession = session;
    writeJson(res, rampSession.toPublicValue(session));
}

function initializeSession(rampServer, req, res) {
    if (mori.is_empty(rampServer.slaves)) {
        res.writeHead(418);
        res.end("Cannot initialize session, no slaves are captured.");
        return;
    }

    mori.each(rampServer.slaves, mori.partial(rampSlave.initializeSession, rampServer.currentSession));

    writeJson(res, {
        session: rampSession.toPublicValue(rampServer.currentSession),
        slaves: mori.into_array(mori.map(rampSlave.toPublicValue, rampServer.slaves))
    });
};

function showTestBed(rampServer, req, res) {
    res.writeHead(200, {"Content-Type": "text/html"});
    res.end("OMG;;;");
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

    if (rampServer.currentSession) {
        var match = rampSession.matchPathForSession(rampServer.currentSession, url.path);
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
        getSlaves: function () { return mori.into_array(mori.map(rampSlave.toPublicValue, rampServer.slaves)); },
        attach: mori.partial(attach, rampServer)
    }
};
