const Agent = require('agentkeepalive');
const axios = require('axios');

const createHttpAgent = () => {
    return new Agent({
        maxSockets: 50,
        maxFreeSockets: 5,
        timeout: 60000,
        freeSocketTimeout: 30000,
    });
}

const createHttpsAgent = () => {
    return new Agent.HttpsAgent({
        maxSockets: 50,
        maxFreeSockets: 5,
        timeout: 60000,
        freeSocketTimeout: 30000,
    });
}

function configureConnectionPooling() {
    axios.defaults.httpAgent = createHttpAgent();
    axios.defaults.httpsAgent = createHttpsAgent();
}

module.exports = { configureConnectionPooling };