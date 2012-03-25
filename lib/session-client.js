var faye = require("faye");
var when = require("when");

module.exports = {
    create: function (host, port, opts) {
        var deferred = when.defer();

        var instance = Object.create(this);
        instance.fayeClient = new faye.Client("http://" + host + ":" + port + "/messaging");
        instance._publishQueue = [];
        instance._numPendingSubs = 0;
        instance.sessionData = opts.session;
        instance.userMessagingContextPath = instance.sessionData.messagingPath + "/user";

        var setupPath = instance.sessionData.messagingPath + "/setup";
        instance.fayeClient.subscribe(setupPath, function () {
            instance.fayeClient.unsubscribe(setupPath);
            deferred.resolve(instance);
        }).callback(function () {
            instance.fayeClient.publish(setupPath, {});
        });

        return deferred.promise;
    },

    publish: function (path, message) {
        path = this.userMessagingContextPath + path;
        this._publishQueue.push([path, message]);
        this._processPublishQueue();
    },

    subscribe: function (path, handler) {
        path = this.userMessagingContextPath + path;
        ++this._numPendingSubs;
        this.fayeClient.subscribe(path, handler).callback(function () {
            --this._numPendingSubs;
            this._processPublishQueue();
        }.bind(this));
    },

    disconnect: function () {
        this.fayeClient.disconnect();
    },

    end: function () {
        this.fayeClient.publish(this.sessionData.messagingPath + "/end", {});
    },

    // Hold publishing if there are pending subscriptions.
    _processPublishQueue: function () {
        if (this._publishQueue.length === 0) return;
        if (this._numPendingSubs > 0) return;

        var queueItem = this._publishQueue.shift();
        this.fayeClient.publish(queueItem[0], queueItem[1]);
        this._processPublishQueue();
    }
};