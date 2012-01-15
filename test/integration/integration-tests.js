var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;

var http = require("http");
var bCapServ = require("./../../lib/buster-capture-server");
var h = require("./../test-helper");

buster.testRunner.timeout = 1000;
buster.testCase("Integration", {
    setUp: function (done) {
        var self = this;

        this.httpServer = http.createServer(function (req, res) {
            res.writeHead(h.NO_RESPONSE_STATUS_CODE);
            res.end();
        });
        this.httpServer.listen(h.SERVER_PORT, done);

        this.openConnections = [];
        this.httpServer.on("connection", function (socket) {
            self.openConnections.push(socket);
            socket.on("close", function () {
                self.openConnections.splice(self.openConnections.indexOf(socket), 1);
            });
        });

        this.server = bCapServ.create();
        this.server.attach(this.httpServer);
    },

    tearDown: function (done) {
        var self = this;
        var connectionCloser = function () {
            if (self.openConnections.length == 0) {
                self.httpServer.on("close", done);
                self.httpServer.close();
            } else {
                var connection = self.openConnections.pop();
                connection.on("close", connectionCloser);
                connection.end();
            }
        };

        connectionCloser();
    },

    "test test": function (done) {
        var self = this;

        h.capture(this.server, function (slave, phantom) {
            assert.equals(self.server.slaves.length, 1);
            phantom.kill(function () {
                assert.equals(self.server.slaves.length, 0);
                done();
            });
        });
    }
});