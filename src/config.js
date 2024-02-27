const { URL } = require('url');

const defaultConfig = {

  "addonName": process.env.ADDON_NAME || "Jackett",

  "dontParseTorrentFiles": process.env.DONT_PARSE_TORRENT_FILES || false,

  "interval": parseInt(process.env.INTERVAL) || 500,

  "addBestTrackers": process.env.ADD_BEST_TRACKERS || false,

  "addRussianTrackers": process.env.ADD_RUSSIAN_TRACKERS || false,

  "addExtraTrackers": process.env.ADD_EXTRA_TRACKERS || false,

  "removeBlacklistTrackers": process.env.REMOVE_BLACKLIST_TRACKERS || false,

  "debug": process.env.DEBUG || false,

  "searchByType": process.env.SEARCH_BY_TYPE || false,

  "responseTimeout": parseInt(process.env.RESPONSE_TIMEOUT) || 8000,

  "addonPort": parseInt(process.env.PORT) || 7000,

  "minimumSeeds": parseInt(process.env.MIN_SEED) || 5,

  "maximumResults": parseInt(process.env.MAX_RESULTS) || 5,

  "maximumSize": process.env.MAX_SIZE || "5GB",

  "downloadTorrentQueue": parseInt(process.env.DOWNLOAD_TORRENT_QUEUE) || 10,

  "cacheIndexersTime": parseInt(process.env.CACHE_INDEXERS_TIME) || 30,

  "cacheResultsTime": parseInt(process.env.CACHE_RESULTS_TIME) || 180,

  "tmdbAPIKey": process.env.TMDB_APIKEY || "",

  "updateTrackersInterval": parseInt(process.env.UPDATE_TRACKERS_INTERVAL) || 1440,

  "jackett": {

    "hosts": process.env.JACKETT_HOSTS || process.env.JACKETT_HOST || "http://127.0.0.1:9117/", // JACKETT_HOST is for backwards compatibility

    "apiKeys": process.env.JACKETT_APIKEYS || process.env.JACKETT_APIKEY || "",  // JACKETT_APIKEY is for backwards compatibility

    "readTimeout": parseInt(process.env.JACKETT_RTIMEOUT) || 8000,

    "indexerFilters": process.env.INDEXER_FILTERS || "status:healthy,test:passed" // instead of `all`.
  },

  "additionalSources": process.env.ADDITIONAL_SOURCES || ""

}

function isIPv4(value) {
  // Regular expression to validate IPv4 addresses
  const ipv4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  return ipv4Regex.test(value);
}

function isFQDN(value) {
  // Regular expression to validate FQDNs
  const fqdnRegex = /^([a-zA-Z0-9.-]+\.)+[a-zA-Z]{2,}$/;
  return fqdnRegex.test(value);
}

function correctAndValidateURL(input) {
  const urls = input.split(',');
  const finalUrls = [];
  urls.forEach((element) => {
    try {
      const parsedURL = new URL(element);

      if (parsedURL.protocol === 'http:' && (isIPv4(parsedURL.hostname) || isFQDN(parsedURL.hostname))) {
        finalUrls.push(parsedURL.href); // Return the original URL if it's valid
        return;
      }

      parsedURL.protocol = 'http:';

      if (!parsedURL.pathname) {
        parsedURL.pathname = '/';
      }

      const correctedURL = parsedURL.href;

      finalUrls.push(correctedURL);
    } catch (error) {
      console.error(`URL ${element} doesn't seem like a valid URL. Using it anyway.`)
      finalUrls.push(element);
      return;
    }
  });
  return finalUrls.join(',')
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

function loadSource() {
  if (!defaultConfig.additionalSources) {
    return;
  }
  const parts = defaultConfig.additionalSources.split(',');
  const sourceList = [];
  for (const part of parts) {
    const decodedValue = Buffer.from(part, 'base64').toString('utf-8');
    sourceList.push(decodedValue);
  }
  defaultConfig.additionalSources = sourceList;
}

defaultConfig.jackett.indexerFilters = encodeURIComponent(defaultConfig.jackett.indexerFilters);
defaultConfig.maximumSize = toBytes(defaultConfig.maximumSize);
defaultConfig.jackett.hosts = correctAndValidateURL(defaultConfig.jackett.hosts);
console.log(defaultConfig)
loadSource();
module.exports = defaultConfig;
