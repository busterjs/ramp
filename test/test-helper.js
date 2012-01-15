var http = require("http");
var faye = require("faye");
var CP = require("child_process");
var EventEmitter = require("events").EventEmitter;

module.exports = {
    NO_RESPONSE_STATUS_CODE: 418,
    SERVER_PORT: 16178,
    PROXY_PORT: 16177,

    request: function (options, callback) {
        options.host = options.host || "localhost";
        options.port = options.port || this.SERVER_PORT;
        options.method = options.method || "GET";

        var req = http.request(options, function (res) {
            var body = "";
            res.on("data", function (chunk) { body += chunk; });
            res.on("end", function () { callback(res, body); });
        });
        return req;
    },

    bayeuxClientForSlave: function (slave, cb) {
        var bayeuxClient = new faye.Client(
            "http://localhost:"
                + this.SERVER_PORT
                + slave.getEnv()["bayeuxPath"]
        );

        bayeuxClient.connect(function () {
            var publication = bayeuxClient.publish(
                "/" + slave.id + "/ready",
                bayeuxClient.getClientId()
            );

            publication.callback(function () {
                if (cb) cb();
            });
        }, bayeuxClient);

        return bayeuxClient;
    },

    // Opening and closing a faye client yields the same code paths as
    // opening and closing an actual browser.
    emulateCloseBrowser: function (slave) {
        var bayeuxClient = this.bayeuxClientForSlave(slave, function () {
            bayeuxClient.disconnect();
        });
    },

    mockLogger: function (test) {
        return {
            error: test.spy(),
            warn: test.spy(),
            log: test.spy(),
            info: test.spy(),
            debug: test.spy()
        }
    },

    Phantom: function (onready) {
    },

    capture: function(server, oncapture) {
        var captureUrl = "http://127.0.0.1:" + this.SERVER_PORT + server.capturePath;

        var phantom = Phantom(function () {
            phantom.open(captureUrl, function () {});
        });

        server.oncapture = function (req, res, slave) {
            res.writeHead(302, {"Location": slave.url});
            res.end();

            slave.on("ready", function () {
                // TODO: Figure out why we need a timeout here.
                // Without a timeout, the "disconnect" event will not
                // trigger immediately after the browser dies, but wait
                // for a timeout.
                setTimeout(function () {
                    oncapture(slave, phantom);
                }, 50);
            });
        };
    }
};

var Phantom = function (onready) {
    var isOpening = false;
    var eventEmitter = new EventEmitter();
    var phantomScriptPath = __dirname + "/integration/phantom.js";
    var port;
    var blankPageUrl;

    var phantom = CP.spawn("phantomjs", [phantomScriptPath]);
    phantom.stdout.on("data", function (data) {
        var msg = data.toString("utf8");
        var command = msg.match(/^[^ ]+/)[0];
        var data = msg.slice(command.length + 1).trim();
        eventEmitter.emit(command, data);
    });

    eventEmitter.on("port", function (data) {
        port = parseInt(data, 10);
        blankPageUrl = "http://127.0.0.1:" + port + "/blank";
        onready();
    });

    eventEmitter.on("debug", function (data) {
        console.log(data);
    });

    return {
        open: function (url, onload) {
            if (isOpening) throw new Error("Attempted to open URL before prev page was loaded");
            isOpening = true;

            module.exports.request({
                port: port,
                path: "/load",
                headers: {"X-Phantom-Load-Url": url}
            }, function(){}).end();

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