var bCapServ = require("./../lib/buster-capture-server");
var rampResources = require("ramp-resources");

var port = parseInt(process.argv[2], 10);
var rs = rampResources.resourceSet.create();
var serverClient = bCapServ.createServerClient(port);
serverClient.createSession(rs);
