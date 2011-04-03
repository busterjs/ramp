(function () {
    // TODO: Cover this code with tests.
    var messagingClient = buster.messagingClient.create(null, {
        httpClient: buster.ajax.json.poller.create()
    });

    messagingClient.id = busterSessionEnv.messagingClientId;
    messagingClient.url = busterSessionEnv.messagingUrl;
    messagingClient.listen();
}());