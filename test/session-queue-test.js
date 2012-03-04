var buster = require("buster");
var sinon = require("sinon");
var bCapServSessionQueue = require("../lib/session-queue");
var when = require("when");

function mockSession() {
    return buster.eventEmitter.create();
}

function mockSlave() {
    var slave = buster.eventEmitter.create();
    slave.loadSession = sinon.spy(function (session) {
        return this.loadSessionDeferred = when.defer();
    })
    return slave;
}

buster.testCase("Session queue", {
    setUp: function () {
        this.sq = bCapServSessionQueue.create();
    },

    "should start first session immediately with no slaves": function (done) {
        var sess = mockSession();
        this.sq.on("loaded", done(function (session) {
            assert.same(session, sess);
        }));
        this.sq.enqueue(sess);
    },

    "should start first session immediately with slaves": function (done) {
        var sess = mockSession();
        var slave1 = mockSlave();
        var slave2 = mockSlave();
        this.sq.on("loaded", done(function (session) {
            assert.same(session, sess);

            assert.calledOnce(slave1.loadSession);
            assert.same(slave1.loadSession.getCall(0).args[0], sess);

            assert.calledOnce(slave2.loadSession);
            assert.same(slave2.loadSession.getCall(0).args[0], sess);
        }));
        this.sq.addSlave(slave1);
        this.sq.addSlave(slave2);
        this.sq.enqueue(sess);

        slave1.loadSessionDeferred.resolve();
        slave2.loadSessionDeferred.resolve();
    },

    "should start queued session when current session is dequeued": function (done) {
        var sess1 = mockSession();
        var sess2 = mockSession();
        this.sq.enqueue(sess1);
        this.sq.enqueue(sess2);

        this.sq.on("loaded", done(function (session) {
            assert.same(session, sess2);
        }));
        this.sq.dequeue(sess1);
    },

    "should start queued session when current session ends": function (done) {
        var sess1 = mockSession();
        var sess2 = mockSession();
        this.sq.enqueue(sess1);
        this.sq.enqueue(sess2);

        this.sq.on("loaded", done(function (session) {
            assert.same(session, sess2);
        }));
        sess1.emit("end");
    },

    "should start session in slave that joins joinable session": function (done) {
        var self = this;
        var sess = mockSession();
        this.sq.on("loaded", done(function (sess) {
            var slave = mockSlave();
            self.sq.addSlave(slave);
            assert.calledOnce(slave.loadSession);
            assert.same(slave.loadSession.getCall(0).args[0], sess);
        }));
        this.sq.enqueue(sess);
    },

    "should notify slaves when creating non-joinable session": function () {
        var sess = mockSession();
        sess.joinable = false;

        var slave = mockSlave();

        var queueLoadedSpy = this.spy();
        this.sq.on("loaded", queueLoadedSpy);
        this.sq.addSlave(slave);
        this.sq.enqueue(sess);

        assert.calledOnce(slave.loadSession);
        assert.same(slave.loadSession.getCall(0).args[0], sess);

        slave.loadSessionDeferred.resolve();
        assert.calledOnce(queueLoadedSpy);
    },

    "should not notify new slave of non-joinable session in progress": function () {
        var sess = mockSession();
        sess.joinable = false;

        var slave = mockSlave();

        var queueLoadedSpy = this.spy();
        this.sq.on("loaded", queueLoadedSpy);
        this.sq.enqueue(sess);

        this.sq.addSlave(slave);

        assert.calledOnce(queueLoadedSpy);
        refute.called(slave.loadSession);
    },

    "removes slave from list of slaves when slave ends": function () {
        var slave = mockSlave();
        this.sq.addSlave(mockSlave());
        this.sq.addSlave(slave);
        this.sq.addSlave(mockSlave());
        assert.equals(this.sq.slaves.length, 3);
        refute(this.sq.slaves.indexOf(slave) < 0);

        slave.emit("end");
        assert.equals(this.sq.slaves.length, 2);
        assert(this.sq.slaves.indexOf(slave) < 0);
    }
});