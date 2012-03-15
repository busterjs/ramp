var http = require("http");
var bCapServ = require("./../../lib/buster-capture-server");
var EventEmitter = require("events").EventEmitter;
var CP = require("child_process");
var faye = require("faye");
var phantomPort = 12000;
var h = require("./../test-helper");

module.exports = {
    createServer: function (port, cb) {
        var httpServer = http.createServer(function (req, res) {
            res.writeHead(h.NO_RESPONSE_STATUS_CODE);
            res.end();
        });
        httpServer.listen(port, cb);

        var reqConns = [];
        httpServer.on("connection", function (sock) { reqConns.push(sock); });

        var captureServer = bCapServ.create();
        captureServer.attach(httpServer);

        return {
            httpServer: httpServer,
            captureServer: captureServer,
            kill: function (cb) {
                // Ensure all connections are nuked out of orbit
                reqConns.forEach(function (c) { c.destroy(); });

                httpServer.on("close", cb);
                httpServer.close();
            }
        }
    },


    Phantom: function () {
        return Phantom.apply(Phantom, arguments);
    },

    capture: function(srv, oncapture) {
        var captureUrl = "http://127.0.0.1:" + srv.httpServer.address().port + srv.captureServer.capturePath;

        var phantom = Phantom(function () {
            phantom.open(captureUrl, function () {});
        });

        var captureHandler = function (slave) {
            srv.captureServer.bayeux.unsubscribe("/capture", captureHandler);

            var readyHandler = function () {
                srv.captureServer.bayeux.unsubscribe(slave.becomesReadyPath, readyHandler);
                oncapture(slave, phantom);
            };
            srv.captureServer.bayeux.subscribe(slave.becomesReadyPath, readyHandler)
        }
        srv.captureServer.bayeux.subscribe("/capture", captureHandler);
    }
};


var Phantom = function (onready) {
    var isOpening = false;
    var eventEmitter = new EventEmitter();
    var phantomScriptPath = __dirname + "/phantom.js";
    var phantomControlPort = ++phantomPort; // TODO: reuse old ports
    var blankPageUrl = "http://127.0.0.1:" + phantomControlPort + "/blank";

    var phantom = CP.spawn("phantomjs", [phantomScriptPath, phantomControlPort]);
    phantom.stdout.on("data", function (data) {
        var msg = data.toString("utf8");
        var command = msg.match(/^[^ ]+/)[0];
        var data = msg.slice(command.length + 1).trim();
        eventEmitter.emit(command, data);
    });

    eventEmitter.on("debug", function (data) {
        console.log("Phantom console.log:", data);
    });

    eventEmitter.on("ready", function (data) {
        onready();
    });

    return {
        open: function (url, onload) {
            if (isOpening) throw new Error("Attempted to open URL before prev page was loaded");
            isOpening = true;

            h.request({
                port: phantomControlPort,
                path: "/load",
                headers: {"X-Phantom-Load-Url": url}
            }, function(res, body){}).end();

            eventEmitter.once("page", function (status) {
                isOpening = false;
                if (status == "success") {
                    onload();
                } else {
                    throw new Error("Unknown page load status: " + status);
                }
            });
        },

        kill: function (onkill) {
            // Loading a blank page ensures beforeunload callback gets called
            this.open(blankPageUrl, function () {
                phantom.on("exit", onkill);
                phantom.kill();
            });
        }
    };
}