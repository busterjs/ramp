var ramp = require("./../lib/ramp");
var http = require("http");

var server = http.createServer(function (req, res) {
    res.writeHead(418);
    res.end();
});

server.listen(0, function () {
    console.log(server.address().port);

    var cs = ramp.createRampServer({slaveTimeoutHint: 1000, slaveLoadTimeHint: 1000});
    cs.attach(server);
});
