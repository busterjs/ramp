var buster = require("buster-core");
var when = require("when");

var NOOP = function(){};
var ERR_NO_SLAVES = "No slaves were captured";

module.exports = {
    logger: {debug: NOOP, info: NOOP, log: NOOP, warn: NOOP, error: NOOP},
    ERR_NO_SLAVES: ERR_NO_SLAVES,

    create: function () {
        var instance = Object.create(this);
        buster.extend(instance, buster.eventEmitter.create());
        instance.slaves = [];
        instance.preparingSlaves = [];
        instance.sessions = [];
        instance.slavesForCurrentSession = [];
        return instance;
    },

    addSlave: function (slave) {
        this.logger.info("Slave about to capture", slave.serialize());

        this.preparingSlaves.push(slave);

        slave.prepare().then(function () {
            this.logger.info("Slave captured", slave.serialize());

            this.preparingSlaves.splice(this.preparingSlaves.indexOf(slave), 1);
            this.slaves.push(slave);
            this.emit("slave:captured", slave);
            if (this.currentSession && this.currentSession.joinable !== false) {
                this.logger.info("Slave getting current session loaded", slave.serialize());

                slave.loadSession(this.currentSession).then(function () {
                    this.slavesForCurrentSession.push(slave);
                    this.currentSession.capturedSlave(slave, this.slaves);
                }.bind(this));
            }
        }.bind(this));

        slave.on("end", function () {
            var i = this.slaves.indexOf(slave);
            if (i > -1) this.slaves.splice(i, 1);

            if (this.slavesForCurrentSession.indexOf(slave) > -1) {
                this.currentSession.freedSlave(slave, this.slaves);
                this.slavesForCurrentSession.splice(this.slavesForCurrentSession.indexOf(slave), 1);
            }

            this.logger.info("Slave freed", slave.serialize());
            this.emit("slave:freed", slave);

            if (this.slavesForCurrentSession.length == 0 && this.currentSession && this.currentSession.joinable === false) {
                this._removeSession(this.currentSession);
            }
        }.bind(this));
    },

    enqueueSession: function (session) {
        this.logger.info("Queuing session", session.serialize());
        this.sessions.push(session);
        session.once("end", function () {
            this.dequeueSession(session);
        }.bind(this));
        this._processQueue();
    },

    dequeueSession: function (session) {
        this.logger.info("Session about to end", session.serialize());
        slavesPromiseOrEnd(this.slavesForCurrentSession, function (slave) {
            return slave.unloadSession();
        }.bind(this)).then(function () {
            this._removeSession(session);
        }.bind(this));
    },

    _removeSession: function (session) {
        this.sessions.splice(this.sessions.indexOf(session), 1);
        session.ended();

        if (session === this.currentSession) {
            session.unloaded();
            delete this.currentSession;
            this.slavesForCurrentSession = [];
        }

        this.logger.info("Session ended", session.serialize());
        this.teardownSession(session);

        this._processQueue();
    },

    _processQueue: function () {
        if (("currentSession" in this)) return;
        if (this.sessions.length === 0) return;

        var sessionToPrepare = this.sessions[0];
        if (sessionToPrepare.joinable === false && this.slaves.length === 0) {
            sessionToPrepare.aborted({message: ERR_NO_SLAVES});
            this.sessions.shift();
            return;
        }

        sessionToPrepare.started();

        this.prepareSession(sessionToPrepare).then(function (currentSession) {
            slavesPromiseOrEnd(this.slaves, function (slave) {
                return slave.loadSession(currentSession);
            }.bind(this)).then(function () {
                this.slavesForCurrentSession = this.slaves.slice(0);
                this.currentSession = currentSession;
                this.currentSession.loaded(this.slavesForCurrentSession);
            }.bind(this));
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
