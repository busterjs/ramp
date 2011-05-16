var parser = require("uglify-js").parser;
var uglify = require("uglify-js").uglify;

module.exports = {
    process: function (content) {
        var ast = parser.parse(content);
        ast = uglify.ast_mangle(ast);
        ast = uglify.ast_squeeze(ast);

        return uglify.gen_code(ast);
    }
};