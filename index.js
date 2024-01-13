const parseTorrent = require('parse-torrent');
const needle = require('needle');
const async = require('async');
const getPort = require('get-port');

const express = require('express');
const addon = express();

const jackettApi = require('./jackett');
const helper = require('./helpers');

const config = require('./config');
console.log(config);

const version = require('./package.json').version;

const respond = (res, data) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');
  // Step 1: Remove duplicates based on infoHash
  const uniqueStreams = data.streams.reduce((unique, stream) => {
    const existingStream = unique.find((s) => s.infoHash === stream.infoHash);
    if (!existingStream) {
      unique.push(stream);
    }
    return unique;
  }, []);

  // Step 2: Sort the list based on seeders
  const sortedStreams = uniqueStreams.sort((a, b) => b.seeders - a.seeders);

  // sortedStreams.forEach(value => {
  //     console.log(value);
  // });
  const ret = { "streams": sortedStreams };
  console.log("Sending " + sortedStreams.length + " Streams.");
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
  res.send(manifest);
});

// utility function to create stream object from magnet or remote torrent
const streamFromMagnet = (tor, uri, params, cb) => {
  const toStream = (parsed) => {
    idx = 1; // this defines the number of the file that needs to be used for stream. settings this to 1 is wrong.
    // console.log(parsed)
    const infoHash = parsed.infoHash;

    let title = tor.title || parsed.name;
    const subtitle = `👤 ${tor.seeders}/${tor.peers}    💾 ${toHomanReadable(tor.size)}`;

    title += (title.indexOf('\n') > -1 ? '\r\n' : '\r\n\r\n') + subtitle;
    // console.log("We got results", tor, infoHash)
    const regex = /WEBRIP|HDTS|CAM|HD-TS|CINEMA|Xvid|DVDrip|DVDFull|TV|\d+p/i;
    const match = tor.extraTag.match(regex);
    let quality = "";
    if (match !== null) {
      quality = match[0];
    } else {
      quality = "UnKnown";
    }
    cb({
      name: "Jackett " + quality,
      // fileIdx: idx,
      type: params.type,
      infoHash: infoHash,
      seeders: tor.seeders,
      sources: (parsed.announce || []).map(x => { return "tracker:" + x; }).concat(["dht:" + infoHash]),
      availability: 1,
      title: title,
      behaviorHints: {
        bingieGroup: "Jackett|" + infoHash,
        notWebReady: false
      }
    });
  };
  if (uri.startsWith("magnet:?")) {
    const parsedTorrent = parseTorrent(uri);

    // console.log("The parsed Magnet is :", parsedTorrent, uri)
    toStream(parsedTorrent);
  } else {
    parseTorrent.remote(uri, (err, parsed) => {
      if (err) {
        cb(false);
        return;
      }
      // console.log("Parsed Remote result is ", parsed, uri)
      toStream(parsed);
    });
  }
};

// stream response
addon.get('/:jackettKey/stream/:type/:id.json', (req, res) => {

  if (!req.params.id || !req.params.jackettKey)
    return respond(res, { streams: [] });

  console.log("Received request for :", req.params.type, req.params.id);

  let results = [];

  let sentResponse = false;

  const respondStreams = () => {

    if (sentResponse) return;
    sentResponse = true;

    // filter seeds
    if (config.minimumSeeds)
      results = results.filter(el => { return !!(el.seeders && el.seeders > config.minimumSeeds - 1); });

    // filter size
    results = results.filter(el => { return !!(el.size && el.size < config.maximumSize - 1); });

    if (results && results.length) {

      let tempResults = results;

      // order by seeds desc
      // tempResults = tempResults.sort((a, b) => { return a.seeders < b.seeders ? 1 : -1 })

      // limit to 15 results
      if (config.maximumResults)
        tempResults = tempResults.slice(0, config.maximumResults);

      const streams = [];

      const q = async.queue((task, callback) => {
        if (task && (task.magneturl || task.link)) {
          const url = task.magneturl || task.link;
          // jackett links can sometimes redirect to magnet links or torrent files
          // we follow the redirect if needed and bring back the direct link
          helper.followRedirect(url, url => {
            // convert torrents and magnet links to stream object
            streamFromMagnet(task, url, req.params, stream => {
              if (stream) {
                streams.push(stream);
              }
              callback();
            });
          });
          return;
        }
        callback();
      }, 200);

      q.drain = () => {
        respond(res, { streams: streams });
      };

      tempResults.forEach(elm => { q.push(elm); });
    } else {
      respond(res, { streams: [] });
    }
  };

  const idParts = req.params.id.split(':');

  const imdbId = idParts[0];

  needle.get('https://v3-cinemeta.strem.io/meta/' + req.params.type + '/' + imdbId + '.json', (err, resp, body) => {

    if (body && body.meta && body.meta.name && body.meta.year) {

      const searchQuery = {
        name: body.meta.name,
        year: body.meta.year,
        type: req.params.type
      };

      if (idParts.length == 3) {
        searchQuery.season = idParts[1];
        searchQuery.episode = idParts[2];
      }

      jackettApi.search(req.params.jackettKey, searchQuery,

        partialResponse = (tempResults) => {
          results = results.concat(tempResults);
        },

        endResponse = (tempResults) => {
          results = tempResults;
          respondStreams();
        });


      if (config.responseTimeout)
        setTimeout(respondStreams, config.responseTimeout);

    } else {
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