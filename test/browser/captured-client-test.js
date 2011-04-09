TestCase("Buster server captured client", {
    setUp: function () {
        delete window.busterSessionEnv;
        this.client = buster.create(buster.server.capturedClient);
    },

    "test createMessagingClient": function () {
        window.busterSessionEnv = {
            messagingClientId: 123,
            messagingUrl: "/foo"
        };

        this.client.createMessagingClient();

        assert("messagingClient" in this.client);
        assertEquals(123, this.client.messagingClient.id);
        assertEquals("/foo", this.client.messagingClient.url);
    },

    "test getting cross frame instance": function () {
        var crossFrame = this.client.crossFrame();
        assertEquals(typeof(crossFrame), "object");
        assertEquals(crossFrame.targetFrameId, this.client.targetFrameId);

        // Should re-use the same instance.
        assertEquals(crossFrame, this.client.crossFrame());
    },

    "test sessionStart": function () {
        var obj = {};
        this.client.crossFrame = function () { return {frame: function () { return obj; }} };
        this.client.sessionStart({data: {resourceContextPath: ""}});
        assertEquals(obj.src, "/");
    },

    "test sessionEnd": function () {
        var obj = {};
        this.client.crossFrame = function () { return {frame: function () { return obj; }} };
        this.client.sessionEnd({data: {resourceContextPath: ""}});
        assert(obj.hasOwnProperty("src"));
        assertEquals(obj.src, "");
    }
});