(function () {
    function mockCrossFrame() {
        var frame = {};
        return function () {
            return {
                frame: function () { return frame; }
            }
        }
    }

    function mockMulticastClient() {
        return {on: sinon.spy(), listen: sinon.spy()};
    }

    TestCase("Buster server control frame", {
        setUp: function () {
            this.cf = buster.create(buster.server.controlFrame);
            this.sandbox = sinon.sandbox.create();

            this.env = {};
            this.originalEnv = buster.env;
            buster.env = this.env;
        },

        tearDown: function () {
            this.sandbox.restore();
            buster.env = this.originalEnv;
        },

        "test creating multicast client": function () {
            var instance = mockMulticastClient();
            this.cf.createMulticastClientInstance = function () { return instance; };
            this.cf.createMulticastClient();
            assertSame(instance, this.cf.multicastClient);
        },

        "test creating multicast client instance": function () {
            this.cf.createMulticastClientInstance();
        },

        "test binding to multicast client": function () {
            var instance = mockMulticastClient();
            this.cf.createMulticastClientInstance = function () { return instance; };
            this.cf.createMulticastClient();

            assert(instance.on.calledTwice);
            assert(instance.on.calledWith("session:start"));
            assert(instance.on.calledWith("session:end"));

            var event = {};

            this.sandbox.stub(this.cf, "sessionStart");
            instance.on.getCall(0).args[1](event);
            assert(this.cf.sessionStart.calledOnce);
            assert(this.cf.sessionStart.calledWithExactly(event));

            this.sandbox.stub(this.cf, "sessionEnd");
            instance.on.getCall(1).args[1](event);
            assert(this.cf.sessionEnd.calledOnce);
            assert(this.cf.sessionEnd.calledWithExactly(event));
        },

        "test sessionStart sets src on the client frame to the root resource": function () {
            this.cf.crossFrame = mockCrossFrame();
            this.cf.sessionStart({data: {resourceContextPath: "/foo"}});
            assertEquals("/foo/", this.cf.crossFrame().frame().src);
        },

        "test sessionEnd blanks src on the client frame": function () {
            this.cf.crossFrame = mockCrossFrame();
            this.cf.sessionEnd({});
            assertEquals("", this.cf.crossFrame().frame().src);
        },

        "test crossFrame": function () {
            var crossFrame = this.cf.crossFrame();
            assertEquals("client_frame", crossFrame.targetFrameId);
        },

        "test crossFrame reuses the same object": function () {
            assertSame(this.cf.crossFrame(), this.cf.crossFrame());
            assertSame(this.cf.crossFrame(), this.cf.crossFrame());
        },

        "test listen": function () {
            var clock = this.sandbox.useFakeTimers();
            this.cf.listen();

            this.cf.multicastClient = mockMulticastClient();

            this.env.multicastClientId = 123;
            this.env.multicastUrl = "/foo";
            // Making buster.nextTick fire. By a long shot.
            clock.tick(1000);
            assert(this.cf.multicastClient.listen.calledOnce);
            assert(this.cf.multicastClient.listen.calledWith({
                clientId: this.env.multicastClientId,
                url: this.env.multicastUrl
            }));
        }
    });

    TestCase("Buster server control frame crossFrame", {
        setUp: function () {
            this.cf = buster.create(buster.server.controlFrame);

            this.crossFrame = {};
            this.oldCrossFrame = buster.server.crossFrame;
            buster.server.crossFrame = this.crossFrame;
        },

        tearDown: function () {
            buster.server.crossFrame = this.oldCrossFrame;
        },

        "test createCrossFrameInstance": function () {
            var instance = this.cf.createCrossFrameInstance();
            assert(this.crossFrame.isPrototypeOf(instance));
        }
    });
}());