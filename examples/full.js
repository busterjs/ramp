var ramp = require("../lib/ramp");
var http = require("http");
var when_pipeline = require("when/pipeline");
var rampResources = require("ramp-resources");
var utils = require("./full-utils");

var PORT = 7070;
var GLOBAL_SESSION_CLIENT = null;

function showHomePage(rampClient, req, res) {
    res.writeHead(200, {"content-type": "text/html"});
    res.write("<h1>Ramp demo</h1>");
    res.write("<a target='_blank' href='/capture'>Capture</a>");

    when_pipeline([
        function () {
            return rampClient.getSlaves()
        },
        function (slaves) {
            res.write("<p>All slaves</p>");
            res.write("<ul>");
            slaves.forEach(function (slave) {
                res.write("<li>");
                res.write(slave.userAgent);
                res.write(" - " );
                res.write(slave.id);
                res.write("</li>");
            });
            res.write("</ul>");
        },
        function () {
            return rampClient.getCurrentSession()
        },
        function (session) {
            if (session) {
                res.write("<h2>Session in progress.</h2>");
                res.write("<p><a href='/session_ping'>Ping slaves (see Node.js stdout)</a></p>");
                res.write("<p><a href='/end_session'>End session</a></p>");
            } else {
                res.write("<h2>No active session.</h2>");
                res.write("<p><a href='/create_session'>Create session</a></p>");
            }
        }
    ]).then(function () {
        res.end();
    }, function () {
        console.log(arguments);
        res.end();
    });
};

function createSession(rampClient, req, res) {
    var rs = rampResources.createResourceSet();
    rs.addResource({
        path: "/",
        content: "<p>This is the <strong>awesome</strong> session root page.</p>"
    });
    rs.addResource({
        path: "/ping.js",
        content: "buster.on('ping', function (e) { buster.emit('pong', e); })"
    });
    rs.loadPath.append("/ping.js");

    when_pipeline([
        function () {
            return rampClient.createSession(rs);
        },
        function (sessionClientInitializer) {
            return when_pipeline([
                function () {
                    return sessionClientInitializer.on("pong", function (e) {
                        console.log("GOT PONG", e)
                    }) },
                function () {
                    return sessionClientInitializer.initialize();
                }
            ]);
        }
    ]).then(
        function (sessionClient) {
            GLOBAL_SESSION_CLIENT = sessionClient;
            res.writeHead(302, {location: "/"});
            res.end();
        },
        function () {
            res.writeHead(400);
            res.write("An error occurred when creating the session.\n");
            res.write(JSON.stringify(arguments));
            res.end();
        }
    );
};

function sessionPing(rampClient, sessionClient, req, res) {
    var payload = Math.random().toString();
    console.log("Pinging with payload: " + payload);
    sessionClient.emit("ping", payload);
    res.writeHead(302, {location: "/"});
    res.end();
};

function sessionEnd(rampClient, sessionClient, req, res) {
    sessionClient.endSession().then(
        function () {
            res.writeHead(302, {location: "/"});
            res.end();
        },
        function () {
            res.writeHead(400);
            res.end(JSON.stringify(arguments))
        }
    );
};

var rampServer = ramp.createServer({
    header: {
        resourceSet: utils.createHeaderResourceSet(),
        height: 80
    },
    logger: utils.createLogger(process.argv.filter(function (arg) { return /\-v/.test(arg) })[0])
});


var httpServer = http.createServer();
httpServer.listen(PORT, function () {
    console.log("Running at http://localhost:" + PORT);

    var rampClient = ramp.createRampClient(PORT);

    httpServer.on("request", function (req, res) {
        if (req.method === "GET" && req.url === "/") {
            showHomePage(rampClient, req, res);
            return;
        }

        if (req.method === "GET" && req.url === "/create_session") {
            createSession(rampClient, req, res);
            return;
        }

        if (req.method === "GET" && req.url === "/session_ping") {
            sessionPing(rampClient, GLOBAL_SESSION_CLIENT, req, res);
            return;
        }

        if (req.method === "GET" && req.url === "/end_session") {
            sessionEnd(rampClient, GLOBAL_SESSION_CLIENT, req, res);
            return;
        }

        res.writeHead(404);
        res.end("404 not found");
    });

    rampServer.attach(httpServer);
});
