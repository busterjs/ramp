var buster = require("buster");
var sinon = require("sinon");

var busterServer = require("./../lib/buster-server");
var clientMiddleware = require("./../lib/client/client-middleware");

var http = require("http");
var h = require("./test-helper");

buster.testCase("buster-server glue", {
    setUp: function (done) {
        var self = this;
        this.server = Object.create(busterServer);
        this.httpServer = http.createServer(function (req, res) {
            if (!self.server.respond(req, res)) {
                res.writeHead(h.NO_RESPONSE_STATUS_CODE);
                res.end();
            }
        });
        this.httpServer.listen(h.SERVER_PORT, done);
        this.sandbox = sinon.sandbox.create();
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
        this.sandbox.restore();
    },

    "test binds client and session on first request": function (done) {
        var stub = this.sandbox.stub(clientMiddleware, "bindToSessionMiddleware");

        // Performing a request to make the middlewares respond.
        h.request({path: "/doesnotexist", method: "GET"}, function (res, body) {
            buster.assert(stub.calledOnce);
            done();
        }).end();
    },

    "test configures multicast middleware with context path": function (done) {
        h.request({
            path: "/sessions/messaging/clients",
            method: "GET"
        }, function (res, body) {
            buster.assert.match(JSON.parse(body), [{
                id: 1, url: "/sessions/messaging"
            }]);
            done();
        }).end();
    },

    "test unknown URL": function (done) {
        h.request({path: "/doesnotexist", method: "GET"}, function (res, body) {
            buster.assert.equals(h.NO_RESPONSE_STATUS_CODE, res.statusCode);
            done();
        }).end();
    },

    "test creating session": function () {
        var stub = this.sandbox.stub(this.server.sessionMiddleware, "createSession");
        this.server.createSession("foo");
        buster.assert(stub.calledOnce);
        buster.assert(stub.calledWithExactly("foo"));
    },

    "test destroying session": function () {
        var stub = this.sandbox.stub(this.server.sessionMiddleware, "destroySession");
        this.server.destroySession("foo");
        buster.assert(stub.calledOnce);
        buster.assert(stub.calledWithExactly("foo"));
    },

    "test creating client": function () {
        var stub = this.sandbox.stub(this.server.clientMiddleware, "createClient");
        this.server.createClient();
        buster.assert(stub.calledOnce);
    },

    "test creating session when uninitialized also calls out to client middleware": function () {
        this.server.createSession({load:[],resources:[]});
        buster.assert(this.server.clientMiddleware.currentSession);
    },


    "should identify messaging client": function (done) {
        var self = this;
        h.request({
            path: "/sessions",
            method: "POST",
            headers: {
                "User-Agent": "Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.7 (KHTML, like Gecko) Chrome/7.0.517.44 Safari/534.7"
            }
        }, function (res, body) {
            h.request({
                path: "/sessions/messaging/clients"
            }, function (res, body) {
                buster.assert.match(JSON.parse(body), [
                    { agent: { browser: "Chrome" } }
                ]);

                done();
            }).end();
        }).end();
    }
});