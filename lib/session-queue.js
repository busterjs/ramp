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
        loadSession.call(this, session);

        session.on("end", function () {
            this.dequeue(session);
        }.bind(this));
    },

    dequeue: function (session) {
        var i = this.sessions.indexOf(session);
        this.sessions.splice(i, 1);

        if (this.sessions.length > 0) {
            loadSession.call(this, this.sessions[0]);
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
            slave.loadSession(currentSession);
        }
    }
};

function loadSession(session) {
    when.all(this.slaves.map(function (slave) {
        return slave.loadSession(session);
    })).then(function () {
        this.emit("loaded", session);
    }.bind(this));
}