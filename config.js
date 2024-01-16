const { URL } = require('url');

const defaultConfig = {

  "interval": process.env.INTERVAL || 100,

  "addBestTrackers": process.env.ADD_BEST_TRACKERS || true,

  "addRussianTrackers": process.env.ADD_RUSSIAN_TRACKERS || true,

  "addExtraTrackers": process.env.ADD_EXTRA_TRACKERS || true,

  "debug": process.env.DEBUG || false,

  "searchByType": process.env.SEARCH_BY_TYPE || false,

  "responseTimeout": process.env.RESPONSE_TIMEOUT || 8000,

  "addonPort": process.env.PORT || 7000,

  "minimumSeeds": process.env.MIN_SEED || 3,

  "maximumResults": process.env.MAX_RESULTS || 10,

  "maximumSize": process.env.MAX_SIZE || 5000000000, // 5GB

  "downloadTorrentQueue": process.env.DOWNLOAD_TORRENT_QUEUE || 5,

  "jackett": {

    "host": process.env.JACKETT_HOST || "http://127.0.0.1:9117/",

    "readTimeout": process.env.JACKETT_RTIMEOUT || 10000,

    "openTimeout": process.env.JACKETT_OTIMEOUT || 5000

  }
}

function correctAndValidateURL(input) {
  try {
    const parsedURL = new URL(input);

    if (parsedURL.protocol === 'http:' && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(parsedURL.hostname)) {
      return parsedURL.href; // Return the original URL if it's valid
    }

    parsedURL.protocol = 'http:';

    if (!parsedURL.pathname) {
      parsedURL.pathname = '/';
    }

    const correctedURL = parsedURL.href;

    return correctedURL;
  } catch (error) {
    console.error(`URL ${input} doesn't seem like a valid URL. Using it anyway.`)
    return input;
  }
}

defaultConfig.jackett.host = correctAndValidateURL(defaultConfig.jackett.host);

module.exports = defaultConfig;