var bCapServ = require("./../../lib/buster-capture-server");
var when = require("when");
var PhantomFactory = require("./phantom-factory");
var cp = require("child_process");
var sys = require("sys");

module.exports = {
    createServerBundle: function (port, tc, done) {
        var bundle = {};

        var cs = cp.spawn("node", [__dirname + "/server-loader.js", port]);
        cs.stderr.pipe(process.stderr);
        cs.stdout.setEncoding("utf8");
        cs.stdout.once("data", function (data) {
            bundle.port = parseInt(data, 10);
            bundle.c = bCapServ.createServerClient(bundle.port);
            bundle.c.connect();
            bundle.b = new PhantomFactory(bundle.port);
            buster.extend(tc, bundle);
            done();

            cs.stdout.on("data", function (data) {
                sys.print("[SERVER PROCESS] ", data);
            });
        });

        return {
            tearDown: function (done) {
                var promises = [this.tearDownServer(), this.tearDownBrowsers(), bundle.c.disconnect];
                when.all(promises).then(done)
            },

            tearDownServer: function () {
                var deferred = when.defer();

                cs.on("exit", deferred.resolve);
                cs.kill("SIGKILL");

                return deferred.promise;
            },

            tearDownBrowsers: function () {
                return when.all(bundle.b.killAll());
            }
        }
    }
}
