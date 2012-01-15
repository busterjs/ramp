var SERVER_PORT = parseInt(phantom.args[0], 10);

var page = new WebPage();
page.onConsoleMessage = function (msg) { console.log("debug " + msg); };

var server = require("webserver").create();
server.listen(SERVER_PORT, function (request, response) {
    if (request.url == "/load") {
        var url = request.headers["X-Phantom-Load-Url"];
        page.open(url, function (status) {
            console.log("page " + status);
        });
    }

    response.statusCode = 200;
    response.write("");
});
console.log("ready 1");