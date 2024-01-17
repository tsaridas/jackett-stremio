const needle = require('needle');
const config = require('./config');
const helper = require('./helpers');

const bestTrackersURL = "https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt";
const blacklistURL = "https://raw.githubusercontent.com/ngosang/trackerslist/master/blacklist.txt";
let TRACKERS = [];
let BLACKLIST_TRACKERS = [];

const EXTRA_TRACKERS = [
    "udp://47.ip-51-68-199.eu:6969/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://explodie.org:6969/announce",
    "udp://open.stealth.si:80/announce",
    "udp://opentracker.i2p.rocks:6969/announce",
    "udp://tracker.dler.org:6969/announce",
    "udp://tracker.internetwarriors.net:1337",
    "udp://tracker.openbittorrent.com:6969/announce",
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://tracker.tiny-vps.com:6969/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://valakas.rollo.dnsabr.com:2710/announce",
    "udp://www.torrent.eu.org:451/announce",
]

const RUSSIAN_TRACKERS = [
    "udp://opentor.net:6969",
    "http://bt.t-ru.org/ann?magnet",
    "http://bt2.t-ru.org/ann?magnet",
    "http://bt3.t-ru.org/ann?magnet",
    "http://bt4.t-ru.org/ann?magnet",
];

const getBlacklistTrackers = async () => {
    const response = await needle('get', blacklistURL, {
        open_timeout: 5000,
        read_timeout: 10000,
        parse_response: false
    });

    if (response && response.headers && response.body) {
        const trackers = response.body.split('\n').filter(line => line.trim() !== '');
        config.debug && console.log(`Downloaded ${trackers.length} blacklisted trackers.`);
        return trackers;
    }
};

const getBestTrackers = async () => {
    const response = await needle('get', bestTrackersURL, {
        open_timeout: 5000,
        read_timeout: 10000,
        parse_response: false
    });

    if (response && response.headers && response.body) {
        const trackers = response.body.split('\n').filter(line => line.trim() !== '');
        config.debug && console.log(`Downloaded ${trackers.length} trackers.`);
        return trackers;
    }
};

const getTrackers = async () => {
    if (config.addBestTrackers) {
        const bestTrackers = await getBestTrackers();
        TRACKERS = helper.unique(TRACKERS.concat(bestTrackers));
    }

    if (config.addRussianTrackers) {
        TRACKERS = helper.unique(TRACKERS.concat(RUSSIAN_TRACKERS));
    }

    if (config.addExtraTrackers) {
        TRACKERS = helper.unique(TRACKERS.concat(EXTRA_TRACKERS));
    }

    BLACKLIST_TRACKERS = await getBlacklistTrackers();
    console.log(`Loading ${TRACKERS.length} trackers.`);
    return TRACKERS, BLACKLIST_TRACKERS;

}


module.exports = { getTrackers };
