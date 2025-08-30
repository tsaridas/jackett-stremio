const xmlJs = require('xml-js');
const axios = require('axios');
const { AbortController } = require('abort-controller');
const helper = require('./helpers');
const config = require('./config');
const { setCacheVariable, getCacheVariable } = require('./cache');

const getIndexers = async (host, apiKey, abortSignals) => {
	try {
		const cachedData = getCacheVariable(host);
		if (cachedData) {
			config.debug && console.log("Loading indexers for \"" + host + "\" from cache.");
			return cachedData;
		}
		const controller = new AbortController();
		abortSignals.push(controller)
		const signal = controller.signal;

		const response = await axios.get(host + 'api/v2.0/indexers/' + config.jackett.indexerFilters + '/results/torznab/api?apikey=' + apiKey + '&t=indexers&configured=true', {
			timeout: config.jackett.readTimeout, // Equivalent to 'read_timeout' in needle
			responseType: 'text',
			signal: signal
		});

		const index = abortSignals.indexOf(controller);
		if (index !== -1) {
			abortSignals.splice(index, 1);
		}

		if (!response || !response.data) {
			console.error("No indexers for ", host);
			return [];
		}

		let indexers = null;

		try {
			indexers = xmlJs.xml2js(response.data);
		} catch (err) {
			console.error("Could not parse indexers for ", host, err);
			return [];
		}

		if (indexers && indexers.elements && indexers.elements[0] && indexers.elements[0].elements) {
			indexers = indexers.elements[0].elements;
			indexers.forEach((elem, index) => {
				if (elem.elements[5].elements[3].elements) {
					for (const cat of elem.elements[5].elements[3].elements) {
						if (indexers[index].movie && indexers[index].series) {
							break; // Exit the loop when both movie and series are found
						}
						if (!cat.attributes.id) {
							continue; // Skip this iteration if cat.attributes.id is falsy
						}
						if (cat.attributes.id === '2000') {
							config.debug && console.log("Found category Movies for: ", indexers[index].attributes.id);
							indexers[index].movie = true;
							continue;
						} else if (cat.attributes.id === '5000') {
							config.debug && console.log("Found category TV for: ", indexers[index].attributes.id);
							indexers[index].series = true;
							continue
						}
					}
				}
			});
			setCacheVariable(host, indexers, config.cacheIndexersTime);
			return indexers;
		} else {
			console.error("Could not find indexers for ", host);
			return [];
		}
	} catch (error) {
		console.error("Error fetching indexers: ", error.message);
		return [];
	}
};

const search = async (query, abortSignals, cb, end) => {
	const hostsAndApiKeys = config.jackett.hosts.split(',').map((host, i) => ({ host, apiKey: config.jackett.apiKeys.split(',')[i] }));
	config.debug && console.log("Found " + hostsAndApiKeys.length + " Jacket servers.");

	let searchQuery = "";
	let countResults = 0;
	let countFinished = 0;
	let searchedIndexers = {};
	let sortedReults = [];
	let ignoreTitles = null;

	const simpleName = encodeURIComponent(helper.simpleName(query.name));
	// This is not ideal and should probably be moved to a configuration file, but currently, I cannot think of any other items that are miscategorized.
	if (query.name.includes('UFC')) {
		let ufcMatch = query.name.match(/UFC\s*\d+/i);
		let ufcSearchName = simpleName; // Default to original simpleName
		if (ufcMatch && ufcMatch[0]) {
			ufcSearchName = encodeURIComponent(ufcMatch[0]);
		}
		searchQuery = '&t=search&cat=2000,5000&q=' + ufcSearchName;
	} else if (config.searchByType) {
		const searchType = query.type && query.type == 'movie' ? "movie" : "tvsearch";
		if (query.season && query.episode) {
			searchQuery = '&t=' + searchType + '&q=' + simpleName + '&season=' + query.season + '&ep=' + query.episode;
		} else {
			searchQuery = '&t=' + searchType + '&q=' + simpleName + '&year=' + query.year;
		}
	} else {
		const cat = query.type && query.type == 'movie' ? 2000 : 5000;
		searchQuery = '&t=search&cat=' + cat + '&q=' + simpleName;
		if (query.season && query.episode) {
			// Maybe we should remove the episode from here and only have season since we might get multiepisode torrents.
			// Issue is that when they return a magnet we don't know which file to choose.
			searchQuery += '%20' + helper.episodeTag(query.season, query.episode);
		} else {
			searchQuery += '%20' + query.year;
		}
	}

	if (config.ignoreTitles) {
		ignoreTitles = new RegExp(config.ignoreTitles, 'i');
	}

	await Promise.all(hostsAndApiKeys.map(async ({ host, apiKey }) => {
		const apiIndexersArray = await getIndexers(host, apiKey, abortSignals);

		try {
			config.debug && console.log("Found " + apiIndexersArray.length + " indexers for " + host);
			if (apiIndexersArray.length == 0) {
				return;
			}

			await Promise.all(apiIndexersArray.map(async (indexer) => {
				if (!(indexer && indexer.attributes && indexer.attributes.id)) {
					return;
				}

				if (!indexer[query.type]) {
					config.debug && console.log("Skipping " + indexer.attributes.id + " because it has no category " + query.type);
					return;
				}

				if (searchedIndexers[indexer.attributes.id]) {
					config.debug && console.log("Skipping indexer " + indexer.attributes.id + " as we have already searched it from " + host);
					return;
				} else {
					searchedIndexers[indexer.attributes.id] = { "host": host, "status": "started" };
				}

				const controller = new AbortController();
				abortSignals.push(controller)
				const signal = controller.signal;

				const url = host + 'api/v2.0/indexers/' + indexer.attributes.id + '/results/torznab/api?apikey=' + apiKey + searchQuery;
				const response = await axios.get(url, {
					timeout: config.jackett.readTimeout,
					responseType: 'text',
					signal: signal
				});

				const index = abortSignals.indexOf(controller);
				if (index !== -1) {
					abortSignals.splice(index, 1); // Remove the controller from the array
				}

				config.debug && console.log(`Finished searching indexer ${indexer.attributes.id} with url ${url}`);

				if (!response.data) {
					console.error(`Error ${response.err} when calling ${indexer.attributes.id}.`);
					searchedIndexers[indexer.attributes.id].status = response.err;
					return;
				}

				const tors = xmlJs.xml2js(response.data);

				if (tors.elements && tors.elements[0] && tors.elements[0].elements && tors.elements[0].elements[0] && tors.elements[0].elements[0].elements) {
					const elements = tors.elements[0].elements[0].elements;
					const tempResults = [];

					elements.forEach(elem => {
						if (elem.type == 'element' && elem.name == 'item' && elem.elements) {
							const newObj = {};
							const tempObj = {};

							elem.elements.forEach(subElm => {
								if (subElm.name == 'torznab:attr' && subElm.attributes && subElm.attributes.name && subElm.attributes.value)
									tempObj[subElm.attributes.name] = subElm.attributes.value;
								else if (subElm.elements && subElm.elements.length)
									tempObj[subElm.name] = subElm.elements[0].text;
							});

							const ofInterest = ['title', 'link', 'magneturl'];

							ofInterest.forEach(ofInterestElm => {
								if (tempObj[ofInterestElm])
									newObj[ofInterestElm] = tempObj[ofInterestElm];
							});

							if (ignoreTitles && ignoreTitles.test(newObj.title)) {
								return;
							}

							const toInt = ['seeders', 'peers', 'size', 'files'];

							toInt.forEach(toIntElm => {
								if (tempObj[toIntElm])
									newObj[toIntElm] = parseInt(tempObj[toIntElm]);
							});

							if (newObj.seeders < config.minimumSeeds || newObj.size > config.maximumSize) {
								return;
							}

							if (config.dontParseTorrentFiles && (!newObj.magneturl || (newObj.link && !newObj.link.startsWith("magnet:")))) {
								return;
							}

							// We prefer magnet links as they don't require downloading (faster) but we should probaly have an option for this.
							// Problem with magnet links is that they don't have a file list. On the other hand, torrents need to be downloaded as a file which requires extra processing.
							if (newObj.magneturl && newObj.magneturl.startsWith("magnet:") && (newObj.link && newObj.link.startsWith("http://"))) {
								config.debug && console.log("Found magneturl " + newObj.magneturl + " and link " + newObj.link);
								newObj.link = newObj.magneturl;
							}

							// Not sure if this is required and if I ever saw it happen.
							if (newObj.link && newObj.link.startsWith("magnet:") && !newObj.magneturl) {
								config.debug && console.log("Found missing magneturl: " + newObj.link);
								newObj.magneturl = newObj.link;
							}

							if (tempObj.pubDate)
								newObj.jackettDate = new Date(tempObj.pubDate).getTime();

							newObj.from = indexer.attributes.id;

							newObj.extraTag = helper.extraTag(newObj.title, query.name);

							if (helper.insertIntoSortedArray(sortedReults, newObj, 'seeders', config.maximumResults)) {
								config.debug && console.log(newObj);
								tempResults.push(newObj);
							}
						}
					});

					searchedIndexers[indexer.attributes.id].status = "finished"
					countResults += tempResults.length;
					countFinished++;

					config.debug && console.log(`Found ${tempResults.length} results from ${indexer.attributes.id} on host ${host} and ${countResults} overall. ${countFinished}/${Object.keys(searchedIndexers).length} indexers finished.`);

					config.debug && console.log(searchedIndexers);
					if (tempResults.length > 0) {
						cb(tempResults);
					}
				} else {
					searchedIndexers[indexer.attributes.id].status = "finished"
					config.debug && console.log("Could not find any torrents for ", host, url);
				}
			}));
		} catch (error) {
			console.error("Could not process host :", host, error.message);
		}
	}));
	end([]);
};

module.exports = { search };