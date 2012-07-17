if (typeof module === "object" && typeof require === "function") {
    var buster = require("buster-core");
    var when = require("when");
    buster.captureServer.pubsubClient = require("./pubsub-client.js");
}

(function () {
    var STATES = [["started", "onStart"],
                  ["loaded", "onLoad"],
                  ["ended", "onEnd"],
                  ["unloaded", "onUnload"]];

    buster.captureServer = buster.captureServer || {};
    buster.captureServer.sessionClient = {
        _create: function (session, serverPubsub, opts) {
            var client = buster.create(this);
            client.sessionId = session.id;
            client.resourcesPath = session.resourcesPath;
            client.clientId = client.sessionId;
            client._opts = opts || {};

            client._pubsubClient = serverPubsub.inherit(session.messagingPath);

            client._privatePubsubClient = serverPubsub.inherit(
                session.privateMessagingPath
            );
            client._setUpPrivatePubsubClient();

            client._privateEventEmitter = buster.eventEmitter.create();

            client.on = client._pubsubClient.on;

            client._onAbortDeferred = when.defer();

            client._stateDeferreds = {};

            function delegate(state) {
                var stateName = state[0];
                var handlerName = state[1];

                var deferred = when.defer();
                client._stateDeferreds[stateName] = deferred;
                client[handlerName] = function () {
                    deferred.promise.then.apply(deferred.promise, arguments);
                };
            }

            var i, ii;
            for (i = 0, ii = STATES.length; i < ii; i++) {
                delegate(STATES[i]);
            }

            return client;
        },

        emit: function (event, data) {
            this._pubsubClient.emit(event, {
                data: data,
                clientId: this.clientId
            });
        },

        end: function () {
            var deferred = when.defer();
            this._privatePubsubClient.emit("end");
            this.onEnd(deferred.resolve, deferred.reject);
            return deferred.promise;
        },

        onSlaveCaptured: function (func) {
            this._privateEventEmitter.on("slave:captured", func);
        },

        onSlaveFreed: function (func) {
            this._privateEventEmitter.on("slave:freed", func);
        },

        onAbort: function (func) {
            this._onAbortDeferred.then(func);
        },

        _getInitData: function () {
            return {
                isOwner: this._opts.owner === true,
                pubsubClientId: this._pubsubClient.id
            };
        },

        _setUpPrivatePubsubClient: function () {
            var self = this;
            this._privatePubsubClient.on("state", function (e) {
                self._setAborted(e.aborted);
                self._setState(e.state);
            });

            this._privatePubsubClient.on("slave:captured", function (e) {
                self._privateEventEmitter.emit("slave:captured", {
                    slave: e.slave,
                    slaves: e.slaves
                });
            });

            this._privatePubsubClient.on("slave:freed", function (e) {
                self._privateEventEmitter.emit("slave:freed", {
                    slave: e.slave,
                    slaves: e.slaves
                });
            });

            this._privatePubsubClient.emit("initialize", this._getInitData());
        },

        _setAborted: function (err) {
            if (!err) { return; }
            if (this._hasAborted) { return; }

            this._hasAborted = true;
            this._onAbortDeferred.resolve({error: err});
        },

        _setState: function (states) {
            var state;
            for (state in states) {
                if (states[state].reached) {
                    this._resolveToState(state, states);
                }
            }
        },

        _resolveToState: function (toState, allStates) {
            var i, ii;
            for (i = 0, ii = STATES.length; i < ii; i++) {
                var state = STATES[i];
                var stateName = state[0];
                var handlerName = state[1];

                var deferred = this._stateDeferreds[stateName];
                try {
                    deferred.resolve(allStates[stateName].data);
                } catch (e) {}
                if (stateName === toState) { break; }
            }
        }
    };

    if (typeof module === "object" && typeof require === "function") {
        module.exports = buster.captureServer.sessionClient;
    }
}());
