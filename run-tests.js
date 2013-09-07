var buster = require("buster-node");
buster.testRunner.timeout = 4000;

require("./test/session-test")
require("./test/slave-test")
require("./test/slave-reloading-on-server-restart-test")
require("./test/slave-header-test")
require("./test/ramp-client-death-test")
require("./test/test-helper-test")
