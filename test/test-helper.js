var http = require("http");
var faye = require("faye");

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
    }
};