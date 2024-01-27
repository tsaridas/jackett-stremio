const videoNameParser = require('video-name-parser');

const helper = {
    unique: (array) => {
        return Array.from(new Set(array));
    },

    // Function to insert an object into a sorted list based on a property (descending order) with maxSize. 
    // sortingProperty must be an int to compare.
    // Object must have the properties.
    insertIntoSortedArray: (sortedArray, newObject, sortingProperty, maxSize) => {
        const indexToInsert = sortedArray.findIndex(item => item[sortingProperty] < newObject[sortingProperty]);

        if (indexToInsert === -1) {
            if (sortedArray.length < maxSize) {
                sortedArray.push(newObject);
                return true;
            }
            return false;
        } else {
            // Insert the new object at the correct position to maintain the sorted order (descending)
            sortedArray.splice(indexToInsert, 0, newObject);
            // Trim the array if it exceeds maxSize
            if (sortedArray.length > maxSize) {
                sortedArray.pop();
            }
            return true;
        }
    },

    toHomanReadable: (bytes) => {
        if (Math.abs(bytes) < 1024) { return bytes + ' B'; }

        const units = ['kb', 'mb', 'gb', 'tb'];

        let i = -1;
        do {
            bytes /= 1024;
            ++i;
        } while (Math.abs(bytes) >= 1024 && i < units.length - 1);

        return bytes.toFixed(1) + " " + units[i];
    },

    episodeTag: (season, episode) => {
        return `S${('0' + season).slice(-2)}E${('0' + episode).slice(-2)}`;
    },

    simpleName: (name) => {
        name = name.replace(/\.|_|-|–|\(|\)|\[|\]|:|,/g, ' ');
        name = name.replace(/\s+/g, ' ');
        name = name.replace(/'/g, '');
        name = name.replace(/\\\\/g, '\\').replace(/\\\\'|\\'|\\\\"|\\"/g, '');
        return name;
    },

    findQuality: (tag) => {
        const regex = /DLRip|HDTV|\b(DivX|XviD)\b|\b(?:DL|WEB|BD|BR)MUX\b|\bWEB-?Rip\b|\bWEB-?DL\b|\bBluray\b|\bVHSSCR\b|\bR5\b|\bPPVRip\b|\bTC\b|\b(?:HD-?)?TVRip\b|\bDVDscr\b|\bDVD(?:R[0-9])?\b|\bDVDRip\b|\bBDRip\b|\bBRRip\b|\bHD-?Rip\b|\b(?:HD-?)?T(?:ELE)?S(?:YNC)?\b|\b(?:HD-?)?CAM\b|(4k)|([0-9]{3,4}[pi])/i;
        const match = tag.match(regex);
        let quality = "";
        if (match !== null) {
            quality = match[0];
        }
        return quality
    },

    normalizeTitle: (title) => {
        let name = '👤 11/2 💾 2 gb ⚙️ therarbg';
        const title_list = title.split("\n");
        title_list.forEach(element => {
            if (element.includes("👤")) {
                name = element;
                if (!name.includes("⚙️")) {
                    name += " ⚙️ therarbg";
                }
                const match = name.match(/👤 (\d+)/);
                if (match) {
                    const digit = match[1];
                    if (!name.match(/👤 \d+\/\d+/)) {
                        name = name.replace(/👤 (\d+)/, `👤 ${Math.round(digit / 1.2)}/${Math.round(digit * 0.6)}`).toLowerCase();
                    }
                }
                return name
            }
        });
        return name
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
            extraTag = name.substr(foundPart).replace(/_|\(|\)|\[|\]|,/g, ' ');

            if ((extraTag.match(/\./g) || []).length > 1) {
                extraTag = extraTag.replace(/\./g, ' ');
            }

            extraTag = extraTag.replace(/\s+/g, ' ');
        }

        return extraTag;
    },
};

module.exports = helper;
