var fs = require("fs");
var path = require("path");

/*
 * Holds a list of scripts. A script is:
 *
 *    {
 *        path: "/will/be/served/here.js",
 *        read: function (done) { done("contents of file here"); }
 *    }
 *
 * contextPath will be appended to the path of the script.
 */
module.exports = {
    contextPath: "",

    respond: function (req, res) {
        for (var i = 0, ii = this.scripts.length; i < ii; i++) {
            var script = this.scripts[i];
            if (req.method == "GET" && req.url == (this.contextPath + script.path)) {
                res.writeHead(200, {"Content-Type": "text/javascript"});
                script.read(function (data) {
                    res.write(data);
                    res.end();
                });
                return true;
            }
        }
    },

    requireFile: function (file) {
        this.scripts.push({
            path: path.normalize(file) + ".js",
            read: function (done) {
                fs.readFile(file, function (err, data) {
                    if (err) throw err;
                    done(data);
                });
            }
        });
    },

    get scripts() {
        return this._scripts || (this._scripts = []);
    }
}