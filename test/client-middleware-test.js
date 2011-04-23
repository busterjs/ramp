var buster = require("buster");
var sinon = require("sinon");
var clientMiddleware = require("./../lib/client/client-middleware");
var clientMiddlewareClient = require("./../lib/client/client");
var multicastMiddleware = require("buster-multicast").multicastMiddleware;

var fs = require("fs");
var http = require("http");
var h = require("./test-helper");

buster.testCase("Client middleware", {
    setUp: function (done) {
        var self = this;
        this.cm = Object.create(clientMiddleware);
        this.cm.multicastMiddleware = Object.create(multicastMiddleware);
        this.httpServer = http.createServer(function (req, res) {
            if (self.cm.respond(req, res)) return true;
            if (self.cm.multicastMiddleware.respond(req, res)) return true;

            res.writeHead(h.NO_RESPONSE_STATUS_CODE);
            res.end();
        });
        this.httpServer.listen(h.SERVER_PORT, done);
    },

    tearDown: function (done) {
        this.httpServer.on("close", done);
        this.httpServer.close();
    },

    "test creating/capturing client": function () {
        this.stub(clientMiddlewareClient, "startSession");
        var client = this.cm.createClient();
        buster.assert(typeof(client), "object");
        buster.assert.isFalse(client.startSession.called);
    },

    "test capturing client with session in progress": function () {
        this.cm.startSession({});
        this.stub(clientMiddlewareClient, "startSession");
        var client = this.cm.createClient();
        buster.assert(client.startSession.calledOnce);
    },

    "test different clients gets different URLs": function () {
        var clientOne = this.cm.createClient();
        var clientTwo = this.cm.createClient();

        buster.assert.notEquals(clientOne.url, clientTwo.url);
    },

    "with a client": {
        setUp: function () {
            var self = this;
            this.client = this.cm.createClient();
        },

        "test getting client index page": function (done) {
            var self = this;
            h.request({path: this.client.url}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(res.headers["content-type"], "text/html");
                buster.assert.match(body, "<frameset");
                buster.assert.match(body, /\<frame .*src=..+control_frame\.html./);
                buster.assert.equals(body.match(/\<frame/g).length - 1, 2);
                buster.assert.match(body, self.client.url + "/control_frame.html");
                done();
            }).end();
        },

        "test serves env.js": function (done) {
            var self = this;
            h.request({path: this.client.url + "/env.js"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(res.headers["content-type"], "text/javascript");

                // Clean scope
                var scope = {};
                require("vm").runInNewContext(body, scope);
                buster.assert("buster" in scope);
                buster.assert("env" in scope.buster);
                buster.assert.equals(typeof(scope.buster.env), "object");
                buster.assert.equals(scope.buster.env.multicastUrl, self.cm.multicastMiddleware.contextPath + "/");
                buster.assert.equals(self.client.id, scope.buster.env.clientId);

                // Scope where buster is already defined
                var scope = {buster: {}};
                require("vm").runInNewContext(body, scope);
                buster.assert("buster" in scope);
                buster.assert("env" in scope.buster);
                buster.assert.equals(typeof(scope.buster.env), "object");
                buster.assert.equals(scope.buster.env.multicastUrl, self.cm.multicastMiddleware.contextPath + "/");
                done();
            }).end();
        },

        "test setting custom env variables": function (done) {
            this.client.env.foo = "bar";

            h.request({path: this.client.url + "/env.js"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(res.headers["content-type"], "text/javascript");

                var scope = {};
                require("vm").runInNewContext(body, scope);
                buster.assert.equals("bar", scope.buster.env.foo);
                done();
            }).end();
        },

        "test control_frame.html loads all scripts": function (done) {
            var self = this;
            this.client.scriptServingMiddleware._scripts = [
                {path: "/foo.js", read:function(){}},
                {path: "/bar.js", read:function(){}},
                {path: "/baz/maz.js", read:function(){}}
            ];

            h.request({path: this.client.url + "/control_frame.html"}, function (res, body) {
                buster.assert.equals(res.statusCode, 200);
                buster.assert.equals(res.headers["content-type"], "text/html");
                buster.assert.match(body, self.client.url + "/foo.js");
                buster.assert.match(body, self.client.url + "/bar.js");
                buster.assert.match(body, self.client.url + "/baz/maz.js");
                done();
            }).end();
        },

        "test client serves all scripts": function (done) {
            var self = this;
            this.client.scriptServingMiddleware._scripts = [
                {
                    path: "/foo.js",
                    read: function (done) { done("doing it"); }
                },
                {
                    path: "/bar/baz.js",
                    read: function (done) { done("buster yo"); }
                }
            ];

            h.request({path: this.client.url + "/foo.js", method: "GET"}, function (res, body) {
                buster.assert.equals(200, res.statusCode);
                buster.assert.equals("doing it", body);

                h.request({path: self.client.url + "/bar/baz.js", method: "GET"}, function (res, body) {
                    buster.assert.equals(200, res.statusCode);
                    buster.assert.equals("buster yo", body);
                    done();
                }).end();
            }).end();
        },

        "test client serves all built-in scripts": function (done) {
            var self = this;
            var numResponses = 0;
            var handler = function (res, script) {
                buster.assert.equals(200, res.statusCode, "Built-in script '" + script.path + "' failed to load");
                numResponses++;
                if (numResponses == self.client.scriptServingMiddleware.scripts.length) done();
            }

            for (var i = 0, ii = this.client.scriptServingMiddleware.scripts.length; i < ii; i++) {
                (function (script) {
                    h.request({path: self.client.url + script.path, method: "GET"}, function (res, body) {
                        handler(res, script);
                    }).end();
                }(this.client.scriptServingMiddleware.scripts[i]));
            }
        },

        "test binding to session middleware": function () {
            var session = {foo: "test"};
            var sessionMiddleware = Object.create(buster.eventEmitter);
            this.cm.bindToSessionMiddleware(sessionMiddleware);

            this.stub(this.cm, "startSession");
            sessionMiddleware.emit("session:start", session);
            buster.assert(this.cm.startSession.calledOnce);
            buster.assert(this.cm.startSession.calledWithExactly(session));

            this.stub(this.cm, "endSession");
            sessionMiddleware.emit("session:end");
            buster.assert(this.cm.endSession.calledOnce);
        },

        "test binding to multicast middleware": function () {
            var multicastMiddleware = Object.create(buster.eventEmitter);
            var multicastClient = {};
            this.cm.bindToMulticastMiddleware(multicastMiddleware);

            buster.assert.same(this.cm.multicastMiddleware, multicastMiddleware);

            this.stub(this.cm, "attachMulticastToClient");
            multicastMiddleware.emit("client:create", multicastClient);
            buster.assert(this.cm.attachMulticastToClient.calledOnce);
            buster.assert(this.cm.attachMulticastToClient.calledWithExactly(multicastClient));
        },

        "test attach multicast to client": function () {
            var multicastClient = {identifier: this.client.id};
            var otherClient = this.cm.createClient();
            this.stub(this.client, "attachMulticast");
            this.stub(otherClient, "attachMulticast");


            this.cm.attachMulticastToClient(multicastClient);

            buster.assert(this.client.attachMulticast.calledOnce);
            buster.assert(this.client.attachMulticast.calledWith(multicastClient));
            buster.assert.isFalse(otherClient.attachMulticast.called);
        },

        "test emits session:start to client when multicast and session is present": function () {
            var session = {};
            var multicast = {emitToClient: sinon.spy(), clientId: 123};
            this.client.startSession(session);
            this.client.attachMulticast(multicast);

            buster.assert(multicast.emitToClient.calledOnce);
            buster.assert(multicast.emitToClient.calledWithExactly(123, "session:start", session));
        },
    }
});