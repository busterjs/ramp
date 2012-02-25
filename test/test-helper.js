var http = require("http");
var faye = require("buster-faye");
var CP = require("child_process");
var EventEmitter = require("events").EventEmitter;
var htmlparser = require("htmlparser");
var select = require("soupselect").select;

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
            res.on("end", function () { callback && callback(res, body); });
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

    bayeuxSubscribeOnce: function(bayeux, url, handler) {
        var wrapped = function () {
            handler.apply(this, arguments);
            bayeux.unsubscribe(url, wrapped);
        };
        return bayeux.subscribe(url, wrapped);
    },

    bayeuxForSession: function (s) {
        return new faye.Client("http://127.0.0.1:"
                               + module.exports.SERVER_PORT
                               + s.bayeuxClientPath);
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

    parseDOM: function (html) {
        var handler = new htmlparser.DefaultHandler();
        var parser = new htmlparser.Parser(handler);
        parser.parseComplete(html);
        return handler.dom;
    },

    domSelect: function (dom, selector) {
        return select(dom, selector);
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
                // TODO: Figure out why we need a timeout here.
                // Without a timeout, the "disconnect" event will not
                // trigger immediately after the browser dies, but wait
                // for a timeout.
                setTimeout(function () {
                    oncapture(slave, phantom);
                }, 50);
            };
            srv.captureServer.bayeux.subscribe(slave.becomesReadyPath, readyHandler);
        }
        srv.captureServer.bayeux.subscribe("/capture", captureHandler);
    }
};

var phantomPort = 12000;

var Phantom = function (onready) {
    var isOpening = false;
    var eventEmitter = new EventEmitter();
    var phantomScriptPath = __dirname + "/integration/phantom.js";
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

            module.exports.request({
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