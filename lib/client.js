var fs = require("fs");
var html = {
    index: fs.readFileSync(__dirname + "/templates/client.html")
};

module.exports = {
    respond: function (req, res, pathname) {
        if (req.method == "GET" && pathname == this.url) {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.write(html.index);
            res.end();
            return true;
        }
    },

    get url() {
        return "/clients/" + this.id;
    }
};