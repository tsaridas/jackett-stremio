const needle = require('needle');
const config = require('./config');

const trackerURL = "https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt";

const getBestTrackers = async () => {
    if ( ! config.addBestTrackers) {
        return [];
    }
    try {
        const response = await needle('get', trackerURL, {
            open_timeout: 5000,
            read_timeout: 10000,
            parse_response: false
        });

        if (response && response.headers && response.body) {
            const trackers = response.body.split('\n').filter(line => line.trim() !== '');
            console.log(`Found ${trackers.length} best trackers.`);
            return trackers;
        }
    } catch (err) {
        console.log('Error when fetching best trackers.', err);
        throw err; // Rethrow the error to be handled by the caller if needed
    }
};

module.exports = { getBestTrackers };