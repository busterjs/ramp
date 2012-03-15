var http = require("http");
var bCapServ = require("../lib/buster-capture-server");

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

    bayeuxSubscribeOnce: function(bayeux, url, handler) {
        var wrapped = function () {
            handler.apply(this, arguments);
            bayeux.unsubscribe(url, wrapped);
        };
        return bayeux.subscribe(url, wrapped);
    },

    bayeuxForSession: function (session) {
        var url = "http://127.0.0.1:"
            + module.exports.SERVER_PORT
            + "/messaging";
        return bCapServ.createSessionMessenger(url, session);
    },

    mockLogger: function (test) {
        return {
            error: test.spy(),
            warn: test.spy(),
            log: test.spy(),
            info: test.spy(),
            debug: test.spy()
        }
    }
};