const cache = {};

function setCacheVariable(key, value, expirationMinutes) {
    cache[key] = {
        value,
        expirationTime: Date.now() + expirationMinutes * 60 * 1000,
    };
}

function getCacheVariable(key) {
    const cachedItem = cache[key];

    if (cachedItem && Date.now() < cachedItem.expirationTime) {
        return cachedItem.value;
    }

    // Return null if the cache has expired or the key doesn't exist
    return null;
}

module.exports = {
    setCacheVariable,
    getCacheVariable,
};