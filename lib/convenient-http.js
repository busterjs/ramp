var when = require("when");
var http = require("http");

module.exports = function convenientHTTP(host, port, method, path, body) {
    var deferred = when.defer();

    var req = http.request({
        host: host,
        port: port,
        method: method,
        path: path,
    }, function (res) {
        var body = "";
        res.setEncoding("utf8");

        res.on("data", function (chunk) {
            body += chunk;
        });

        res.on("end", function () {
            if (res.headers["content-type"] === "application/json") {
                body = JSON.parse(body);
            }

            deferred.resolve({res: res, body: body});
        });
    });;
    req.on("error", function (err) {
        deferred.reject(err);
    });
    req.write(JSON.stringify(body));
    req.end();

    return deferred.promise;
};
