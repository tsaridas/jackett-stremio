const parseTorrent = require('parse-torrent')
const ptt = require("parse-torrent-title");

const needle = require('needle');
const async = require('async');
const getPort = require('get-port');

const express = require('express');
const addon = express();

const jackettApi = require('./jackett');
const config = require('./config');

console.log(config);

const version = require('./package.json').version;

const respond = (res, data) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'application/json');

    const sortedData = data.streams.sort((a, b) => b.seeders - a.seeders);
    slicedData = sortedData.slice(0, config.maximumResults)
    config.debug && console.log("Sorted data ", slicedData);

    const ret = { "streams": slicedData };
    res.send(ret);
};

function toHomanReadable(bytes) {
    if (Math.abs(bytes) < 1024) { return bytes + ' B'; }

    const units = ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    let i = -1;
    do {
        bytes /= 1024;
        ++i;
    } while (Math.abs(bytes) >= 1024 && i < units.length - 1);

    return bytes.toFixed(1) + " " + units[i];
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

const streamFromMagnet = (tor, parsedTorrent, params, cb) => {
    const toStream = (parsed) => {
        const infoHash = parsed.infoHash.toLowerCase();

        let title = tor.title || parsed.name;
        const subtitle = `👤 ${tor.seeders}/${tor.peers}  💾 ${toHomanReadable(tor.size)}  ⚙️  ${tor.from}`;

        title += (title.indexOf('\n') > -1 ? '\r\n' : '\r\n\r\n') + subtitle;
        const regex = /HDTV|\b(DivX|XviD)\b|\b(?:DL|WEB|BD|BR)MUX\b|\bWEB-?Rip\b|\bWEB-?DL\b|\bBluray\b|\bVHSSCR\b|\bR5\b|\bPPVRip\b|\bTC\b|\b(?:HD-?)?TVRip\b|\bDVDscr\b|\bDVD(?:R[0-9])?\b|\bDVDRip\b|\bBDRip\b|\bBRRip\b|\bHD-?Rip\b|\b(?:HD-?)?T(?:ELE)?S(?:YNC)?\b|\b(?:HD-?)?CAM\b|(4k)|([0-9]{3,4}[pi])/i;
        const match = tor.extraTag.match(regex);
        let quality = "";
        if (match !== null) {
            quality = match[0];
        }

        cb({
            name: "Jackett " + quality,
            // fileIdx: idx,
            type: params.type,
            infoHash: infoHash,
            seeders: tor.seeders,
            sources: (parsed.announce || []).map(x => { return "tracker:" + x; }).concat(["dht:" + infoHash]),
            title: title,
            behaviorHints: {
                bingieGroup: "Jackett|" + infoHash
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

    let finished = false;
    let streams = [];

    let startTime = Date.now();
    const intervalId = setInterval(() => {
        const elapsedTime = Date.now() - startTime;

        if (elapsedTime >= config.responseTimeout || finished) {
            console.log("Returning " + streams.length + " results. Timeout: " + (elapsedTime >= config.responseTimeout) + " Finished: "+ finished)
            clearInterval(intervalId);
            respond(res, { streams: streams });

        }
    }, config.interval);

    const respondStreams = async (results) => {

        if (results && results.length) {

            let tempResults = results;
            tempResults = tempResults.sort((a, b) => b.seeders - a.seeders);
            config.debug && console.log("Sorted Streams are ", tempResults.length);

            const processMagnets = async (task) => {
                if (finished) { // Check the flag before processing each task
                    return;
                }
                const uri = task.magneturl || task.link;
                config.debug && console.log("Parsing magnet", uri);
                const parsedTorrent = parseTorrent(uri);
                streamFromMagnet(task, parsedTorrent, req.params, stream => {
                    if (stream) {
                        streams.push(stream);
                    }
                });
            }
            await Promise.all(tempResults.map(processMagnets));
        }
    };

    const idParts = req.params.id.split(':');

    const imdbId = idParts[0];
    const url = 'https://v3-cinemeta.strem.io/meta/' + req.params.type + '/' + imdbId + '.json';
    config.debug && console.log("Cinemata url", url);
    needle.get(url, { follow: 1 }, (err, resp, body) => {
        if (!err && body && body.meta && body.meta.name) {
            const year = (body.meta.year) ? body.meta.year.replace(/-$/, '') : (body.meta.releaseInfo) ? body.meta.releaseInfo.replace(/-$/, '') : '';

            const searchQuery = {
                name: body.meta.name,
                type: req.params.type,
                year: year,
            };

            console.log(`Looking for title: ${body.meta.name} - type: ${req.params.type} - year: ${year}.`);

            if (idParts.length == 3) {
                searchQuery.season = idParts[1];
                searchQuery.episode = idParts[2];
            }

            jackettApi.search(req.params.jackettKey, searchQuery,

                partialResponse = (tempResults) => {
                    config.debug && console.log("Received partial " + tempResults.length + " partial results.");
                    respondStreams(tempResults);
                },

                endResponse = (tempResults) => {
                    config.debug && console.log("Received all results.");
                    finished = true;
                });


            if (config.responseTimeout)
                setTimeout(respondStreams, config.responseTimeout);

        } else {
            console.error('Could not get info from Cinemata.', url, err);
            respond(res, { streams: [] });
        }
    });

});

if (process && process.argv)
    process.argv.forEach((cmdLineArg) => {
        if (cmdLineArg == '-v') {
            // version check
            console.log('v' + version);
            process.exit();
        }
    });

const runAddon = async () => {

    config.addonPort = await getPort({ port: config.addonPort });

    addon.listen(config.addonPort, () => {

        console.log('Add-on URL: http://127.0.0.1:' + config.addonPort + '/[my-jackett-key]/manifest.json');

        console.log('Replace "[my-jackett-key]" with your Jackett API Key');

    });
};

runAddon();