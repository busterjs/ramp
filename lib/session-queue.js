var when = require("when");

module.exports = {
    create: function () {
        var instance = Object.create(this);
        buster.extend(instance, buster.eventEmitter.create());
        instance.sessions = [];
        instance.slaves = [];
        return instance;
    },

    enqueue: function (session) {
        this.sessions.push(session);
        loadSessionInSlaves.call(this, session, this.slaves.slice(0));

        session.on("end", function () {
            this.dequeue(session);
        }.bind(this));
    },

    dequeue: function (session) {
        var i = this.sessions.indexOf(session);
        this.sessions.splice(i, 1);

        if (this.sessions.length > 0) {
            loadSessionInSlaves.call(this, this.sessions[0], this.slaves.slice(0));
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
}