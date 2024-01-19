const needle = require('needle');
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

const getBlacklistTrackers = async () => {
    const response = await needle('get', blacklistURL, {
        open_timeout: 5000,
        read_timeout: 10000,
        parse_response: false
    });

    if (response && response.statusCode >= 200 && response.statusCode < 300 && response.headers && response.body) {
        const trackers = response.body.split('\n').map(line => line.split('#')[0].trim()).filter(line => line.trim() !== '');
        config.debug && console.log(`Downloaded : ${trackers.length} blacklisted trackers.`);
        return trackers;
    }
    return [];
};

const getBestTrackers = async () => {
    const response = await needle('get', bestTrackersURL, {
        open_timeout: 5000,
        read_timeout: 10000,
        parse_response: false
    });

    if (response && response.statusCode >= 200 && response.statusCode < 300 && response.headers && response.body) {
        const trackers = response.body.split('\n').map(line => line.split('#')[0].trim()).filter(line => line.trim() !== '');
        config.debug && console.log(`Downloaded : ${trackers.length} trackers.`);
        return trackers;
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
        console.log(`Loading : ${blacklist_trackers.length} blacklisted trackers.`);
    }
    
    if (trackers.length > 0) {
        console.log(`Loaded : ${trackers.length} trackers.`);
    }

    config.debug && console.log(trackers);
    return {
        trackers: trackers,
        blacklist_trackers: blacklist_trackers
    };

}


module.exports = { getTrackers };
