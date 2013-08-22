var buster = require("buster-node");
buster.testRunner.timeout = 4000;

require("./test/capturing-test")
require("./test/session-test")
require("./test/slave-test")
