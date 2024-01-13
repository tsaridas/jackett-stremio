const defaultConfig = {

	"responseTimeout": process.env.RESPONSETIMEOUT || 11000,

	"addonPort": process.env.PORT || 7000,

	"minimumSeeds": process.env.MIN_SEED || 3,

	"maximumResults": process.env.MAX_RESULTS || 10,

	"maximumSize": process.env.MAX_SIZE || 10000000000, // 10GB

	"jackett": {
		"host": process.env.JACKETT_HOST || "http://127.0.0.1:9117/",

		"readTimeout": process.env.JACKETT_RTIMEOUT || 10000,

		"openTimeout": process.env.JACKETT_OTIMEOUT || 10000

	}
}

module.exports = defaultConfig
