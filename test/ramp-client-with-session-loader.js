var RAMP_PORT = process.argv[2];
var ramp = require("./../lib/ramp");

var rc = ramp.createRampClient(RAMP_PORT);
rc.createSession();
