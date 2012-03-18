var when = require("when");

var ERR_NO_SLAVES = "No slaves were captured";

module.exports = {
    ERR_NO_SLAVES: ERR_NO_SLAVES,

    create: function () {
        var instance = Object.create(this);
        instance.slaves = [];
        instance.sessions = [];
        instance.slavesForCurrentSession = [];
        return instance;
    },

    addSlave: function (slave) {
        slave.prepare().then(function () {
            this.slaves.push(slave);
            if (this.currentSession && this.currentSession.joinable !== false) {
                slave.loadSession(this.currentSession).then(function () {
                    this.slavesForCurrentSession.push(slave);
                    this.currentSession.capturedSlave(slave);
                }.bind(this));
            }
        }.bind(this));

        slave.on("end", function () {
            var i = this.slaves.indexOf(slave);
            if (i > -1) this.slaves.splice(i, 1);

            if (this.slavesForCurrentSession.indexOf(slave) > -1) {
                this.currentSession.freedSlave(slave);
            }
        }.bind(this));
    },

    enqueueSession: function (session) {
        this.sessions.push(session);
        session.once("end", function () {
            this.dequeueSession(session);
        }.bind(this));
        this._processQueue();
    },

    dequeueSession: function (session) {
        slavesPromiseOrEnd(this.slavesForCurrentSession, function (slave) {
            return slave.unloadSession();
        }.bind(this)).then(function () {
            this.sessions.splice(this.sessions.indexOf(session), 1);
            session.ended();

            if (session === this.currentSession) {
                session.unloaded();
                delete this.currentSession;
                this.slavesForCurrentSession = [];
            }

            this._processQueue();
        }.bind(this));
    },

    _processQueue: function () {
        if (("currentSession" in this)) return;

        var currentSession = this.sessions[0];
        if (currentSession.joinable === false && this.slaves.length === 0) {
            currentSession.aborted({message: ERR_NO_SLAVES});
            this.sessions.shift();
            return;
        }

        currentSession.started();

        slavesPromiseOrEnd(this.slaves, function (slave) {
            return slave.loadSession(currentSession);
        }.bind(this)).then(function () {
            this.slavesForCurrentSession = this.slaves.slice(0);
            this.currentSession = currentSession;
            this.currentSession.loaded(this.slavesForCurrentSession);
        }.bind(this));
    }
};

function slavesPromiseOrEnd(slaves, promiser) {
    return when.all(slaves.map(function (slave) {
        return slavePromiseOrEnd(slave, promiser);
    }));
}

// Similar to slave.foo().then(..) but also handles the "end" event
// as well as the promise. A slave might end before it has fully
// loaded.
function slavePromiseOrEnd(slave, promiser) {
    var deferred = when.defer();
    promiser(slave).then(function () {
        slave.removeListener("end", deferred.resolve);
        deferred.resolve();
    });
    slave.on("end", deferred.resolve);
    return deferred.promise;
}