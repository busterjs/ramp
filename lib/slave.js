var uuid = require("node-uuid");
var httpServerRequestListenerProxy = require("./http-server-request-listener-proxy");

module.exports = {
    create: function () {
        var instance = Object.create(this);
        instance._id = uuid();
        instance.prisonPath = "/slaves/" + instance._id;
        return instance;
    },

    attach: function (httpServer) {
        httpServerRequestListenerProxy.attach(httpServer, this._respond.bind(this));
    },

    _respond: function (req, res) {
        if (req.method === "GET" && req.path == this.prisonpath) {
            res.writeHead(200);
            res.end();
        }
    }
};