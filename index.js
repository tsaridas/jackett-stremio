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

const version = require('./package.json').version;

global.TRACKERS = [];
global.BLACKLIST_TRACKERS = [];

const respond = (res, data) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'application/json');

    const sortedData = data.streams.sort((a, b) => b.seeders - a.seeders);
    const slicedData = sortedData.slice(0, config.maximumResults)
    config.debug && console.log("Sliced & Sorted data ", slicedData);

    res.send({ "streams": slicedData });
};

async function partitionURLAsync(list) {
    const results = await Promise.all(
        list.map(async (item) => {
            if ('magneturl' in item && item.magneturl && item.magneturl.startsWith("magnet:")) {
                return { magnets: [item], links: [] };
            } else {
                return { magnets: [], links: [item] };
            }
        })
    );

    return results.reduce(
        (acc, result) => ({
            magnets: acc.magnets.concat(result.magnets),
            links: acc.links.concat(result.links),
        }),
        { magnets: [], links: [] }
    );
}

const manifest = {
    "id": "org.stremio.jackett",
    "version": version,

    "name": "Jackett",
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

addon.get('/:jackettKey/manifest.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'application/json');
    config.debug && console.log("Sending manifest.");
    res.send(manifest);
});

const streamFromParsed = (tor, parsedTorrent, params, cb) => {
    const toStream = (parsed) => {
        const infoHash = parsed.infoHash.toLowerCase();

        let title = tor.title || parsed.name;
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
            trackers = helper.unique([].concat(parsed.announce).concat(global.TRACKERS));
            config.debug && console.log("Added extra trackers : " + (trackers.length - parsed.announce.length) + " trackers.");
        }

        if (global.BLACKLIST_TRACKERS) {
            const filteredTrackers = trackers.filter(item => !global.BLACKLIST_TRACKERS.includes(item));
            config.debug && console.log("Removed : " + (trackers.length - filteredTrackers.length) + " blacklisted trackers.");
            trackers = filteredTrackers;
        }

        cb({
            name: "Jackett " + quality,
            // fileIdx: idx,
            type: params.type,
            infoHash: infoHash,
            seeders: tor.seeders,
            sources: trackers.map(x => { return "tracker:" + x; }).concat(["dht:" + infoHash]),
            title: title,
            behaviorHints: {
                bingieGroup: "Jackett-" + quality,
            }
        });
    };

    toStream(parsedTorrent);
};

// stream response
addon.get('/:jackettKey/stream/:type/:id.json', (req, res) => {

    if (!req.params.id || !req.params.jackettKey)
        return respond(res, { streams: [] });

    config.debug && console.log("Received request for :", req.params.type, req.params.id);

    let searchFinished = false;
    let requestSent = false;
    const streams = [];

    const startTime = Date.now();

    const intervalId = setInterval(() => {
        const elapsedTime = Date.now() - startTime;

        if (!requestSent && ((elapsedTime >= config.responseTimeout) || (searchFinished && inProgressCount === 0 && asyncQueue.idle))) {
            console.log("Returning " + streams.length + " results. Timeout: " + (elapsedTime >= config.responseTimeout) + " / Finished Searching: " + searchFinished + " / Queue Idle: " + asyncQueue.idle() + " / inProgressCount : " + inProgressCount)
            asyncQueue.kill();
            clearInterval(intervalId);
            requestSent = true;
            respond(res, { streams: streams });

        }
    }, config.interval);

    const processMagnets = async (task) => {
        if (requestSent) { // Check the flag before processing each task
            return;
        }
        const uri = task.magneturl || task.link;
        config.debug && console.log("Parsing magnet : ", uri);
        const parsedTorrent = parseTorrent(uri);
        streamFromParsed(task, parsedTorrent, req.params, stream => {
            if (stream) {
                streams.push(stream);
            }
        });
    };

    let inProgressCount = 0;
    const processLinks = async (task) => {
        if (requestSent) { // Check the flag before processing each task
            return;
        }
        try {
            inProgressCount++;
            console.log("Processing link ", task.link);
            const response = await needle('get', task.link, {
                open_timeout: 3000,
                read_timeout: 3000,
                parse_response: false
            });

            if (response && response.headers && response.headers.location) {
                if (response.headers.location.startsWith("magnet:")) {
                    task.magneturl = response.headers.location;
                    task.link = response.headers.location;
                    console.log("Sending magnet task for process : ", task.magneturl);
                    processMagnets(task);
                    inProgressCount--;
                } else {
                    config.debug && console.log("Not a magnet link : ", response.headers.location);
                }
            } else {
                console.log(`Processing task: ${task.link}, Queue length: ${asyncQueue.length()}`);
                const parsedTorrent = parseTorrent(response.body);
                streamFromParsed(task, parsedTorrent, req.params, stream => {
                    if (stream) {
                        streams.push(stream);
                    }
                });
                console.log("Parsed torrent from body", parsedTorrent);
                inProgressCount--;
            }
        } catch (err) {
            console.log("error", err);
            inProgressCount--;
        }
    };

    const asyncQueue = async.queue(processLinks, config.downloadTorrentQueue);

    const respondStreams = async (results) => {
        if (requestSent) { // Check the flag before processing each task
            return;
        }
        if (results && results.length) {
            let tempResults = results;
            tempResults = tempResults.sort((a, b) => b.seeders - a.seeders);
            config.debug && console.log("Sorted searches are : ", tempResults.length);

            const { magnets, links } = await partitionURLAsync(tempResults);

            Promise.all([...magnets.map(processMagnets)]);
            links.forEach(item => asyncQueue.push(item));
        }
    };

    const idParts = req.params.id.split(':');
    const imdbId = idParts[0];
    const url = 'https://v3-cinemeta.strem.io/meta/' + req.params.type + '/' + imdbId + '.json';
    config.debug && console.log("Cinemata url", url);

    needle.get(url, { follow: 1 }, (err, resp, body) => {
        if (!err && body && body.meta && body.meta.name) {
            const year = (body.meta.year) ? body.meta.year.match(/\b\d{4}\b/) : (body.meta.releaseInfo) ? body.meta.releaseInfo.match(/\b\d{4}\b/) : ''

            const searchQuery = {
                name: body.meta.name,
                type: req.params.type,
                year: year,
            };

            if (idParts.length == 3) {
                searchQuery.season = idParts[1];
                searchQuery.episode = idParts[2];
                console.log(`Looking for title: ${body.meta.name} - type: ${req.params.type} - year: ${year} - season: ${searchQuery.season} - episode: ${searchQuery.episode}.`);
            } else {
                console.log(`Looking for title: ${body.meta.name} - type: ${req.params.type} - year: ${year}.`);
            }

            jackettApi.search(req.params.jackettKey, searchQuery,

                (tempResults) => {
                    config.debug && console.log("Received " + tempResults.length + " partial results.");
                    respondStreams(tempResults);
                },

                () => {
                    config.debug && console.log("Received all search results.");
                    searchFinished = true;
                });


            if (config.responseTimeout)
                setTimeout(respondStreams, config.responseTimeout);

        } else {
            console.error('Could not get info from Cinemata.', url, err);
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

        console.log('Add-on URL: http://127.0.0.1:' + config.addonPort + '/[my-jackett-key]/manifest.json');

        console.log('Replace "[my-jackett-key]" with your Jackett API Key');

    });
};

runAddon();
