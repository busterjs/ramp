var when = require("when");

function concatBuffersIter (buffers, result, idx) {
    if (buffers.length === 0) {
        return result;
    } else {
        var buffer = buffers[0];
        buffer.copy(result, idx);
        return concatBuffersIter(buffers.slice(1), result, idx + buffer.length);
    }
};

function concatBuffers (buffers) {
    var length = buffers.reduce(function (total, buf) { return total += buf.length }, 0);
    return concatBuffersIter(buffers, new Buffer(length), 0);
};

function concatHttpBody (bodyStream) {
    var deferred = when.defer();
    var buffers = [];
    bodyStream.on("data", function (chunk) {
        buffers.push(chunk);
    });
    bodyStream.on("end", function () {
        deferred.resolve(concatBuffers(buffers));
    });
    return deferred.promise;
};

module.exports.concatBuffers = concatBuffers;
module.exports.concatHttpBody = concatHttpBody;
