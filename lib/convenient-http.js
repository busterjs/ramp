var when = require("when");
var http = require("http");
var bufferUtils = require("./buffer-utils");

module.exports = function convenientHTTP(host, port, method, path, body, opts) {
    var deferred = when.defer();
    opts = opts || {};

    opts.host = host;
    opts.port = port;
    opts.method = method;
    opts.path = path;

    var req = http.request(
        opts,
        function (res) {
            bufferUtils.concatHttpBody(res).then(
                function (body) {
                    body = body.toString("utf8");
                    if (res.headers["content-type"] === "application/json") {
                        body = JSON.parse(body);
                    }

                    deferred.resolve({res: res, body: body});
                },
                deferred.reject);
    });;
    req.on("error", function (err) {
        deferred.reject(err);
    });
    if (body) {
        req.setHeader("Content-Type", "application/json")
        req.write(JSON.stringify(body));
    }
    req.end();

    return deferred.promise;
};
