var ramp = require("./../lib/ramp");
var http = require("http");

var server = http.createServer(function (req, res) {
    res.writeHead(418);
    res.end();
});

server.listen(parseInt(process.argv[2], 10), function () {
    console.log(server.address().port);

    var cs = ramp.createServer({slaveTimeoutHint: 1000, slaveLoadTimeHint: 1000});
    cs.attach(server);
});
