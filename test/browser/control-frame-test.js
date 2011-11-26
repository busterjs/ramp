(function () {
    function mockCrossFrame() {
        var frame = {};
        var window = {};
        var result = function () {
            return {
                frame: function () { return frame; },
                window: function () { return window; },
                addOnLoadListener: function (cb) { cb(); }
            }
        }
        result._window = window;

        return result;
    }

    function mockFaye() {
        return {subscribe: sinon.stub(), publish: sinon.stub(), addExtension: sinon.stub()};
    }

    TestCase("Buster server control frame", {
        setUp: function () {
            this.cf = buster.create(buster.server.controlFrame);
            this.sandbox = sinon.sandbox.create();

            delete buster.clientReady;

            this.env = {};
            this.originalEnv = buster.env;
            buster.env = this.env;
        },

        tearDown: function () {
            this.sandbox.restore();
            buster.env = this.originalEnv;
        },

        "test listening creates bayeux client and publishes ready": function () {
            this.sandbox.stub(this.cf, "createBayeuxClient");
            this.cf.createBayeuxClient.returns(mockFaye());

            this.env.clientId = "123abc";
            this.cf.listen();
            assertTrue(this.cf.bayeuxClient.publish.calledOnce);
            assertTrue(this.cf.bayeuxClient.publish.calledWithExactly("/123abc/ready", {}));
        },

        "test creating bayeux client subscribes to start and end": function () {
            this.sandbox.stub(Faye, "Client");
            Faye.Client.returns(mockFaye());
            Faye.Client.calledWithNew();

            this.env.clientId = "123abc";
            var bc = this.cf.createBayeuxClient();

            assertTrue(bc.subscribe.calledWith("/123abc/session/start"));
            this.sandbox.stub(this.cf, "sessionStart");
            bc.subscribe.getCall(0).args[1]("yay");
            assertTrue(this.cf.sessionStart.calledOnce);
            assertTrue(this.cf.sessionStart.calledWithExactly("yay"));

            assertTrue(bc.subscribe.calledWith("/123abc/session/end"));
            this.sandbox.stub(this.cf, "sessionEnd");
            bc.subscribe.getCall(1).args[1]("yay");
            assertTrue(this.cf.sessionEnd.calledOnce);
            assertTrue(this.cf.sessionEnd.calledWithExactly("yay"));
        },

        "test sessionStart": function () {
            var clock = this.sandbox.useFakeTimers();
            this.cf.crossFrame = mockCrossFrame();
            this.cf.sessionStart({resourceContextPath: "/foo"});
            assertEquals("/foo/", this.cf.crossFrame().frame().src);

            assertEquals(typeof(buster.clientReady), "function");

            this.sandbox.stub(this.cf, "exposeBusterObject");
            buster.clientReady();
            assert(this.cf.exposeBusterObject.calledOnce);

            this.cf.crossFrame._window.focus = sinon.spy();
            clock.tick(1);
            assert(this.cf.crossFrame._window.focus.calledOnce);
        },

        "test sessionEnd blanks src on the client frame": function () {
            this.cf.crossFrame = mockCrossFrame();
            this.cf.sessionEnd({});
            assertEquals("", this.cf.crossFrame().frame().src);
        },

        "test exposeBusterObject": function () {
            this.sandbox.stub(Faye, "Client");
            var bayeuxClient = mockFaye();
            Faye.Client.returns(bayeuxClient);
            Faye.Client.calledWithNew();
            this.cf.crossFrame = mockCrossFrame();
            this.cf.crossFrame._window.buster = {};
            this.cf.exposeBusterObject({bayeuxClientUrl: "http://foo/messaging"});

            var busterObject = this.cf.crossFrame().window().buster;
            assertTrue(Faye.Client.calledOnce);
            assertTrue(Faye.Client.calledWithExactly("http://foo/messaging"));

            var listener = function(){};
            bayeuxClient.subscribe.returns("hooligan");
            assertEquals(busterObject.subscribe("/foo", listener), "hooligan");
            assert(bayeuxClient.subscribe.calledOnce);
            assert(bayeuxClient.subscribe.calledWithExactly("/foo", listener));

            bayeuxClient.publish.returns("blabla");
            assertEquals(busterObject.publish("/foo", "bar"), "blabla");
            assert(bayeuxClient.publish.calledOnce);
            assert(bayeuxClient.publish.calledWithExactly("/foo", "bar"));
        },

        "test crossFrame": function () {
            var crossFrame = this.cf.crossFrame();
            assertEquals("client_frame", crossFrame.targetFrameId);
        },

        "test crossFrame reuses the same object": function () {
            assertSame(this.cf.crossFrame(), this.cf.crossFrame());
            assertSame(this.cf.crossFrame(), this.cf.crossFrame());
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