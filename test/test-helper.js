var http = require("http");
var bCapServ = require("../lib/buster-capture-server");
var sinon = require("sinon");

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

    mockLogger: function (test) {
        return {
            error: test.spy(),
            warn: test.spy(),
            log: test.spy(),
            info: test.spy(),
            debug: test.spy()
        }
    },

    mockPubsubServer: function () {
        return buster.extend(buster.eventEmitter.create(), {
            getClient: function () { return module.exports.mockFayeClient() },
            addExtension: sinon.spy(),
            removeExtension: sinon.spy(),
            bind: sinon.spy(),
            unbind: sinon.spy()
        })
    },

    mockFayeClient: function () {
        return {
            publish: sinon.spy(),
            subscribe: sinon.spy()
        }
    }
};