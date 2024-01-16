const { URL } = require('url');

const defaultConfig = {

  "interval": parseInt(process.env.INTERVAL) || 500,

  "addBestTrackers": process.env.ADD_BEST_TRACKERS || true,

  "addRussianTrackers": process.env.ADD_RUSSIAN_TRACKERS || false,

  "addExtraTrackers": process.env.ADD_EXTRA_TRACKERS || true,

  "debug": process.env.DEBUG || false,

  "searchByType": process.env.SEARCH_BY_TYPE || false,

  "responseTimeout": parseInt(process.env.RESPONSE_TIMEOUT) || 8000,

  "addonPort": parseInt(process.env.PORT) || 7000,

  "minimumSeeds": parseInt(process.env.MIN_SEED) || 3,

  "maximumResults": parseInt(process.env.MAX_RESULTS) || 10,

  "maximumSize": process.env.MAX_SIZE || "10GB",

  "downloadTorrentQueue": parseInt(process.env.DOWNLOAD_TORRENT_QUEUE) || 5,

  "jackett": {

    "host": process.env.JACKETT_HOST || "http://127.0.0.1:9117/",

    "readTimeout": parseInt(process.env.JACKETT_RTIMEOUT) || 10000,

    "openTimeout": parseInt(process.env.JACKETT_OTIMEOUT) || 5000

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


function toBytes(humanSize) {
  const sizeString = (typeof humanSize === 'string') ? humanSize : humanSize.toString();
  const sizeRegex = /^(\d+(\.\d+)?)\s*([kKmMgGtT]?[bB]?)$/;
  const match = sizeString.match(sizeRegex);

  if (!match) {
    console.error('Invalid maximumSize format set. Supported formats: B/KB/MB/GB/TB. Example : 5GB');
    return 10000000000;
  }

  const numericPart = parseFloat(match[1]);
  const unit = match[3].toUpperCase();

  const units = {
    'B': 1,
    'KB': 1024,
    'MB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024,
    'TB': 1024 * 1024 * 1024 * 1024,
  };

  if (Object.prototype.hasOwnProperty.call(unit, units)) {
    console.error('Invalid maximumSize format set. Supported formats: B/KB/MB/GB/TB. Example : 5GB');
    return 10000000000;
  }

  return parseInt(numericPart * units[unit]);
}


defaultConfig.maximumSize = toBytes(defaultConfig.maximumSize);
defaultConfig.jackett.host = correctAndValidateURL(defaultConfig.jackett.host);

module.exports = defaultConfig;