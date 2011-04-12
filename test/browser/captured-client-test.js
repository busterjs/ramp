TestCase("Buster server captured client", {
    setUp: function () {
        delete buster.env;
        this.client = buster.create(buster.server.capturedClient);
    },

    "test createMulticastClient": function () {
        buster.env = {
            multicastClientId: 123,
            multicastUrl: "/foo"
        };

        this.client.createMulticastClient();

        assert("multicastClient" in this.client);
        assertEquals(123, this.client.multicastClient.id);
        assertEquals("/foo", this.client.multicastClient.url);
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
    },

    "test creates buster object with multicast on other frame": function () {
        var win = {}
        this.client.crossFrame = function () { return {window: function () { return win; }} };
        this.client.exposeBusterObject();
        assert(win.hasOwnProperty("buster"));
        assertEquals(typeof(win.buster), "object");
        assertSame(win.buster.multicastClient, this.client.multcastClient);
    }
});