var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var sinon = require("sinon");

var bsq = require("../lib/session-queue");
var when = require("when");

var mockSlave = function () {
    return buster.extend(buster.eventEmitter.create(), {
        prepare: sinon.spy(function () {
            this.readyDeferred = when.defer();
            return this.readyDeferred.promise;
        }),

        loadSession: sinon.spy(function () {
            this.loadSessionDeferred = when.defer();
            return this.loadSessionDeferred.promise;
        }),

        loadSessionComplete: function () {
            this.loadSessionDeferred.resolve();
            delete this.loadSessionDeferred;
        },

        unloadSession: sinon.spy(function () {
            this.unloadSessionDeferred = when.defer();
            return this.unloadSessionDeferred.promise;
        }),

        unloadSessionComplete: function () {
            this.unloadSessionDeferred.resolve();
            delete this.unloadSessionDeferred;
        },

        mockEnd: function () {
            this.emit("end");
        }
    })
}

var mockSession = function () {
    return buster.extend(buster.eventEmitter.create(), {
        started: sinon.spy(),
        loaded: sinon.spy(),
        ended: sinon.spy(),
        unloaded: sinon.spy(),
        aborted: sinon.spy(),
        capturedSlave: sinon.spy(),
        freedSlave: sinon.spy(),
        mockEnd: function () {
            this.emit("end");
        }
    });
}

buster.testCase("Session queue", {
    setUp: function () {
        this.sq = bsq.create();
    },

    "adds slave when slave is prepared": function () {
        var slave = mockSlave();
        this.sq.addSlave(slave);
        assert.equals(this.sq.slaves.length, 0);

        slave.readyDeferred.resolve();
        assert.equals(this.sq.slaves.length, 1);
        assert.same(this.sq.slaves[0], slave);
    },

    "ignores slaves that fails prepare": function () {
        var slave = mockSlave();
        this.sq.addSlave(slave);
        slave.readyDeferred.reject();
        assert.equals(this.sq.slaves.length, 0);
    },

    "with slaves": {
        setUp: function () {
            this.slave = mockSlave();
            this.sq.addSlave(this.slave);
            this.slave.readyDeferred.resolve();
        },

        "queues sessions": function () {
            var sess1 = mockSession();
            var sess2 = mockSession();

            this.sq.enqueueSession(sess1);
            this.sq.enqueueSession(sess2);

            assert.equals(this.sq.sessions.length, 2);
            assert.equals(this.sq.sessions[0], sess1);
            assert.equals(this.sq.sessions[1], sess2);
        },

        "starts session immediately when queue is empty": function () {
            var sess = mockSession();
            this.sq.enqueueSession(sess);
            assert.calledOnce(sess.started);

            this.slave.loadSessionComplete();
            assert.same(this.sq.currentSession, sess);

            assert.calledOnce(this.slave.loadSession);
            assert.same(this.slave.loadSession.getCall(0).args[0], sess);
        },

        "does not start session immediately when it's queued": function () {
            this.sq.enqueueSession(mockSession());

            var sess = mockSession();
            this.sq.enqueueSession(sess);
            refute.called(sess.started);
            refute.same(this.sq.currentSession, sess);
        },

        "notifies session when it is loaded into slaves": function () {
            var sess = mockSession();
            this.sq.enqueueSession(sess);
            this.slave.loadSessionComplete();
            assert.calledOnce(sess.loaded);
        },

        "ending a session": function () {
            var sess = mockSession();
            this.sq.enqueueSession(sess);
            this.slave.loadSessionComplete();

            sess.mockEnd();
            this.slave.unloadSessionComplete();
            assert.calledOnce(sess.ended);
            assert.calledOnce(sess.unloaded);
            assert.equals(this.sq.sessions.length, 0);
            refute(this.sq.currentSession);
        },

        "ending a session in the queue": function () {
            this.sq.enqueueSession(mockSession());
            this.slave.loadSessionComplete();

            var sess = mockSession();
            this.sq.enqueueSession(sess);
            sess.mockEnd();
            this.slave.unloadSessionComplete();
            assert.calledOnce(sess.ended);
            refute.called(sess.unloaded);
            assert(this.sq.currentSession);
        },

        "ending a session starts queued session": function () {
            var sess1 = mockSession();
            this.sq.enqueueSession(sess1);
            this.slave.loadSessionComplete();

            var sess2 = mockSession();
            this.sq.enqueueSession(sess2);

            sess1.mockEnd();
            this.slave.unloadSessionComplete();
            this.slave.loadSessionComplete();
            assert.same(this.sq.currentSession, sess2);
        },

        "current session gets notified when new slave loads it": function () {
            var sess1 = mockSession();
            this.sq.enqueueSession(sess1);
            this.slave.loadSessionComplete();

            var sess2 = mockSession();
            this.sq.enqueueSession(sess2);

            var newSlave = mockSlave();
            this.sq.addSlave(newSlave);
            newSlave.readyDeferred.resolve();
            newSlave.loadSessionComplete();

            assert.calledOnce(sess1.capturedSlave);
            assert.same(sess1.capturedSlave.getCall(0).args[0], newSlave);
            refute.called(sess2.capturedSlave);
            assert.same(newSlave.loadSession.getCall(0).args[0], sess1);
        },

        "current session gets notified when slaves are freed": function () {
            var newSlave = mockSlave();
            this.sq.addSlave(newSlave);
            newSlave.readyDeferred.resolve();

            var sess1 = mockSession();
            this.sq.enqueueSession(sess1);
            this.slave.loadSessionComplete();
            newSlave.loadSessionComplete();

            var sess2 = mockSession();
            this.sq.enqueueSession(sess2);

            newSlave.mockEnd();

            assert.calledOnce(sess1.freedSlave);
            assert.same(sess1.freedSlave.getCall(0).args[0], newSlave);
            refute.called(sess2.freedSlave);
        }
     },

     "with multiple slaves": {
         setUp: function () {
             this.slave1 = mockSlave();
             this.sq.addSlave(this.slave1);
             this.slave1.readyDeferred.resolve();

             this.slave2 = mockSlave();
             this.sq.addSlave(this.slave2);
             this.slave2.readyDeferred.resolve();

             this.slave3 = mockSlave();
             this.sq.addSlave(this.slave3);
             this.slave3.readyDeferred.resolve();
         },

         "removes slave when it ends": function () {
             this.slave2.mockEnd();
             assert.equals(this.sq.slaves.length, 2);
             assert.same(this.sq.slaves[0], this.slave1);
             assert.same(this.sq.slaves[1], this.slave3);

             this.slave1.mockEnd();
             assert.equals(this.sq.slaves.length, 1);
             assert.same(this.sq.slaves[0], this.slave3);

             this.slave3.mockEnd();
             assert.equals(this.sq.slaves.length, 0);
         },

         "yields all slaves to loaded session": function () {
             var sess = mockSession();
             this.sq.enqueueSession(sess);

             this.slave1.loadSessionComplete();
             this.slave2.loadSessionComplete();
             this.slave3.loadSessionComplete();

             assert.calledOnce(sess.loaded);
             var slaves = sess.loaded.getCall(0).args[0]
             assert.equals(slaves.length, 3);
             assert.same(slaves[0], this.slave1);
             assert.same(slaves[1], this.slave2);
             assert.same(slaves[2], this.slave3);
             assert.same(this.sq.currentSession, sess);
         },

         "yields slaves when one slave ended while loading": function () {
             var sess = mockSession();
             this.sq.enqueueSession(sess);

             this.slave1.loadSessionComplete();
             this.slave2.mockEnd(); // Note: does not resolve, just ends
             this.slave3.loadSessionComplete();

             assert.calledOnce(sess.loaded);
             var slaves = sess.loaded.getCall(0).args[0]
             assert.equals(slaves.length, 2);
             assert.same(slaves[0], this.slave1);
             assert.same(slaves[1], this.slave3);
             assert.same(this.sq.currentSession, sess);
         },

         "slave disconnects while session end is in progress": function () {
             var sess = mockSession();
             this.sq.enqueueSession(sess);
             this.slave1.loadSessionComplete();
             this.slave2.loadSessionComplete();
             this.slave3.loadSessionComplete();
             assert.same(this.sq.currentSession, sess);

            sess.mockEnd();
            this.slave1.unloadSessionComplete();
            this.slave2.mockEnd();
            this.slave3.unloadSessionComplete();

            assert.calledOnce(sess.ended);
         },

         "slave ends before prepare": function () {
             assert.equals(this.sq.slaves.length, 3);

             var slave = mockSlave();
             this.sq.addSlave(slave);
             slave.mockEnd();

             assert.equals(this.sq.slaves.length, 3);
             assert.same(this.sq.slaves[0], this.slave1);
             assert.same(this.sq.slaves[1], this.slave2);
             assert.same(this.sq.slaves[2], this.slave3);
         }
    },

    "non-joinable sessions": {
        setUp: function () {
            this.slave = mockSlave();
            this.sq.addSlave(this.slave);
            this.slave.readyDeferred.resolve();
        },

        "does not get notified about new slaves": function () {
            var sess = mockSession();
            sess.joinable = false;
            this.sq.enqueueSession(sess);
            this.slave.loadSessionComplete();

            var newSlave = mockSlave();
            this.sq.addSlave(newSlave);
            newSlave.readyDeferred.resolve();

            refute.called(sess.capturedSlave);
        },

        "does not get notified when new slave was freed": function () {
            var sess = mockSession();
            sess.joinable = false;
            this.sq.enqueueSession(sess);
            this.slave.loadSessionComplete();

            var newSlave = mockSlave();
            this.sq.addSlave(newSlave);
            newSlave.readyDeferred.resolve();

            newSlave.mockEnd();

            refute.called(sess.freedSlave);
        },

        "ends regardless of state of slave created mid-run": function () {
            var sess = mockSession();
            sess.joinable = false;
            this.sq.enqueueSession(sess);
            this.slave.loadSessionComplete();

            var newSlave = mockSlave();
            this.sq.addSlave(newSlave);
            newSlave.readyDeferred.resolve();

            sess.mockEnd();
            this.slave.unloadSessionComplete();
            assert.calledOnce(sess.ended);
        }
    },

    "non-joinable session with no slaves": {
        "gets aborted immediately": function () {
            var sess = mockSession();
            sess.joinable = false;
            this.sq.enqueueSession(sess);

            assert.calledOnce(sess.aborted);
            assert.calledWithExactly(sess.aborted, {message: bsq.ERR_NO_SLAVES});
            assert.equals(this.sq.sessions.length, 0);
        },

        "gets queued if session is already running": function () {
            var sess1 = mockSession();
            this.sq.enqueueSession(sess1);

            var sess2 = mockSession();
            sess2.joinable = false;
            this.sq.enqueueSession(sess2);

            assert.equals(this.sq.sessions.length, 2);
        },

        "gets aborted when moved to top of queue": function () {
            var sess1 = mockSession();
            this.sq.enqueueSession(sess1);

            var sess2 = mockSession();
            sess2.joinable = false;
            this.sq.enqueueSession(sess2);

            sess1.mockEnd();

            assert.calledOnce(sess2.aborted);
            assert.calledWithExactly(sess2.aborted, {message: bsq.ERR_NO_SLAVES});
            assert.equals(this.sq.sessions.length, 0);
        }
    },

    "without slaves": {
        "queues sessions": function () {
            this.sess1 = mockSession();
            this.sess2 = mockSession();

            this.sq.enqueueSession(this.sess1);
            this.sq.enqueueSession(this.sess2);

            assert.equals(this.sq.sessions.length, 2);
            assert.equals(this.sq.sessions[0], this.sess1);
            assert.equals(this.sq.sessions[1], this.sess2);
        },

        "does not start session immediately": function () {
            refute(this.sq.currentSession);
        },

        "starts top of queue session when slave joins": function () {
            var newSlave = mockSlave();
            this.sq.addSlave(newSlave);
            newSlave.readyDeferred.resolve();

            assert.same(this.sq.currentSession, this.sess1);
        }
    }
});