var rampCaptureServer = require("./../lib/ramp-capture-server");
var rampResources = require("ramp-resources");

var port = parseInt(process.argv[2], 10);
var rs = rampResources.createResourceSet();
var serverClient = rampCaptureServer.createServerClient(port);
serverClient.createSession(rs);
