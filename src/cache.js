const cache = {};

function setCacheVariable(key, value, expirationMinutes) {
    cache[key] = {
        value,
        expirationTime: Date.now() + expirationMinutes * 60 * 1000,
    };
}

function getCacheVariable(key, renewalMinutes = 0) {
    const cachedItem = cache[key];

    if (cachedItem && Date.now() < cachedItem.expirationTime) {
        // Renew the expiration time
        if (renewalMinutes > 0) {
            cachedItem.expirationTime = Date.now() + renewalMinutes * 60 * 1000;
        }
        return cachedItem.value;
    }
    return null;
}

function cleanupExpiredItems() {
    const currentTime = Date.now();
    for (const key in cache) {
        const cachedItem = cache[key];
        if (currentTime >= cachedItem.expirationTime) {
            delete cache[key];
        }
    }
}

// Call the cleanup function periodically, every 60 minutes
setInterval(cleanupExpiredItems, 60 * 60 * 1000);

module.exports = {
    setCacheVariable,
    getCacheVariable,
};