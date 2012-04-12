var http = require("http");
// var bCapServ = require("./../../lib/buster-capture-server");
var bCaptureServer = require("../../lib/buster-capture-server");
var EventEmitter = require("events").EventEmitter;
var CP = require("child_process");
var faye = require("faye");
var phantomPort = 12000;
var h = require("./../test-helper");

var PhantomFactory = function () {
    this.phantoms = [];
};

module.exports = PhantomFactory;

PhantomFactory.prototype = {
    openCapture: function (ready) {
        var captureUrl = "http://0.0.0.0:" + h.SERVER_PORT + "/capture";

        var phantom = Phantom(function () {
            phantom.open(captureUrl, function () {
                ready(phantom);
            });
        });

        this.phantoms.push(phantom);
    },

    capture: function(ready) {
        this.openCapture(function (phantom) {
            var c = bCaptureServer.createServerClient({
                host: "0.0.0.0",
                port: h.SERVER_PORT
            });

            c.connect().then(function () {
                c.on("slave:captured", function (slave) {
                    c.disconnect();
                    ready(slave, phantom);
                });
            });
        });
    },

    killAll: function () {
        this.phantoms.forEach(function (p) { p.kill() });
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