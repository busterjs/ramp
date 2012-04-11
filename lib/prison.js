(function () {
    buster.captureServer = buster.captureServer || {};
    buster.captureServer.prison = {
        create: function () {
            var instance = buster.create(this);

            // TODO: Provide these somehow, so the browser doesn't
            // have to guess them.
            var hostAndPort = /^[a-z]+:\/\/([^\/]+)/.exec(window.location)[1].split(":");
            var host = hostAndPort[0];
            var port = parseInt(hostAndPort[1] || "80", 10);
            instance.id = /^[a-z]+:\/\/[^\/]+\/slaves\/([^\/]+)/.exec(window.location)[1];

            instance.serverClient = buster.captureServer.pubsubClient.create({
                host: host,
                port: port
            });

            return instance;
        },

        listen: function () {
            var self = this;

            this.serverClient.connect().then(function () {
                self.serverClient.on("slave:" + self.id + ":session:load", function () {
                    // self.serverClient.emit("slave:" + self.id + ":session:loaded");
                });
                self.serverClient.on("slave:" + self.id + ":session:unload", function () {
                    // self.serverClient.emit("slave:" + self.id + ":session:unloaded");
                });
                self.serverClient.emit("slave:" + self.id + ":imprisoned");
            });
        }
    };
}());