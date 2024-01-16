const needle = require('needle');
const config = require('./config');
const helper = require('./helpers');

const trackerURL = "https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt";
const TRACKERS = [];

const EXTRA_TRACKERS = [
    "udp://47.ip-51-68-199.eu:6969/announce",
    "udp://9.rarbg.me:2940",
    "udp://9.rarbg.to:2820",
    "udp://exodus.desync.com:6969/announce",
    "udp://explodie.org:6969/announce",
    "udp://ipv4.tracker.harry.lu:80/announce",
    "udp://open.stealth.si:80/announce",
    "udp://opentor.org:2710/announce",
    "udp://opentracker.i2p.rocks:6969/announce",
    "udp://retracker.lanta-net.ru:2710/announce",
    "udp://tracker.cyberia.is:6969/announce",
    "udp://tracker.dler.org:6969/announce",
    "udp://tracker.ds.is:6969/announce",
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

const getBestTrackers = async () => {



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

};

const getTrackers = async () => {
    if (config.addBestTrackers) {
        const bestTrackers = await getBestTrackers();
        helper.unique(TRACKERS.concat(bestTrackers));
    }

    if (config.addRussianTrackers) {
        helper.unique(TRACKERS.concat(RUSSIAN_TRACKERS));
    }

    if (config.addExtraTrackers) {
        helper.unique(TRACKERS.concat(EXTRA_TRACKERS));
    }

    return TRACKERS;
        
}


module.exports = { getTrackers };