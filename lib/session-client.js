if (typeof module === "object" && typeof require === "function") {
    var buster = require("buster-core");
    var when = require("when");
    buster.captureServer.pubsubClient = require("./pubsub-client.js");
}

(function () {
    var STATES = ["started", "loaded", "ended", "unloaded"];

    buster.captureServer = buster.captureServer || {};
    buster.captureServer.sessionClient = {
        _create: function (session, serverPubsub, opts) {
            var instance = buster.create(this);
            instance.sessionId = session.id;
            instance.clientId = instance.sessionId;
            instance._opts = opts || {};

            instance._pubsubClient = serverPubsub.inherit(session.messagingPath);

            instance._privatePubsubClient = serverPubsub.inherit(session.privateMessagingPath);
            instance._setUpPrivatePubsubClient();

            instance._stateDeferreds = {};
            for (var i = 0, ii = STATES.length; i < ii; i++) {
                (function (state) {
                    var deferred = when.defer();
                    instance._stateDeferreds[state] = deferred;
                    var evPropName = "on" + state[0].toUpperCase() + state.slice(1);
                    instance[evPropName] = function () {
                        if (arguments.length > 0) {
                            deferred.promise.then.apply(deferred.promise, arguments);
                        }

                        return deferred.promise;
                    }
                }(STATES[i]));
            }

            return instance;
        },

        on: function (event, handler) {
            this._pubsubClient.on(event, handler);
        },

        emit: function (event, data) {
            this._pubsubClient.emit(event, {data: data, clientId: this.clientId});
        },

        end: function () {
            this._privatePubsubClient.emit("end");
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
                self._setState(e.state);
            });

            this._privatePubsubClient.on("initialized", function (e) {
                self._setState(e.session.state);
            });

            this._privatePubsubClient.emit("initialize", this._getInitData());
        },

        _setState: function (states) {
            for (var state in states) {
                var value = states[state];
                if (value) this._resolveToState(state);
            }
        },

        _resolveToState: function (toState) {
            for (var i = 0, ii = STATES.length; i < ii; i++) {
                var state = STATES[i];
                var deferred = this._stateDeferreds[state];
                try { deferred.resolve(); } catch(e){}
                if (state == toState) break;
            }
        }
    };

    if (typeof module === "object" && typeof require === "function") {
        module.exports = buster.captureServer.sessionClient;
    }
}());
