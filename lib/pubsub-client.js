if (typeof module === "object" && typeof require === "function") {
    var buster = require("buster-core");
    var Faye = require("faye");
    var when = require("when");
    var uuid = require("node-uuid");
}

(function () {
    var NOOP = function NOOP() {};
    var PUBLIC_METHODS = ["connect", "disconnect", "on", "emit"];
    var EVENT_NAME_RE = /^[a-z0-9\-\_\!\~\(\)\$\@\:]+$/i;

    buster.captureServer = buster.captureServer || {};
    buster.captureServer.pubsubClient = {
        create: function (opts) {
            var instance = buster.create(this);

            if (opts._fayeClient) {
                instance._fayeClient = opts._fayeClient;
            } else {
                instance._serverHost = opts.host || "0.0.0.0";
                instance._serverPort = opts.port;
                instance._fayeClient = instance._createFayeClient();
                instance._hasOwnFayeClient = true;
            }

            instance._contextPath = opts.contextPath || "";
            instance.id = uuid();
            instance.connectionId = instance.id;
            instance._onConnect = opts.onConnect || NOOP;
            instance._subscriptions = [];

            function delegateMethod(meth) {
                var impl = instance[meth];
                instance[meth] = function () {
                    return impl.apply(instance, arguments);
                };
            }

            // TODO: find a way to test this. Currently untested.
            var i, ii;
            for (i = 0, ii = PUBLIC_METHODS.length; i < ii; i++) {
                delegateMethod(PUBLIC_METHODS[i]);
            }

            return instance;
        },

        connect: function () {
            var self = this;
            var deferred = when.defer();

            var initPath = "/initialize/" + this.id;
            this._fayeClient.subscribe(initPath, function () {
                self._fayeClient.unsubscribe(initPath);
                self._onConnect();
                deferred.resolve();
            }).callback(function () {
                self._fayeClient.publish(initPath, {id: self.connectionId});
            });

            // TODO: Handle timeout
            return deferred.promise;
        },

        disconnect: function () {
            if (this._hasOwnFayeClient) {
                this._fayeClient.disconnect();
            }
        },

        on: function (eventName, handler) {
            var path, _handler;

            if (arguments.length === 1) {
                handler = eventName;
                path = this._contextPath + "/user/**";
                _handler = function (e) { handler(e.eventName, e.data); };
            } else {
                path = this._contextPath + this._getEventName(eventName);
                _handler = function (e) { handler(e.data); };
            }

            var subscription = this._fayeClient.subscribe(path, _handler);
            this._subscriptions.push(subscription);
        },

        emit: function (eventName, data) {
            var path = this._contextPath + this._getEventName(eventName);
            this._fayeClient.publish(path, {
                data: data,
                eventName: eventName
            });
        },

        inherit: function (contextPath) {
            if (contextPath.length === 0) {
                throw new Error("Must set a context path");
            }

            var pubsubClient = buster.captureServer.pubsubClient.create({
                _fayeClient: this._fayeClient,
                contextPath: contextPath
            });
            pubsubClient.connectionId = this.connectionId;
            return pubsubClient;
        },

        teardown: function () {
            this._subscriptions.forEach(function (s) { s.cancel(); });
        },

        _getEventName: function (eventName) {
            if (!EVENT_NAME_RE.test(eventName)) {
                throw new TypeError("Event name must match " + EVENT_NAME_RE);
            }

            return "/user/" + eventName
                .replace(/-/g, "--")
                .replace(/:/g, "-");
        },

        _createFayeClient: function () {
            var url = "http://" + this._serverHost + ":" +
                this._serverPort + "/messaging";

            return new Faye.Client(url, {
                retry: 0.5,
                timeout: 1
            });
        }
    };

    if (typeof module === "object" && typeof require === "function") {
        module.exports = buster.captureServer.pubsubClient;
    }
}());
