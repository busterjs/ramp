if (typeof module === "object" && typeof require === "function") {
    var Faye = require("faye");
    var when = require("when");
    var uuid = require("node-uuid");
}

(function () {
    var NOOP = function NOOP(){};
    var PUBLIC_METHODS = ["connect", "disconnect", "on", "emit"];

    buster.captureServer = buster.captureServer || {};
    buster.captureServer.pubsubClient = {
        create: function (opts) {
            var instance = Object.create(this);

            if (opts._fayeClient) {
                instance._fayeClient = opts._fayeClient;
            } else {
                instance._serverHost = opts.host || "0.0.0.0";
                instance._serverPort = opts.port;
            }

            instance._contextPath = opts.contextPath || "";
            instance.id = uuid();
            instance._onConnect = opts.onConnect || NOOP;

            // TODO: find a way to test this. Currently untested.
            for (var i = 0, ii = PUBLIC_METHODS.length; i < ii; i++) {
                (function (meth) {
                    var impl = instance[meth];
                    instance[meth] = function () {
                        return impl.apply(instance, arguments);
                    };
                }(PUBLIC_METHODS[i]));
            }

            return instance;
        },

        extend: function (module) {
            module.connect = this.connect;
            module.disconnect = this.disconnect;
            module.on = this.on;
            module.emit = this.emit;
        },

        connect: function () {
            var self = this;
            var deferred = when.defer();

            if (!this._fayeClient) {
                this._fayeClient = this._createFayeClient();
                this._hasOwnFayeClient = true;
            }

            var initPath = "/initialize/" + this.id;
            this._fayeClient.subscribe(initPath, function () {
                self._fayeClient.unsubscribe(initPath);
                self._onConnect();
                deferred.resolve();
            }).callback(function () {
                self._fayeClient.publish(initPath, {id: self.id});
            });

            // TODO: Handle timeout
            return deferred.promise;
        },

        disconnect: function () {
            this._hasOwnFayeClient && this._fayeClient && this._fayeClient.disconnect();
            delete this._fayeClient;
        },

        on: function (eventName, handler) {
            if (arguments.length == 1) {
                handler = arguments[0];
                var path = this._contextPath + "/user/**";
                this._fayeClient.subscribe(path, function (e) {
                    handler(e.eventName, e.data);
                });
            } else {
                var path = this._contextPath + this._getEventName(eventName);
                this._fayeClient.subscribe(path, function (e) {
                    handler(e.data);
                });
            }
        },

        emit: function (eventName, data) {
            var path = this._contextPath + this._getEventName(eventName);
            this._fayeClient.publish(path, {
                data: data,
                eventName: eventName
            });
        },

        inherit: function (contextPath) {
            if (contextPath.length == 0) {
                throw new Error("Must set a context path");
            }

            if (!this._fayeClient) {
                throw new Error("Cannot inherit from disconnected pubsub clients");
            }

            return buster.captureServer.pubsubClient.create({
                _fayeClient: this._fayeClient,
                contextPath: contextPath
            });
        },

        _getEventName: function (eventName) {
            var chunks = eventName.split(":");
            for (var i = 0, ii = chunks.length; i < ii; i++) {
                var chunk = chunks[i];

                if (!(/^[a-z0-9\-]+$/).test(chunk)) {
                    throw new TypeError("Invalid event name '" + eventName + "'. "
                                        + "Must be colon separated [a-z0-9\-].");
                }
            }

            return "/user/" + chunks.join("-");
        },

        _createFayeClient: function () {
            var url = "http://" + this._serverHost + ":" + this._serverPort + "/messaging";
            return new Faye.Client(url, {
                retry: 0.5,
                timeout: 1
            });
        },
    };

    if (typeof module === "object" && typeof require === "function") {
        module.exports = buster.captureServer.pubsubClient;
    }
}());
