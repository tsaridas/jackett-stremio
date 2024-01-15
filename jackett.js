const xmlJs = require('xml-js');
const needle = require('needle');
const helper = require('./helpers');
const config = require('./config');

const getIndexers = (apiKey, cb) => {
	needle.get(config.jackett.host + 'api/v2.0/indexers/all/results/torznab/api?apikey=' + apiKey + '&t=indexers&configured=true', {
		open_timeout: config.jackett.openTimeout,
		read_timeout: config.jackett.readTimeout,
		parse_response: false
	}, (err, resp) => {
		if (err || !resp || !resp.body) {
			cb(err || new Error('No Indexers'));
			return;
		}

		let indexers = xmlJs.xml2js(resp.body);

		if (indexers && indexers.elements && indexers.elements[0] && indexers.elements[0].elements) {
			indexers = indexers.elements[0].elements;
			cb(null, indexers);
		} else {
			cb(new Error('No Indexers'));
		}
	});
};

const search = (apiKey, query, cb, end) => {
	getIndexers(apiKey, async (err, apiIndexers) => {
		if (err || !apiIndexers || apiIndexers.length === 0) {
			cb([]);
			end([]);
			console.error("Could not find any available indexers in Jackett. Is Jacket service down ?");
			return;
		}
		config.debug && console.log("Found " + apiIndexers.length + " indexers");
		let searchQuery = "";
		let countResults = 0;
		let countFinished = 0;
		let maxSeeder = { number: 0, indexer: "" };

		const simpleName = helper.simpleName(query.name);
		if (config.searchByType) {
			const searchType = query.type && query.type == 'movie' ? "movie" : "tvsearch";
			if (query.season && query.episode) {
				searchQuery = '&t=' + searchType + '&q=' + simpleName + '&season=' + query.season + '&ep=' + query.episode;
			} else {
				year = (query.year) ? '&year=' + query.year : '';
				searchQuery = '&t=' + searchType + '&q=' + simpleName + year;
			}
		} else {
			const cat = query.type && query.type == 'movie' ? 2000 : 5000;
			searchQuery = '&t=search&cat=' + cat + '&q=' + simpleName;
			if (query.season && query.episode) {
				searchQuery += ' ' + helper.episodeTag(query.season, query.episode);
			} else {
				searchQuery += ' ' + query.year;
			}
		}

		const tick = helper.setTicker(apiIndexers.length, () => {
			end([]);
		});

		try {
			await Promise.all(apiIndexers.map(async (indexer) => {
				if (!(indexer && indexer.attributes && indexer.attributes.id)) {
					tick();
					return;
				}

				const url = config.jackett.host + 'api/v2.0/indexers/' + indexer.attributes.id + '/results/torznab/api?apikey=' + apiKey + encodeURI(searchQuery);
				config.debug && console.log(`Searching indexer ${indexer.attributes.id} with url ${url}`);

				const response = await new Promise((resolve) => {
					needle.get(url, {
						open_timeout: config.jackett.openTimeout,
						read_timeout: config.jackett.readTimeout,
						parse_response: false
					}, (err, resp) => {
						resolve({ err, resp });
					});
				});

				if (response.err || !response.resp || !response.resp.body) {
					console.error(`Error ${response.err} when calling ${indexer.attributes.id}.`);
					tick();
					return;
				}

				//config.debug && console.log(`Response from ${indexer.attributes.id} is ${response.resp.body}.`);
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

							if (!newObj.magneturl || (newObj.link && !newObj.link.startsWith("magnet:"))) {
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

							if (tempObj.pubDate)
								newObj.jackettDate = new Date(tempObj.pubDate).getTime();

							newObj.from = indexer.attributes.id;

							newObj.extraTag = helper.extraTag(newObj.title, query.name);
							if (newObj.seeders > maxSeeder.number) {
								maxSeeder.number = newObj.seeders;
								maxSeeder.indexer = indexer.attributes.id;
								maxSeeder.obj = newObj;
							}
							tempResults.push(newObj);
						}
					});
					countResults += tempResults.length;
					countFinished++;
					config.debug && console.log("Found " + countResults + " so far from overall " + apiIndexers.length + " indexers " + countFinished + " finished. MaxSeeder: " + maxSeeder.number + " from " + maxSeeder.indexer + " Object " + JSON.stringify(maxSeeder.obj, null, 2));
					cb(tempResults);
				}
				tick();
			}));
		} catch (error) {
			console.error('Error calling Jackett:', error);
			tick();
		}
	});
};

module.exports = { search };