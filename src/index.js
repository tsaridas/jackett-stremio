const parseTorrent = require('parse-torrent')
const needle = require('needle');
const async = require('async');
const getPort = require('get-port');

const express = require('express');
const addon = express();

const jackettApi = require('./jackett');
const helper = require('./helpers');
const config = require('./config');
const { getTrackers } = require('./trackers');

const version = require('../package.json').version;

global.TRACKERS = [];
global.BLACKLIST_TRACKERS = [];

const respond = (res, data) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'max-age=7200, stale-while-revalidate=14400, stale-if-error=604800, public');
    res.send(data);
};

const manifest = {
    "id": "org.stremio.jackett",
    "version": version,

    "name": config.addonName,
    "description": "Stremio Add-on to get torrent results from Jackett",

    "icon": "https://static1.squarespace.com/static/55c17e7ae4b08ccd27be814e/t/599b81c32994ca8ff6c1cd37/1508813048508/Jackett-logo-2.jpg",

    // set what type of resources we will return
    "resources": [
        {
            "name": "stream",
            "types": [
                "movie",
                "series"
            ],
            "idPrefixes": [
                "tt"
            ]
        }
    ],

    // works for both movies and series
    "types": ["movie", "series"],

    // prefix of item IDs (ie: "tt0032138")
    "idPrefixes": ["tt"],

    "catalogs": []
};

addon.get('/manifest.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'application/json');
    config.debug && console.log("Sending manifest.");
    res.send(manifest);
});

function partitionURL(list) {
    const results = list.map((item) => {
        if ('magneturl' in item && item.magneturl && item.magneturl.startsWith("magnet:")) {
            return { magnets: [item], links: [] };
        } else {
            return { magnets: [], links: [item] };
        }
    });

    return results.reduce(
        (acc, result) => ({
            magnets: acc.magnets.concat(result.magnets),
            links: acc.links.concat(result.links),
        }),
        { magnets: [], links: [] }
    );
}

function processTorrentList(torrentList) {
    const duplicatesMap = new Map();

    torrentList.forEach(torrent => {
        const infoHash = torrent.infoHash;

        // Check if infoHash is already in the map
        if (duplicatesMap.has(infoHash)) {
            // If duplicate, update if the current torrent has higher seeders
            const existingTorrent = duplicatesMap.get(infoHash);
            if (torrent.seeders > existingTorrent.seeders) {
                duplicatesMap.set(infoHash, {
                    ...torrent,
                    sources: helper.unique([...existingTorrent.sources, ...torrent.sources]),
                });
            }
        } else {
            duplicatesMap.set(infoHash, torrent);
        }
    });

    // Filter out torrents with the same infoHash
    const uniqueTorrents = [...duplicatesMap.values()];

    // Sort the array by seeders in descending order
    uniqueTorrents.sort((a, b) => b.seeders - a.seeders);
    // Move the sources starting with 'dht' to the end of the list
    uniqueTorrents.forEach(torrent => {
        const dhtSources = torrent.sources.filter(source => source.startsWith('dht'));
        const nonDhtSources = torrent.sources.filter(source => !source.startsWith('dht'));
        torrent.sources = [...nonDhtSources, ...dhtSources];
    });
    const slicedTorrents = uniqueTorrents.slice(0, config.maximumResults);

    return slicedTorrents;
}

const streamFromParsed = (tor, parsedTorrent, streamInfo, cb) => {
    const stream = {};

    const infoHash = parsedTorrent.infoHash.toLowerCase();
    if (parsedTorrent && parsedTorrent.files) {
        if (parsedTorrent.files.length == 1) {
            stream.fileIdx = 0;
        } else {
            let regEx = null;
            if (streamInfo.type === 'movie') {
                regEx = new RegExp(`${streamInfo.name.split(' ').join('.*')}.*${streamInfo.year}.*`, 'i');
            } else {
                regEx = new RegExp(`${streamInfo.name.split(' ').join('.*')}.*${helper.episodeTag(streamInfo.season, streamInfo.episode)}.*`, 'i');
            }
            const matchingItems = parsedTorrent.files.filter(item => regEx.test(item.name));
            if (matchingItems.length > 0) {
                const indexInFiles = parsedTorrent.files.indexOf(matchingItems.reduce((maxItem, currentItem) => {
                    return currentItem.length > maxItem.length ? currentItem : maxItem;
                }, matchingItems[0]));

                stream.fileIdx = indexInFiles;
                config.debug && console.log("Found matching fileIdx for " + streamInfo.name + " is " + stream.fileIdx, parsedTorrent.files);
            } else {
                config.debug && console.log("No matching items found for torrent ", streamInfo.name, matchingItems, parsedTorrent.files);
            }
        }
    }
    let title = tor.title || parsedTorrent.name;
    const subtitle = `👤 ${tor.seeders}/${tor.peers}  💾 ${helper.toHomanReadable(tor.size)}  ⚙️  ${tor.from}`;

    title += (title.indexOf('\n') > -1 ? '\r\n' : '\r\n\r\n') + subtitle;
    const regex = /DLRip|HDTV|\b(DivX|XviD)\b|\b(?:DL|WEB|BD|BR)MUX\b|\bWEB-?Rip\b|\bWEB-?DL\b|\bBluray\b|\bVHSSCR\b|\bR5\b|\bPPVRip\b|\bTC\b|\b(?:HD-?)?TVRip\b|\bDVDscr\b|\bDVD(?:R[0-9])?\b|\bDVDRip\b|\bBDRip\b|\bBRRip\b|\bHD-?Rip\b|\b(?:HD-?)?T(?:ELE)?S(?:YNC)?\b|\b(?:HD-?)?CAM\b|(4k)|([0-9]{3,4}[pi])/i;
    const match = tor.extraTag.match(regex);
    let quality = "";
    if (match !== null) {
        quality = match[0];
    }
    let trackers = [];
    if (global.TRACKERS) {
        trackers = helper.unique([].concat(parsedTorrent.announce).concat(global.TRACKERS));
        config.debug && ((trackers.length - parsedTorrent.announce.length) > 0) && console.log("Added " + (trackers.length - parsedTorrent.announce.length) + " extra trackers.");
    }

    if (global.BLACKLIST_TRACKERS) {
        const filteredTrackers = trackers.filter(item => !global.BLACKLIST_TRACKERS.includes(item));
        if ((trackers.length - filteredTrackers.length) != 0) {
            config.debug && console.log("Removed : " + (trackers.length - filteredTrackers.length) + " blacklisted trackers.");
            trackers = filteredTrackers;
        }
    }


    stream.name = "Jackett " + quality;
    stream.type = streamInfo.type;
    stream.infoHash = infoHash;
    stream.seeders = tor.seeders;
    stream.sources = trackers.map(x => { return "tracker:" + x; }).concat(["dht:" + infoHash]);
    stream.title = title;
    stream.behaviorHints = {
        bingieGroup: "Jackett|" + quality,
    }
    cb(stream);
};

// stream response
addon.get('/stream/:type/:id.json', (req, res) => {

    if (!req.params.id)
        return respond(res, { streams: [] });

    config.debug && console.log("Received request for :", req.params.type, req.params.id);

    let searchFinished = false;
    let requestSent = false;
    let streamInfo = {};

    const streams = [];
    let inProgressCount = 0;
    const startTime = Date.now();

    const intervalId = setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        if (!requestSent && ((elapsedTime >= config.responseTimeout) || (searchFinished && inProgressCount === 0 && asyncQueue.idle))) {
            requestSent = true;
            asyncQueue.kill();
            clearInterval(intervalId);
            const finalData = processTorrentList(streams);
            config.debug && console.log("Sliced & Sorted data ", finalData);
            console.log("A / imdbiID: " + streamInfo.imdbId + " / Results " + finalData.length + " / Timeout: " + (elapsedTime >= config.responseTimeout) + " / Search Finished: " + searchFinished + " / Queue Idle: " + asyncQueue.idle() + " / Pending Downloads : " + inProgressCount + " / Discarded : " + (streams.length - finalData.length));
            respond(res, { streams: finalData });
        }
    }, config.interval);

    const processMagnets = async (task) => {
        if (requestSent) { // Check the flag before processing each task
            return;
        }
        const uri = task.magneturl || task.link;
        config.debug && console.log("Parsing magnet :", uri);
        const parsedTorrent = parseTorrent(uri);
        streamFromParsed(task, parsedTorrent, streamInfo, stream => {
            if (stream) {
                streams.push(stream);
            }
        });
    };

    const processLinks = async (task) => {
        if (requestSent) { // Check the flag before processing each task
            return;
        }
        inProgressCount++;
        try {
            config.debug && console.log("Processing link: ", task.link);
            const response = await needle('get', task.link, {
                open_timeout: config.jackett.openTimeout,
                read_timeout: config.jackett.readTimeout,
                parse_response: false
            });
            if (requestSent || response.statusCode >= 400) { // It usually takes some time to dowload the torrent file and we don't want to continue.
                config.debug && console.log("Abort processing of : " + task.link + " - " + (requestSent || response.statusCode))
                inProgressCount--;
                return;
            }
            if (response && response.headers && response.headers.location) {
                if (response.headers.location.startsWith("magnet:")) {
                    task.magneturl = response.headers.location;
                    task.link = response.headers.location;
                    config.debug && console.log("Sending magnet task for process :", task.magneturl);
                    processMagnets(task);

                } else {
                    config.debug && console.error("Not a magnet link :", response.headers.location);
                }
            } else {
                config.debug && console.log(`Processing torrent : ${task.link}.`);
                const parsedTorrent = parseTorrent(response.body);
                streamFromParsed(task, parsedTorrent, streamInfo, stream => {
                    if (stream) {
                        streams.push(stream);
                    }
                });
                config.debug && console.log("Parsed torrent : ", task.link);
            }
        } catch (err) {
            config.debug && console.log("Error processing link :", task.link, err);
        }
        inProgressCount--;
    };

    const asyncQueue = async.queue(processLinks, config.downloadTorrentQueue);

    const respondStreams = async (results) => {
        if (requestSent) { // Check the flag before processing each task
            return;
        }
        if (results && results.length) {
            const { magnets, links } = await partitionURL(results);
            Promise.all([...magnets.map(processMagnets)]);
            links.forEach(item => asyncQueue.push(item));
        }
    };

    const idParts = req.params.id.split(':');
    const imdbId = idParts[0];
    const url = 'https://v3-cinemeta.strem.io/meta/' + req.params.type + '/' + imdbId + '.json';
    config.debug && console.log("Cinemata url", url);

    needle.get(url, { follow: 1, open_timeout: 3000, read_timeout: config.responseTimeout }, (err, resp, body) => {
        if (!err && body && body.meta && body.meta.name) {
            const year = (body.meta.year) ? body.meta.year.match(/\b\d{4}\b/) : (body.meta.releaseInfo) ? body.meta.releaseInfo.match(/\b\d{4}\b/) : ''

            streamInfo = {
                name: body.meta.name,
                type: req.params.type,
                year: year,
                imdbId: imdbId,
            };

            if (idParts.length == 3) {
                streamInfo.season = idParts[1];
                streamInfo.episode = idParts[2];
                console.log(`Q / imdbiID: ${imdbId} / title: ${streamInfo.name} / type: ${streamInfo.type} / year: ${year} / season: ${streamInfo.season} / episode: ${streamInfo.episode}.`);
            } else {
                console.log(`Q / imdbiID: ${imdbId} / title: ${streamInfo.name} / type: ${streamInfo.type} / year: ${year}.`);
            }

            jackettApi.search(streamInfo,

                (tempResults) => {
                    respondStreams(tempResults);
                },

                () => {
                    config.debug && console.log("Searching finished.");
                    searchFinished = true;
                }
            );

        } else {
            console.error('Could not get info from Cinemata.', url, err);
            clearInterval(intervalId);
            requestSent = true;
            respond(res, { streams: [] });
        }
    });

});

const runAddon = async () => {

    config.addonPort = await getPort({ port: config.addonPort });

    console.log(config);

    const { trackers, blacklist_trackers } = await getTrackers();

    global.TRACKERS = trackers;
    global.BLACKLIST_TRACKERS = blacklist_trackers;

    addon.listen(config.addonPort, () => {

        console.log('Add-on Manifest URL: http://{{ YOUR IP ADDRESS }}:' + config.addonPort + '/manifest.json');
    });
};

runAddon();
