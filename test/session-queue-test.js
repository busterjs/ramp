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
    });
    slave.mockEnd = sinon.spy(function () {
        this.ended = true;
        this.loadSessionDeferred && this.loadSessionDeferred.resolve();
        this.emit("end");
    });
    return slave;
}

buster.testCase("Session queue", {
    setUp: function () {
        this.sq = bCapServSessionQueue.create();
        this.sq.prepare = function () {
            var deferred = when.defer();
            deferred.resolve();
            return deferred.promise;
        };
    },

    "should start first session immediately with no slaves": function (done) {
        var sess = mockSession();
        this.sq.on("loaded", done(function (e) {
            assert.same(e.session, sess);
        }));
        this.sq.enqueue(sess);
    },

    "should have return based on whether session will be current immediately": function () {
        assert.equals(this.sq.enqueue(mockSession()), bCapServSessionQueue.ENQUEUE_STARTED);
        assert.equals(this.sq.enqueue(mockSession()), bCapServSessionQueue.ENQUEUE_QUEUED);
    },

    "should start first session immediately with slaves": function (done) {
        var sess = mockSession();
        var slave1 = mockSlave();
        var slave2 = mockSlave();
        this.sq.on("loaded", done(function (e) {
            assert.same(e.session, sess);

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

        this.sq.on("loaded", done(function (e) {
            assert.same(e.session, sess2);
        }));
        this.sq.dequeue(sess1);
    },

    "should load enqueued sessions": function () {
        var loadedSpy = this.spy();
        this.sq.on("loaded", loadedSpy);

        var s1 = mockSession();
        this.sq.enqueue(s1);

        var s2 = mockSession();
        this.sq.enqueue(s2);

        var s3 = mockSession();
        this.sq.enqueue(s3);

        assert.calledOnce(loadedSpy);
        assert.same(loadedSpy.getCall(0).args[0].session, s1);

        this.sq.dequeue(s1);
        assert.calledTwice(loadedSpy);
        assert.same(loadedSpy.getCall(1).args[0].session, s2);

        this.sq.dequeue(s2);
        assert.calledThrice(loadedSpy);
        assert.same(loadedSpy.getCall(2).args[0].session, s3);
    },

    "should start queued session when current session ends": function (done) {
        var sess1 = mockSession();
        var sess2 = mockSession();
        this.sq.enqueue(sess1);
        this.sq.enqueue(sess2);

        this.sq.on("loaded", done(function (e) {
            assert.same(e.session, sess2);
        }));
        sess1.emit("end");
    },

    "should start session in slave that joins joinable session": function (done) {
        var self = this;
        var sess = mockSession();
        this.sq.on("loaded", done(function (e) {
            var slave = mockSlave();
            self.sq.addSlave(slave);
            assert.calledOnce(slave.loadSession);
            assert.same(slave.loadSession.getCall(0).args[0], e.session);
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
        this.sq.enqueue(sess);
        this.sq.addSlave(slave);
        refute.called(slave.loadSession);
    },

    "should not queue session at all if has no slaves and is not joinable": function () {
        var sess = mockSession();
        sess.joinable = false;
        var queueLoadedSpy = this.spy();
        this.sq.on("loaded", queueLoadedSpy);
        this.sq.enqueue(sess);
        refute.called(queueLoadedSpy);
    },

    "removes slave from list of slaves when slave ends": function () {
        var slave = mockSlave();
        this.sq.addSlave(mockSlave());
        this.sq.addSlave(slave);
        this.sq.addSlave(mockSlave());
        assert.equals(this.sq.slaves.length, 3);
        refute(this.sq.slaves.indexOf(slave) < 0);

        slave.mockEnd();
        assert.equals(this.sq.slaves.length, 2);
        assert(this.sq.slaves.indexOf(slave) < 0);
    },

    "slave ends while loading is in progress": function () {
        var slave1 = mockSlave();
        this.sq.addSlave(slave1);
        var slave2 = mockSlave();
        this.sq.addSlave(slave2);
        var slave3 = mockSlave();
        this.sq.addSlave(slave3);

        var sess = mockSession();
        var queueLoadedSpy = this.spy();
        this.sq.on("loaded", queueLoadedSpy);
        this.sq.enqueue(sess);

        slave1.loadSessionDeferred.resolve();
        slave3.loadSessionDeferred.resolve();
        slave2.mockEnd();

        assert.calledOnce(queueLoadedSpy);
        var emittedSlaves = queueLoadedSpy.getCall(0).args[0].slaves;
        assert.equals(emittedSlaves.length, 2);
        assert.same(emittedSlaves[0], slave1);
        assert.same(emittedSlaves[1], slave3);
    },

    "slave joins while loading": function () {
        var slave1 = mockSlave();
        this.sq.addSlave(slave1);

        var sess = mockSession();
        var queueLoadedSpy = this.spy();
        this.sq.on("loaded", queueLoadedSpy);
        this.sq.enqueue(sess);

        slave1.loadSessionDeferred.resolve();

        var slave2 = mockSlave();
        this.sq.addSlave(slave2);

        assert.calledOnce(queueLoadedSpy);
        var emittedSlaves = queueLoadedSpy.getCall(0).args[0].slaves;
        assert.equals(emittedSlaves.length, 1);
        assert.same(emittedSlaves[0], slave1);

        assert.calledOnce(slave2.loadSession);
        assert.same(slave2.loadSession.getCall(0).args[0], sess);
    },

    "emits event on session when it is loaded into a slave": function () {
        var sess = mockSession();

        var slave1 = mockSlave();
        this.sq.addSlave(slave1);

        var loadedSpy = this.spy();
        sess.on("loaded", loadedSpy);
        this.sq.enqueue(sess);

        refute.called(loadedSpy);

        var slave2 = mockSlave();
        this.sq.addSlave(slave2);

        slave1.loadSessionDeferred.resolve();
        slave2.loadSessionDeferred.resolve();

        assert.calledTwice(loadedSpy);
    },

    "emits event when session is unloaded": function () {
        var sess = mockSession();

        var unloadedSpy = this.spy();
        this.sq.on("unloaded", unloadedSpy);

        this.sq.enqueue(sess);
        this.sq.dequeue(sess);

        assert.calledOnce(unloadedSpy);
        assert.same(unloadedSpy.getCall(0).args[0].session, sess);
    },

    "does not emit event when dequeuing unloaded session": function () {
        var sess1 = mockSession();
        var sess2 = mockSession();

        var unloadedSpy = this.spy();
        this.sq.on("unloaded", unloadedSpy);

        this.sq.enqueue(sess1);
        this.sq.enqueue(sess2);
        this.sq.dequeue(sess2);

        refute.called(unloadedSpy);
    },

    "waits for prepare before loading the session into slaves": function (done) {
        var didIt = false;
        this.sq.prepare = function () {
            var deferred = when.defer();
            setTimeout(function () {
                didIt = true;
                deferred.resolve();
            }, 10);
            return deferred.promise;
        };

        this.sq.on("loaded", done(function () {
            assert(didIt);
        }));

        this.sq.enqueue(mockSession());
    }
});