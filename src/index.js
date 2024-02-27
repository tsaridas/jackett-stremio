const parseTorrent = require('parse-torrent')
const async = require('async');
const axios = require('axios');
const getPort = require('get-port');
const express = require('express');
const { AbortController } = require('abort-controller');
const addon = express();
const jackettApi = require('./jackett');
const helper = require('./helpers');
const config = require('./config');
const { getTrackers } = require('./trackers');
const { configureConnectionPooling } = require('./requests');
const { setCacheVariable, getCacheVariable } = require('./cache');
const version = require('../package.json').version;

global.TRACKERS = [];
global.BLACKLIST_TRACKERS = [];

const respond = (res, data) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
};

const manifest = {
    "id": "org.stremio.jackett",
    "version": version,

    "name": config.addonName,
    "description": "Stremio Add-on to get torrent results from Jackett",

    "icon": "https://svgur.com/i/12Ss.svg",
    "logo": "https://uxwing.com/wp-content/themes/uxwing/download/clothes-and-accessories/hoodie-jacket-icon.png",

    "resources": [
        {
            "name": "stream",
            "types": [
                "movie",
                "series"
            ],
            "idPrefixes": [
                "tt",
                "tmdb"
            ]
        }
    ],

    "behaviorHints": {
        "p2p": true,
        "configurable": false,
        "adult": false,
        "configurationRequired": false
    },

    // works for both movies and series
    "types": ["movie", "series"],

    // prefix of item IDs (ie: "tt0032138")
    "idPrefixes": ["tt", "tmdb"],

    "catalogs": []
};

addon.get('/manifest.json', (req, res) => {
    console.log("Sending manifest.");
    respond(res, manifest);
});

async function getStreamInfo(streamInfo, abortSignals) {
    let url = "";
    if (streamInfo.db === 'tt') {
        url = 'https://v3-cinemeta.strem.io/meta/' + streamInfo.type + '/' + streamInfo.Id + '.json';
    } else if (streamInfo.db == 'tmdb' && config.tmdbAPIKey) {
        const type = streamInfo.type == 'movie' ? "movie" : "tv";
        url = 'https://api.themoviedb.org/3/' + type + '/' + streamInfo.Id + '?api_key=' + config.tmdbAPIKey;
    } else {
        throw new Error(`Could not get info from Cinemata`);
    }

    config.debug && console.log("DB url", url);
    const controller = new AbortController();
    abortSignals.push(controller)
    const signal = controller.signal;

    const response = await axios({
        method: 'get',
        url: url,
        maxRedirects: 5,  // Equivalent to 'redirect: 'follow'' in fetch
        timeout: config.responseTimeout,
        signal: signal,  // Assuming 'signal' is an AbortSignal instance
        responseType: 'json'
    });

    const index = abortSignals.indexOf(controller);
    if (index !== -1) {
        abortSignals.splice(index, 1); // Remove the controller from the array
    }

    const responseBody = response.data;
    if (streamInfo.db === 'tt') {
        if (!responseBody) {
            throw new Error(`Could not get info from Cinemata: ${url} - ${response.status}`);
        }

        streamInfo.name = responseBody.meta.name;
        streamInfo.year = (responseBody.meta.year) ? responseBody.meta.year.match(/\b\d{4}\b/)[0] : (responseBody.meta.releaseInfo) ? responseBody.meta.releaseInfo.match(/\b\d{4}\b/)[0] : '';
    } else {
        if (!responseBody) {
            throw new Error(`Could not get info from tmdb: ${url} - ${response.status}`);
        }
        streamInfo.name = responseBody.name ? responseBody.name : responseBody.title;
        streamInfo.year = (responseBody.release_date) ? responseBody.release_date.match(/\b\d{4}\b/)[0] : (responseBody.last_air_date) ? responseBody.last_air_date.match(/\b\d{4}\b/)[0] : '';
    }
}

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
    if (torrentList.length === 0) {
        return [];
    }
    const duplicatesMap = new Map();

    torrentList.forEach(torrent => {
        const infoHash = torrent.infoHash;

        if (torrent.seeders < config.minimumSeeds) {
            return;
        }

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

function streamFromParsed(tor, parsedTorrent, streamInfo, cb) {
    const stream = {};
    const infoHash = parsedTorrent.infoHash.toLowerCase();

    if (parsedTorrent && parsedTorrent.files) {
        if (parsedTorrent.files.length == 1) {
            stream.fileIdx = 0;
        } else {
            let regEx = null;
            if (streamInfo.type === 'movie') {
                regEx = new RegExp(`${streamInfo.name.split(' ').join('.*')}.*${config.searchByYear && streamInfo.year ? streamInfo.year : ''}.*`, 'i');
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
    } else {
        stream.fileIdx = null;
    }
    let title = streamInfo.name + ' ' + (streamInfo.season && streamInfo.episode ? ` ${helper.episodeTag(streamInfo.season, streamInfo.episode)}` : streamInfo.year);
    const subtitle = `👤 ${tor.seeders}/${tor.peers}  💾 ${helper.toHomanReadable(tor.size)} ⚙️ ${tor.from}`;

    title += (title.indexOf('\n') > -1 ? '\r\n' : '\r\n\r\n') + subtitle;
    const quality = helper.findQuality(tor.extraTag)

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

    stream.name = config.addonName + "\n" + quality;
    stream.tag = quality
    stream.type = streamInfo.type;
    stream.infoHash = infoHash;
    stream.sources = trackers.map(x => { return "tracker:" + x; }).concat(["dht:" + infoHash]);
    stream.title = title;
    stream.seeders = tor.seeders;
    stream.behaviorHints = {
        bingieGroup: "Jackett|" + infoHash,
    }
    cb(stream);
}

async function addResults(info, streams, source, abortSignals) {

    const [url, name] = source.split("||").length === 2 ? source.split("||") : [null, null];
    if (!url && !name) {
        console.error("Additional Sources not configured correctly.")
        return;
    }

    try {
        const controller = new AbortController();
        abortSignals.push(controller);
        const signal = controller.signal;

        const streamUrl = url + info.type + '/' + info.Id + (info.season && info.episode ? ':' + info.season + ':' + info.episode + '.json' : '.json');
        config.debug && console.log('Additional source url is :', streamUrl)
        const response = await axios.get(streamUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "Accept-Encoding": "gzip, deflate",
                "Accept-Language": "en-US,en;q=0.9,el;q=0.8",
                'Cache-Control': 'public, max-age=604800'
            },
            timeout: config.responseTimeout,
            signal: signal
        });

        const index = abortSignals.indexOf(controller);
        if (index !== -1) {
            abortSignals.splice(index, 1); // Remove the controller from the array
        }

        const responseBody = response.data;
        if (!responseBody || !responseBody.streams || responseBody.streams.length === 0) {
            throw new Error(`Could not load any additional streams: ${response.status}`)
        }

        config.debug && console.log('Received ' + responseBody.streams.length + ' streams from ' + name)

        responseBody.streams.forEach(torrent => {
            const newStream = {}
            const quality = helper.findQuality(torrent.title);
            newStream.fileIdx = torrent.fileIdx;
            newStream.name = torrent.name.replace(name, config.addonName);
            newStream.tag = quality;
            newStream.type = info.type;
            newStream.infoHash = torrent.infoHash.toLowerCase();
            newStream.sources = global.TRACKERS.map(x => { return "tracker:" + x; }).concat(["dht:" + torrent.infoHash]);

            helper.normalizeTitle(torrent, info);
            newStream.title = torrent.title;
            newStream.seeders = torrent.seeders;

            newStream.behaviorHints = {
                bingieGroup: "Jackett|" + newStream.infoHash,
            }

            streams.push(newStream);
            config.debug && console.log('Adding addition source stream: ', torrent)
        })
    } catch (error) {
        config.debug && console.error('Error finding addition source streams: ', error.message)
    }
}

// stream response
addon.get('/stream/:type/:id.json', async (req, res) => {

    if (!req.params.id)
        return respond(res, { streams: [] });

    config.debug && console.log("Received request for :", req.params.type, req.params.id);

    // cache
    if (config.cacheResultsTime && config.cacheResultsTime != 0) {
        const cached = getCacheVariable(req.params.id);
        if (cached) {
            console.log("C: Serving cached results for  " + req.params.type + " id: " + req.params.id);
            return respond(res, {
                streams: cached,
                "cacheMaxAge": 7200,
                "staleRevalidate": 14400,
                "staleError": 604800
            });
        }
    }

    let streamInfo = {};
    const streams = [];
    const abortSignals = [];

    const startTime = Date.now();

    function extractVideoInf(req, streamInfo) {
        if (req.params.id.startsWith("tmdb")) {
            const idParts = req.params.id.split(':');
            streamInfo.Id = idParts.slice(1).join(':');
            streamInfo.type = req.params.type;
            streamInfo.season = idParts[2] ? idParts[2] : null;
            streamInfo.episode = idParts[3] ? idParts[3] : null;
            streamInfo.db = "tmdb";
        } else {
            const idParts = req.params.id.split(':');
            streamInfo.Id = idParts[0];
            streamInfo.type = req.params.type;
            streamInfo.season = idParts[1] ? idParts[1] : null;
            streamInfo.episode = idParts[2] ? idParts[2] : null;
            streamInfo.db = "tt";
        }
    }

    extractVideoInf(req, streamInfo);


    try {
        await getStreamInfo(streamInfo, abortSignals);
    } catch (err) {
        console.error(err.message);
        return respond(res, { streams: [] });
    }

    if (config.additionalSources && streamInfo.db === 'tt') {
        config.additionalSources.forEach(source => {
            addResults(streamInfo, streams, source, abortSignals);
        });
    }

    console.log(`Q: id: ${streamInfo.Id} / title: ${streamInfo.name} / type: ${streamInfo.type} / year: ${streamInfo.year}` +
        (streamInfo.season && streamInfo.episode ? ` / season: ${streamInfo.season} / episode: ${streamInfo.episode}` : '') +
        '.');

    let inProgressCount = 0;
    let searchFinished = false;
    let requestSent = false;

    const intervalId = setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        if (!requestSent && ((elapsedTime >= config.responseTimeout) || (searchFinished && inProgressCount === 0 && asyncQueue.idle))) {
            requestSent = true;
            asyncQueue.kill();
            config.debug && console.log("There are " + abortSignals.length + " controllers to abort.");
            abortSignals.forEach((controller) => {
                controller.abort();
            });

            clearInterval(intervalId);
            const finalData = processTorrentList(streams);
            config.debug && console.log("Sliced & Sorted data ", finalData);
            console.log(`A: id: ${streamInfo.Id} / time: ${elapsedTime} / results: ${finalData.length} / timeout: ${(elapsedTime >= config.responseTimeout)} / search finished: ${searchFinished} / queue idle: ${asyncQueue.idle()} / pending downloads: ${inProgressCount} / discarded: ${(streams.length - finalData.length)}`);
            if (finalData.length > 0) {
                res.setHeader('Cache-Control', 'max-age=7200, stale-while-revalidate=14400, stale-if-error=604800, public');
                // Set cache-related headers if "streams" contains data
                if (config.cacheResultsTime && config.cacheResultsTime != 0) {
                    config.debug && console.log("Caching results for ", req.params.id);
                    setCacheVariable(req.params.id, finalData, config.cacheResultsTime)
                }
                return respond(res, {
                    streams: finalData,
                    "cacheMaxAge": 7200,
                    "staleRevalidate": 14400,
                    "staleError": 604800
                });
            } else {
                // If "streams" is empty, do not set cache-related headers
                return respond(res, {
                    streams: finalData
                });
            }
        }
        config.debug && console.log(`s: id: ${streamInfo.Id} / time pending: ${(config.responseTimeout - elapsedTime)} / search finished: ${searchFinished} / queue idle: ${asyncQueue.idle()} / pending downloads: ${inProgressCount} / processed streams: ${streams.length}`);

    }, config.interval);

    const processMagnets = async (task) => {
        if (requestSent) { // Check the flag before processing each task
            return;
        }
        const uri = task.magneturl || task.link;
        config.debug && console.log("Parsing magnet :", uri);
        const parsedTorrent = parseTorrent(uri);
        streamFromParsed(task, parsedTorrent, streamInfo, stream => {
            streams.push(stream);
        });
    };

    const processLinks = async (task) => {
        if (requestSent) {
            return;
        }
        inProgressCount++;
        try {
            const controller = new AbortController();
            const signal = controller.signal;
            abortSignals.push(controller)
            config.debug && console.log("Processing link: ", task.link);
            const response = await axios.get(task.link, {
                timeout: config.responseTimeout, // we don't want to overdo it here and neither set something in config. Request should timeout anyway.
                maxRedirects: 0, // Equivalent to 'redirect: 'manual'' in fetch
                validateStatus: null,
                signal: signal,
                responseType: 'arraybuffer', // Specify the response type as 'arraybuffer'
            });
            const index = abortSignals.indexOf(controller);
            if (index !== -1) {
                abortSignals.splice(index, 1); // Remove the controller from the array
            }
            // It takes some time to dowload the torrent file and we don't want to continue althought it will probably timeout.
            if (requestSent || response.status >= 400) {
                config.debug && console.log("Abort processing of : " + task.link + " - " + (requestSent ? "Request sent is " + requestSent : "Response code : " + response.statusCode));
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
                const responseBody = Buffer.from(response.data);
                config.debug && console.log(`Processing torrent : ${task.link}.`);
                const parsedTorrent = parseTorrent(responseBody);
                streamFromParsed(task, parsedTorrent, streamInfo, stream => {
                    streams.push(stream);
                });
                config.debug && console.log("Parsed torrent : ", task.link);
            }
        } catch (err) {
            config.debug && console.log("Error processing link :", task.link, err.message);
        }
        inProgressCount--;
    };

    const asyncQueue = async.queue(processLinks, config.downloadTorrentQueue);


    jackettApi.search(streamInfo, abortSignals,
        (tempResults) => {
            if (!requestSent && tempResults && tempResults.length > 0) {
                const { magnets, links } = partitionURL(tempResults);
                Promise.all([...magnets.map(processMagnets)]);
                links.forEach(item => asyncQueue.push(item));
            }
        },

        () => {
            config.debug && console.log("Searching finished.");
            searchFinished = true;
        }
    );
});

const runAddon = async () => {
    config.addonPort = await getPort({ port: config.addonPort });

    const updateTrackers = async () => {
        const { trackers, blacklist_trackers } = await getTrackers();
        global.TRACKERS = trackers;
        global.BLACKLIST_TRACKERS = blacklist_trackers;
        config.debug && console.log("Loaded all trackers !");
    };

    await updateTrackers();
    setInterval(updateTrackers, config.updateTrackersInterval * 60 * 1000);

    configureConnectionPooling();
    addon.listen(config.addonPort, () => {
        console.log("Version: " + version + ' Add-on Manifest URL: http://{{ IP ADDRESS }}:' + config.addonPort + '/manifest.json');
    });
};

runAddon();
