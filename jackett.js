const xmlJs = require('xml-js');
const needle = require('needle');
const helper = require('./helpers');
const config = require('./config');

const getIndexers = (host, apiKey) => {
	return new Promise((resolve) => {
		needle.get(host + 'api/v2.0/indexers/all/results/torznab/api?apikey=' + apiKey + '&t=indexers&configured=true', {
			open_timeout: config.jackett.openTimeout,
			read_timeout: config.jackett.readTimeout,
			parse_response: false
		}, (err, resp) => {
			if (err || !resp || !resp.body) {
				console.log("No indexers for ", host, err);
				return([]);
			}
			let indexers = null;

			try {
				indexers = xmlJs.xml2js(resp.body);
			} catch (err) {
<<<<<<< HEAD
				console.error("Could not parse indexers for ", host, err);
				return([]);
=======
				console.error("Could not parse indexers for ", host);
				resolve([]);
>>>>>>> 91a96065b2a6bbf9ea0ecb1ec589604c6a55e7dc
			}

			if (indexers && indexers.elements && indexers.elements[0] && indexers.elements[0].elements) {
				indexers = indexers.elements[0].elements;
				resolve(indexers);
			} else {
				console.error("Could not find indexers for ", host);
<<<<<<< HEAD
				return([]);
=======
				resolve([]);
>>>>>>> 91a96065b2a6bbf9ea0ecb1ec589604c6a55e7dc
			}
		});
	});
};

const search = async (query, cb, end) => {
	const hostsAndApiKeys = config.jackett.hosts.split(',').map((host, i) => ({ host, apiKey: config.jackett.apiKeys.split(',')[i] }));
	const tick = helper.setTicker(hostsAndApiKeys.length, () => {
		end([]);
	});
	config.debug && console.log("Found " + hostsAndApiKeys.length + " Jacket servers.");
	let searchQuery = "";
	let countResults = 0;
	let countFinished = 0;
	let totalIndexers = 0;
	let searchedIndexers = [];
	let sortedReults = [];

	const simpleName = encodeURIComponent(helper.simpleName(query.name));

	if (config.searchByType) {
		const searchType = query.type && query.type == 'movie' ? "movie" : "tvsearch";
		if (query.season && query.episode) {
			searchQuery = '&t=' + searchType + '&q=' + simpleName + '&season=' + query.season + '&ep=' + query.episode;
		} else {
			const year = (query.year) ? '&year=' + query.year : '';
			searchQuery = '&t=' + searchType + '&q=' + simpleName + year;
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


	await Promise.all(hostsAndApiKeys.map(async ({ host, apiKey }) => {
		const apiIndexersArray = await getIndexers(host, apiKey);
		totalIndexers += apiIndexersArray.length;
		try {
			config.debug && console.log("Found " + apiIndexersArray.length + " indexers for " + host);

			await Promise.all(apiIndexersArray.map(async (indexer) => {
				if (!(indexer && indexer.attributes && indexer.attributes.id)) {
					return;
				}

				if (searchedIndexers.includes(indexer.attributes.id)) {
					config.debug && console.log("Skipping indexer " + indexer.attributes.id + " as we have already searched it from " + host);
				} else {
					searchedIndexers.push(indexer.attributes.id);
				}

				const url = host + 'api/v2.0/indexers/' + indexer.attributes.id + '/results/torznab/api?apikey=' + apiKey + searchQuery;


				const response = await new Promise((resolve) => {
					needle.get(url, {
						open_timeout: config.jackett.openTimeout,
						read_timeout: config.jackett.readTimeout,
						parse_response: false
					}, (err, resp) => {
						resolve({ err, resp });
					});
				});
				config.debug && console.log(`Finished searching indexer ${indexer.attributes.id} with url ${url}`);

				if (response.err || !response.resp || !response.resp.body) {
					console.error(`Error ${response.err} when calling ${indexer.attributes.id}.`);
					return;
				}

				const tors = xmlJs.xml2js(response.resp.body);

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

							const toInt = ['seeders', 'peers', 'size', 'files'];

							toInt.forEach(toIntElm => {
								if (tempObj[toIntElm])
									newObj[toIntElm] = parseInt(tempObj[toIntElm]);
							});

							if (newObj.seeders < config.minimumSeeds || newObj.size > config.maximumSize) {
								return;
							}

							if (!config.parseTorrentFiles && (!newObj.magneturl || (newObj.link && !newObj.link.startsWith("magnet:")))) {
								return;
							}

							// We prefer magnet links as they don't require downloading (faster) but we should probaly have an option for this.
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
							
							if (helper.insertIntoSortedArray(sortedReults, newObj, 'seeders', 5)) {
								tempResults.push(newObj);
							}
						}
					});

					countResults += tempResults.length;
					countFinished++;

					config.debug && console.log(`Found ${countResults} results from ${indexer.attributes.id}. ${countFinished}/${totalIndexers} indexers on host ${host}`);
					if (tempResults.length > 0) {
						cb(tempResults);
					}
				}
			}));
		} catch (error) {
			tick();
			console.error(error);
		}
	}));

	tick();
};

module.exports = { search };