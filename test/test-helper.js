var phantom = require("phantom");
var when = require("when");
var cp = require("child_process");
var sys = require("sys");
var http = require("http");
var URL = require("url");

var buster = require("buster-node");
var assert = buster.assert;
var refute = buster.refute;

var ramp = require("ramp");

var phantomSharedInstance = null;

function fnReturningResolvedPromise() {
    var deferred = when.defer();
    deferred.resolve();
    return deferred.promise;
}

function killProcess(proc) {
    var deferred = when.defer();
    proc.on("exit", deferred.resolve);
    proc.kill("SIGKILL")
    return deferred.promise;
}

module.exports = {
    setUpHelpers: function (testCase, setups) {
        var deferred = when.defer();
        when.all(setups.map(function (f) { return f() })).then(function (res) {
            testCase._tearDownHelperFns = [];
            Array.prototype.slice.call(res).forEach(function (thing) {
                testCase[thing[0]] = thing[1];
                testCase._tearDownHelperFns.push(thing[2]);
            });
            deferred.resolve();
        });
        return deferred.promise;
    },

    tearDownHelpers: function (testCase) {
        return when.all(testCase._tearDownHelperFns.map(function (fn) {
            return fn();
        }))
    },

    ph: function () {
        var deferred = when.defer();
        if (phantomSharedInstance) {
            deferred.resolve(["ph", phantomSharedInstance, fnReturningResolvedPromise]);
        } else {
            console.log("Booting up Phantom.JS...");
            phantom.create(function (ph) {
                phantomSharedInstance = ph;
                deferred.resolve(["ph", phantomSharedInstance, fnReturningResolvedPromise]);
            });
        }
        return deferred.promise;
    },

    rs: function () {
        var deferred = when.defer();

        var cs = cp.spawn("node", [__dirname + "/ramp-server-loader.js"]);
        cs.stderr.pipe(process.stderr);
        cs.stdout.setEncoding("utf8");
        cs.stdout.once("data", function (data) {
            var port = parseInt(data, 10);
            var rampServerUrl = "http://localhost:" + port;

            deferred.resolve([
                "rs",
                {serverUrl: rampServerUrl,
                 captureUrl: rampServerUrl + "/capture",
                 port: port},
                function () {
                    return when.all([killProcess(cs)]);
                }]);

            cs.stdout.on("data", function (data) {
                sys.print("[SERVER PROCESS] ", data);
            });
        });

        return deferred.promise;
    },

    httpGet: function (url, cb) {
        var url = URL.parse(url);

        var body = "";

        http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.path,
            method: "GET"
        }, function (res) {
            res.setEncoding("utf8");
            res.on("data", function (chunk) {
                body += chunk;
            });
            res.on("end", function () {
                cb(res, body);
            })
        }).end();
    },

    failWhenCalled: function () {
        throw new Exception("Expected not to be called.");
    },

    capture: function (test, cb) {
        test.ph.createPage(function (page) {
            page.open(test.rs.captureUrl, function (status) {
                var rc = ramp.createRampClient(test.rs.port);
                cb(rc);
            });
        });
    },

    initializeSession: function (createPromise, cb) {
        createPromise.then(
            function (sessionClientInitializer) {
                sessionClientInitializer.initialize().then(
                    function (sessionClient) { cb(sessionClient) },
                    module.exports.failWhenCalled)
            },
            module.exports.failWhenCalled);
    },

    promiseSuccess: function (promise, cb) {
        promise.then(cb, module.exports.failWhenCalled)
    },

    promiseFailure: function (promise, cb) {
        promise.then(module.exports.failWhenCalled, cb);
    }
};
