var bCapServ = require("./../lib/buster-capture-server");
var http = require("http");

var server = http.createServer(function (req, res) {
    res.writeHead(418);
    res.end();
});
server.listen(parseInt(process.argv[3], 10), function () {
    console.log(server.address().port);
});

var cs = bCapServ.createServer();
cs.attach(server);
