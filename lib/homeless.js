var mori = require("mori");

module.exports.moriHashMapToObj = function (hashMap) {
    var obj = {};
    mori.each(hashMap, function (tuple) {
        obj[mori.nth(tuple, 0)] = mori.nth(tuple, 1);
    });
    return obj;
};


module.exports.moriObjToHashMap = function (obj) {
    return mori.zipmap(Object.keys(obj), Object.keys(obj).map(function (k) { return obj[k] }))
};
