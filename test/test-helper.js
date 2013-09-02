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

function ensureSlavePresent(rc, slaveId, page, cb) {
    rc.getSlaves().then(function (slaves) {
        var slave = slaves.filter(function (s) {
            return s.id == slaveId
        })[0];

        if (slave) {
            cb(rc, page, slaveId);
        } else {
            ensureSlavePresent(rc, slaveId, page, cb);
        }
    });
}

module.exports = {
    setUpHelpers: function (testCase, setups) {
        var deferred = when.defer();
        when.all(setups.map(function (f) { return f() })).then(function (res) {
            testCase._tearDownHelperFns = [];
            Array.prototype.slice.call(res).forEach(function (thing) {
                testCase[thing.name] = thing.value;
                testCase._tearDownHelperFns.push(thing.tearDown);
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
            deferred.resolve({name: "ph", value: phantomSharedInstance, tearDown: phantomSharedInstance.tearDown});
        } else {
            console.log("Booting up Phantom.JS...");
            phantom.create(function (instance) {
                console.log("Phantom.JS booted!");
                phantomSharedInstance = {
                    pages: [],
                    instance: instance,
                    createPage: function (cb) {
                        instance.createPage(function (page) {
                            phantomSharedInstance.pages.push(page);
                            cb(page)
                        });
                    },
                    tearDown: function () {
                        var pages = phantomSharedInstance.pages;
                        phantomSharedInstance.pages = [];
                        return when.all(pages.map(function (page) {
                            page.close();
                        }));
                    }
                };
                deferred.resolve({name: "ph", value: phantomSharedInstance, tearDown: phantomSharedInstance.tearDown});
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

            deferred.resolve({
                name: "rs",
                value: {
                    serverUrl: rampServerUrl,
                    captureUrl: rampServerUrl + "/capture",
                    port: port
                },
                tearDown: function () {
                    return when.all([killProcess(cs)]);
                }
            });

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

    failWhenCalled: function (err) {
        console.log("Unexpeced call", err);
    },

    capture: function (test, cb) {
        test.ph.createPage(function (page) {
            page.set("onConsoleMessage", function (msg) {
                console.log("[PHANTOM CONSOLE]", msg);
            })


            page.open(test.rs.captureUrl, function (status) {
                page.get("url", function (url) {
                    var slaveId = /^[a-z]+:\/\/[^\/]+\/slaves\/([^\/]+)/.exec(url)[1];

                    var rc = ramp.createRampClient(test.rs.port);
                    ensureSlavePresent(rc, slaveId, page, cb);
                });
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
