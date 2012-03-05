var when = require("when");

module.exports = {
    ENQUEUE_STARTED: 1,
    ENQUEUE_QUEUED: 2,
    ENQUEUE_FAILED: 3,

    create: function () {
        var instance = Object.create(this);
        buster.extend(instance, buster.eventEmitter.create());
        instance.sessions = [];
        instance.slaves = [];
        return instance;
    },

    enqueue: function (session) {
        if (this.slaves.length == 0 && session.joinable == false) {
            return this.ENQUEUE_FAILED;
        }

        this.sessions.push(session);

        session.on("end", function () {
            this.dequeue(session);
        }.bind(this));

        if (session === this.currentSession()) {
            loadSessionInSlaves.call(this, session, this.slaves.slice(0));
            return this.ENQUEUE_STARTED;
        } else {
            return this.ENQUEUE_QUEUED;
        }
    },

    dequeue: function (session) {
        var i = this.sessions.indexOf(session);
        this.sessions.splice(i, 1);

        if  (i == 0) {
            this.emit("unloaded", {session: session});
        }

        if (this.sessions.length > 0) {
            loadSessionInSlaves.call(this, this.currentSession(), this.slaves.slice(0));
        }
    },

    currentSession: function () {
        return this.sessions[0];
    },

    addSlave: function (slave) {
        var self = this;

        this.slaves.push(slave);
        slave.on("end", function () {
            self.slaves.splice(self.slaves.indexOf(slave), 1);
        });

        var currentSession = this.currentSession();
        if (currentSession && currentSession.joinable !== false) {
            loadSessionInSlaves.call(this, currentSession, [slave]);
        }
    }
};

function loadSessionInSlaves(session, slaves) {
    this.prepare({session: session}).then(function () {
        when.all(slaves.map(function (slave) {
            return slave.loadSession(session);
        })).then(function () {
            slaves = slaves.filter(function (s) { return s.ended !== true });

            slaves.forEach(function (slave) {
                session.emit("loaded", slave);
            });

            this.emit("loaded", {
                session: session,
                slaves: slaves
            });
        }.bind(this));
    }.bind(this));
}