const videoNameParser = require('video-name-parser');

const ticker = {};

const helper = {
    unique: (array) => {
        return Array.from(new Set(array));
    },

    toBytes: (humanSize) => {
        const sizeRegex = /^(\d+(\.\d+)?)\s*([kKmMgGtTpPeEzZyY]?[bB]?)$/;
        const match = humanSize.match(sizeRegex);
    
        if (!match) {
            throw new Error('Invalid human-readable size format');
        }
    
        const numericPart = parseFloat(match[1]);
        const unit = match[3].toUpperCase();
    
        const units = {
            'B': 1,
            'KB': 1024,
            'MB': 1024 * 1024,
            'GB': 1024 * 1024 * 1024,
            'TB': 1024 * 1024 * 1024 * 1024,
            'PB': 1024 * 1024 * 1024 * 1024 * 1024,
            'EB': 1024 * 1024 * 1024 * 1024 * 1024 * 1024,
            'ZB': 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024,
            'YB': 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024,
        };
    
        if (Object.prototype.hasOwnProperty.call(units, unit)) {
            throw new Error('Invalid unit in human-readable size');
        }
    
        return parseInt(numericPart * units[unit]);
    },

    toHomanReadable: (bytes) => {
        if (Math.abs(bytes) < 1024) { return bytes + ' B'; }

        const units = ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

        let i = -1;
        do {
            bytes /= 1024;
            ++i;
        } while (Math.abs(bytes) >= 1024 && i < units.length - 1);

        return bytes.toFixed(1) + " " + units[i];
    },

    isObject: (s) => {
        return (s !== null && typeof s === 'object');
    },

    setTicker: (ticks, cb) => {
        const tag = Date.now();
        ticker[tag] = ticks;

        return () => {
            ticker[tag]--;
            if (!ticker[tag]) {
                delete ticker[tag];
                cb();
            }
        };
    },

    episodeTag: (season, episode) => {
        return `S${('0' + season).slice(-2)}E${('0' + episode).slice(-2)}`;
    },

    simpleName: (name) => {

        name = name.replace(/\.|_|\-|\–|\(|\)|\[|\]|\:|\,/g, ' ');
        name = name.replace(/\s+/g, ' ');
        name = name.replace(/'/g, '');
        name = name.replace(/\\\\/g, '\\').replace(/\\\\\'|\\\'|\\\\\"|\\\"/g, '');
        
        return name;
    },

    extraTag: (name, searchQuery) => {
        const parsedName = videoNameParser(name + '.mp4');
        let extraTag = helper.simpleName(name);
        searchQuery = helper.simpleName(searchQuery);

        extraTag = extraTag.replace(new RegExp(searchQuery, 'gi'), '');
        extraTag = extraTag.replace(new RegExp(parsedName.name, 'gi'), '');

        if (parsedName.year) {
            extraTag = extraTag.replace(parsedName.year.toString(), '');
        }

        if (parsedName.season && parsedName.episode && parsedName.episode.length) {
            extraTag = extraTag.replace(new RegExp(helper.episodeTag(parsedName.season, parsedName.episode[0]), 'gi'), '');
        }

        extraTag = extraTag.trim();

        let extraParts = extraTag.split(' ');

        if (parsedName.season && parsedName.episode && parsedName.episode.length) {
            if (extraParts[0] && extraParts[0].length === 2 && !isNaN(extraParts[0])) {
                const possibleEpTag = `${helper.episodeTag(parsedName.season, parsedName.episode[0])}-${extraParts[0]}`;
                if (name.toLowerCase().includes(possibleEpTag.toLowerCase())) {
                    extraParts[0] = possibleEpTag;
                }
            }
        }

        const foundPart = name.toLowerCase().indexOf(extraParts[0].toLowerCase());

        if (foundPart > -1) {
            extraTag = name.substr(foundPart).replace(/_|\(|\)|\[|\]|\,/g, ' ');

            if ((extraTag.match(/\./g) || []).length > 1) {
                extraTag = extraTag.replace(/\./g, ' ');
            }

            extraTag = extraTag.replace(/\s+/g, ' ');
        }

        return extraTag;
    },
};

module.exports = helper;