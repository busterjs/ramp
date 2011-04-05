(function () {
    // TODO: Cover this code with tests.
    var client = buster.create(buster.server.capturedClient);

    var messagingClient = buster.messagingClient.create(null, {
        httpClient: buster.ajax.json.poller.create()
    });

    messagingClient.id = busterSessionEnv.messagingClientId;
    messagingClient.url = busterSessionEnv.messagingUrl;

    messagingClient.on("session:start", function (e) {
        client.sessionStart(e);
    });

    messagingClient.on("session:end", function (e) {
        console.log("foo");
        client.sessionEnd(e);
    });

    buster.nextTick(buster.bind(messagingClient, "listen"));
}());
