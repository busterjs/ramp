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


/** Returns a function whose first argument is a cache key. When the cache key
    changes, f is called with the rest of the arguments after the cache key. The
    return value from f is cached and returned. */
module.exports.memoizeSingleton = function (f) {
    var cachedHashCode;
    var cachedValue;

    return function () {
        var args = mori.prim_seq(arguments);
        var hashCode = mori.first(args);
        var rest = mori.rest(args);

        if (hashCode !== cachedHashCode) {
            cachedHashCode = hashCode;
            cachedValue = f.apply(this, mori.into_array(rest));
        }

        return cachedValue
    };
};
