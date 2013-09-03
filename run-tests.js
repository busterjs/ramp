var buster = require("buster-node");
buster.testRunner.timeout = 4000;

require("./test/session-test")
require("./test/slave-test")
require("./test/slave-reloading-on-server-restart-test")
