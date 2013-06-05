(typeof require === "function" && typeof module === "object" ? 
 function (m) {
     module.exports = m(require("faye"), require("when"), require("node-uuid"));
 } :
 function (m) {
     if (!this.buster) { this.buster = {}; }
     if (!this.buster.captureServer) { this.buster.captureServer = {}; }
     this.buster.captureServer.PubSubClient = m(Faye, when, uuid);
 })(function (Faye, when, uuid) {
    var NOOP = function NOOP() {};
    var IDENTITY = function (arg) { return arg; };
    var EVENT_NAME_RE = /[a-z0-9\-\_\!\~\(\)\$\@]+/i
    var EVENT_NAME_ESCAPER = function (n) {
        n = n.replace(/\-/g, "--");

        var characters = n.split("");
        var result = [];
        for (var i = 0, ii = characters.length; i < ii; i++) {
            var c = characters[i];
            if (EVENT_NAME_RE.test(c)) {
                result[i] = c;
            } else {
                result[i] = "-" + c.charCodeAt(0);
            }
        }

        return "/" + result.join("");
    };

    function fayeSubscribeOnce(fayeClient, path, handler) {
        var subscription = fayeClient.subscribe(path, function () {
            handler();
            handler = NOOP;
            subscription.cancel();
        });

        return subscription;
    };

    function PubSubClient(fayeClient, opts) {
        opts = opts || {}

        this.id = uuid();

        this._fayeClient = fayeClient;
        this._subscriptions = [];
        this._contextPath = (opts.contextPath) || "";
        this._eventNameEscaper = opts.escapeEventNames ? EVENT_NAME_ESCAPER : IDENTITY
    }

    PubSubClient.prototype = {
        registerWithServer: function () {
            var self = this;
            var deferred = when.defer();

            var initPath = "/initialize/" + this.id;
            fayeSubscribeOnce(this._fayeClient, initPath, function () {
                deferred.resolve();
            }).callback(function () {
                self._fayeClient.publish(initPath, {id: self.id});
            });

            // TODO: Handle timeout
            return deferred.promise;
        },

        unsubscribeAll: function () {
            for (var i = 0, ii = this._subscriptions.length; i < ii; i++) {
                this._subscriptions[i].cancel();
            }
            this._subscriptions = [];
        },

        subscribe: function (path, handler) {
            var subscription = this._fayeClient.subscribe(
                this._contextPath + this._eventNameEscaper(path),
                handler);
            this._subscriptions.push(subscription);
            return subscription;
        },

        publish: function (path, data) {
            return this._fayeClient.publish(
                this._contextPath + this._eventNameEscaper(path),
                data || {});
        }
    };

    return PubSubClient;
});
