module.exports = {
    process: function (html) {
        if (html instanceof Buffer) {
            html = html.toString("utf8");
        }

        var bodyTag = "</body>";
        var beforeBodyEnd = html.slice(0, html.indexOf(bodyTag));
        var afterBodyEnd = html.slice(beforeBodyEnd.length + bodyTag.length);
        var scriptsHtml = "";

        for (var i = 0, ii = this.scripts.length; i < ii; i++) {
            scriptsHtml += '<script src="' + this.scripts[i] + '" type="text/javascript"></script>\n';
        }

        return beforeBodyEnd + scriptsHtml + afterBodyEnd;
    }
};