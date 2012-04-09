var faye = require("faye");
var when = require("when");
var uuid = require("node-uuid");

var NOOP = function NOOP(){};
var PUBLIC_METHODS = ["connect", "disconnect", "on", "emit"];

module.exports = {
    create: function (opts) {
        var instance = Object.create(this);
        if (opts.fayeClient) {
            instance._fayeClient = opts.fayeClient;
        } else {
            instance._serverHost = opts.host;
            instance._serverPort = opts.port;
        }
        instance._contextPath = opts.contextPath || "";
        instance._id = uuid();
        instance._onConnect = opts.onConnect || NOOP;

        // TODO: find a way to test this. Currently untested.
        PUBLIC_METHODS.forEach(function (meth) {
            instance[meth] = instance[meth].bind(instance);
        });

        return instance;
    },

    extend: function (module) {
        module.connect = this.connect;
        module.disconnect = this.disconnect;
        module.on = this.on;
        module.emit = this.emit;
    },

    connect: function () {
        var deferred = when.defer();

        if (!this._fayeClient) {
            this._fayeClient = this._createFayeClient();
        }

        var initPath = "/" + this._id + "-initialize";
        this._fayeClient.subscribe(initPath, function () {
            this._fayeClient.unsubscribe(initPath);
            this._onConnect();
            deferred.resolve();
        }.bind(this)).callback(function () {
            this._fayeClient.publish(initPath, {});
        }.bind(this));

        return deferred.promise;
    },

    disconnect: function () {
        this._fayeClient && this._fayeClient.disconnect();
        delete this._fayeClient;
    },

    on: function (eventName, handler) {
        var path = this._contextPath + this._getEventName(eventName);
        this._fayeClient.subscribe(path, function (e) {
            handler(e.data);
        });
    },

    emit: function (eventName, data) {
        var path = this._contextPath + this._getEventName(eventName);
        this._fayeClient.publish(path, {
            data: data
        });
    },

    _getEventName: function (eventName) {
        var chunks = eventName.split(":");
        chunks.forEach(function (chunk) {
            if (!(/^[a-z]+$/).test(chunk)) {
                throw new TypeError("Invalid event name '" + eventName + "'. "
                                    + "Must be colon separated a-z.");
            }
        });

        return "/" + chunks.join("-");
    },

    _createFayeClient: function () {
        var url = "http://" + this._serverHost + ":" + this._serverPort + "/messaging";
        return new faye.Client(url);
    },
};