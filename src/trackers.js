const axios = require('axios');
const config = require('./config');
const helper = require('./helpers');

const bestTrackersURL = "https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt";
const blacklistURL = "https://raw.githubusercontent.com/ngosang/trackerslist/master/blacklist.txt";

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
    ///----
    "udp://open.demonii.com:1337/announce",
    "http://tracker.openbittorrent.com:80/announce",
    "udp://uploads.gamecoast.net:6969/announce",
    "udp://tracker1.bt.moack.co.kr:80/announce",
    "udp://tracker.theoks.net:6969/announce",
    "udp://tracker.ccp.ovh:6969/announce",
    "udp://tracker.bittor.pw:1337/announce",
    "udp://tracker.4.babico.name.tr:3131/announce",
    "udp://thouvenin.cloud:6969/announce",
    "udp://sanincode.com:6969/announce",
    "udp://retracker01-msk-virt.corbina.net:80/announce",
    "udp://private.anonseed.com:6969/announce",
    "udp://p4p.arenabg.com:1337/announce"
]

const RUSSIAN_TRACKERS = [
    "udp://opentor.net:6969",
    "http://bt.t-ru.org/ann?magnet",
    "http://bt2.t-ru.org/ann?magnet",
    "http://bt3.t-ru.org/ann?magnet",
    "http://bt4.t-ru.org/ann?magnet",
];

const BLACKLIST_TRACKERS = [
    // these don't resolve
    "udp://ipv4.tracker.harry.lu:80/announce",
    "http://ipv4.tracker.harry.lu:80/announce",
    "udp://ipv6.tracker.harry.lu:80/announce",
    "http://ipv6.tracker.harry.lu:80/announce"
]



const getBlacklistTrackers = async () => {
    try {
        const response = await axios.get(blacklistURL, {
            timeout: 5000, // Set open_timeout and read_timeout using timeout option
            maxRedirects: 0, // Disable redirects
            responseType: 'text', // Specify the response type as text
        });

        if (response.status >= 200 && response.status < 300 && response.data) {
            const trackers = response.data.split('\n').map(line => line.split('#')[0].trim()).filter(line => line.trim() !== '');
            config.debug && console.log(`Downloaded : ${trackers.length} blacklisted trackers.`);
            return trackers;
        }
    } catch (error) {
        console.error('Error fetching blacklistTrackers:', error);
    }
    return [];
};

const getBestTrackers = async () => {
    try {
        const response = await axios.get(bestTrackersURL, {
            timeout: 5000, // Set open_timeout and read_timeout using timeout option
            maxRedirects: 0, // Disable redirects
            responseType: 'text', // Specify the response type as text
        });

        if (response.status >= 200 && response.status < 300 && response.data) {
            const trackers = response.data.split('\n').map(line => line.split('#')[0].trim()).filter(line => line.trim() !== '');
            config.debug && console.log(`Downloaded : ${trackers.length} trackers.`);
            return trackers;
        }
    } catch (error) {
        console.error('Error fetching bestTrackers:', error);
    }
    return [];
};

const getTrackers = async () => {
    let trackers = [];
    let blacklist_trackers = [];
    if (config.addBestTrackers) {
        const bestTrackers = await getBestTrackers();
        trackers = helper.unique(trackers.concat(bestTrackers));
        console.log(`Loading : ${trackers.length} best trackers.`);
    }

    if (config.addRussianTrackers) {
        trackers = helper.unique(trackers.concat(RUSSIAN_TRACKERS));
        console.log(`Loading : ${RUSSIAN_TRACKERS.length} Russian trackers.`);
    }

    if (config.addExtraTrackers) {
        trackers = helper.unique(trackers.concat(EXTRA_TRACKERS));
        console.log(`Loading : ${EXTRA_TRACKERS.length} extra trackers.`);
    }
    if (config.removeBlacklistTrackers) {
        blacklist_trackers = await getBlacklistTrackers();
        blacklist_trackers = helper.unique(blacklist_trackers.concat(BLACKLIST_TRACKERS));
        console.log(`Loading : ${blacklist_trackers.length} blacklisted trackers.`);
    }

    if (trackers.length > 0) {
        console.log(`Loaded : ${trackers.length} trackers.`);
    }

    config.debug && console.log(trackers, blacklist_trackers);
    return {
        trackers: trackers,
        blacklist_trackers: blacklist_trackers
    };

}


module.exports = { getTrackers };
