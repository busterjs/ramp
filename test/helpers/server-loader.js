var captureServer = require("./../../lib/ramp-capture-server");
var http = require("http");

var server = http.createServer(function (req, res) {
    res.writeHead(418);
    res.end();
});
server.listen(parseInt(process.argv[2], 10), function () {
    console.log(server.address().port);
});

var cs = captureServer.createServer();
cs.attach(server);
