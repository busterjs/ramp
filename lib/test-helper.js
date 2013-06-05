var when = require("when");
var http = require("http");
var Faye = require("faye");

function req(opts, cb) {
    opts.host = opts.host || "localhost";

    return http.request(opts, function (res) {
        var body = "";
        res.setEncoding("utf8");
        res.on("data", function (chunk) { body += chunk; });
        res.on("end", function () { cb(res, body); });
    });
}

module.exports = {
    captureSlave: function (port, ua) {
        // Avoiding circular require
        var ramp = require("./ramp");
        var PubSubClient = require("./pubsub-client");

        ua = ua || "Whatever";
        var deferred = when.defer();
        var self = this;

        var mockBrowserFaye = new Faye.Client("http://127.0.0.1:" + port + "/messaging")

        var c = ramp.createServerClient(port);
        c.connect().then(function () {

            c.on("slave:captured", function (e) {
                c.disconnect();
                deferred.resolve({e: e, teardown: function () {
                    mockBrowserFaye.disconnect();
                }});
            });

            req({path: "/capture", port: port}, function (res, body) {
                var slave = JSON.parse(body);

                var mockBrowserPubsub = new PubSubClient(mockBrowserFaye);
                mockBrowserPubsub.registerWithServer().then(function () {
                    mockBrowserPubsub.publish("/slave/" + slave.id + "/imprisoned",
                           {userAgent: ua,
                            pubsubClientId: mockBrowserPubsub.id});
                });
            }).end();
        }, deferred.reject);

        return deferred.promise;
    }
};
