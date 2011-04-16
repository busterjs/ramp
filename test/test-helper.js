var http = require("http");

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
    }
};