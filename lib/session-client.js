if (typeof module === "object" && typeof require === "function") {
    var when = require("when");
    buster.captureServer.pubsubClient = require("./pubsub-client.js");
}

(function () {
    var STATES = ["started", "loaded", "ended", "unloaded"];

    buster.captureServer = buster.captureServer || {};
    buster.captureServer.sessionClient = {
        create: function (opts) {
            var instance = Object.create(this);
            instance._opts = opts;
            instance._pubsubClient = buster.captureServer.pubsubClient.create({
                host: instance._opts.host,
                port: instance._opts.port,
                fayeClient: instance._opts.fayeClient,
                contextPath: instance._opts.session.messagingPath,
                onConnect: function () {
                    instance._onInitialize()
                }
            });
            instance._pubsubClient.extend(instance);

            instance._stateDeferreds = {};
            for (var i = 0, ii = STATES.length; i < ii; i++) {
                var deferred = when.defer();
                instance._stateDeferreds[STATES[i]] = deferred;
                instance[STATES[i]] = deferred.promise;
            }

            return instance;
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

        _onInitialize: function () {
            this._privatePubsubClient = buster.captureServer.pubsubClient.create({
                fayeClient: this._pubsubClient._fayeClient,
                contextPath: this._opts.session.privateMessagingPath
            });
            this._privatePubsubClient.on("state", function (e) {
                this._setState(e.state);
            }.bind(this));
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