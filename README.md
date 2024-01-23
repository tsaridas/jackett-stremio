# Stremio Jackett Add-on

## General
This is a stremio addon which requires Jackett application to search for torrents which is meant to be installed/ran locally. You add the addon to stremio by the URL it provides and it should send you results.
This addon by default will only work if also stremio web player uses http. If you want to use this on a HTTPS stremio web player then you need to also have this service in HTTPS. 
It's out of the scope of this guide, to teach you how to achieve that. 

You can take a look at my other repo if you want to have stremio run in HTTP in docker [stremio-docker](https://github.com/tsaridas/stremio-docker) .

## Run
Images are pushed to [Docker Hub](https://hub.docker.com/r/tsaridas/jackett-stremio) for each release automatically.

<pre>
$ docker run -d \
  --name=jackett-stremio \
  -e JACKETT_HOST=http://{{ YOURIP }}:9117/ \ # Replace `{{ YOUR IP }}` with your LAN IP.
  -e JACKETT_APIKEY={{ THE API KEY }} # Replace {{ THE API KEY }} with the key you got from the jacket server.
  -p 7000:7000/tcp \
  --restart unless-stopped \
  tsaridas/jackett-stremio:latest
</pre>

One could also run it outside docker. You need nodejs installed.

```bash
$ export JACKETT_HOST={{ YOUR JACKETT IP:PORT }} # Replace `{{ YOUR JACKETT IP:PORT }}` with your ip and Jackett port.
$ export JACKETT_APIKEY={{ YOUR JACKETT API KEY }} # Replace `{{ YOUR JACKETT API KEY }}` with your Jackett API key.
$ npm install
$ npm start
```

## Options
The below options can be set as an evironment variable.

| Env | Default | Example | Description |
| - | - | - | - |
| `JACKETT_HOSTS` | http://127.0.0.1:9117/ | `http://10.10.10.1:9117/,http://10.10.10.2:9117/` | Your Jackett hosts comma delimited.|
| `JACKETT_APIKEYS` | '' | `sdfsadfsadfsadfsaf,sdfsadfsadfsadfsa` | API keys from jackett servers comma delimited. |
| `JACKETT_RTIMEOUT` | 8000 | `20000` | Jackett http read timeout in millisecond. Don't set these higher than the RESPONSE_TIMEOUT. |
| `JACKETT_OTIMEOUT` | 3000 | `20000` | Jackett http open timeout in millisecond. This is how long it takes to open a tcp connection to jackett. Increase if your jackett server is far away from the addon.|
| `PARSE_TORRENT_FILES` | false | `true` | Parsing torrent files ( not magnets) takes time and is slow. This is disabled by default. **If enabled you will see more results depending on your indexer**. |
| `DOWNLOAD_TORRENT_QUEUE` | 10 | `100` | Because external http downloads go through Jackett doing many downloads at the same time might cause some DDOS so I setup a queue for this. |
| `RESPONSE_TIMEOUT` | 8000 | `12000` | This will timeout any queries to jackett after this given value in millisecond. The higher the most result you will get from slow indexers. |
| `PORT` | 7000 | `8888` | The port which the Addon service will run on. |
| `MIN_SEED` | 5 | `10` | The minimum amount of seeds we should return results for. |
| `MAX_RESULTS` | 5 | `10` | Maxisum results to return. |
| `MAX_SIZE` | 5GB | `5GB` | Maximum size of the results we want to receive. Value is in Bytes. Default is 10GB. Supported formats: B/KB/MB/GB/TB . |
| `DEBUG` | false | `true` | Spam your terminal with info about requests being made. |
| `SEARCH_BY_TYPE` | false | `true` | We search by movie or tvshow instead of default free search. |
| `INTERVAL` | 500 | `100` | How often to check in miliseconds if we should return results based on user's timeout. |
| `ADD_BEST_TRACKERS` | false | `true` | We download a list of best trackers from [Best Trackers](https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt) and add them to all torrents found |
| `ADD_RUSSIAN_TRACKERS` | false | `true` | We add some Russian trackers. Check trackers.js for more info.|
| `ADD_EXTRA_TRACKERS` | false | `true` | We add some extra trackers. Check trackers.js for more info. |
| `REMOVE_BLACKLIST_TRACKERS` | false | `true` | Remove trackers that are blacklisted. Download list from : [Blacklisted trackers](https://raw.githubusercontent.com/ngosang/trackerslist/master/blacklist.txt") |



## Builds

Builds are setup to make images for the below archs :

* linux/arm/v6
* linux/amd64
* linux/arm64/v8
* linux/arm/v7

I can add more build archs if you require them and you can ask but I doubt anybody ever will need to install these containers in anything else.

## Images

* latest -> Builds automatically when new version of server or WebPlayer is released. Builds WebPlayer only from release tags.
* release version (example v1.0.0) -> to have old releases available in case there is something wrong with new release.

### Build your own

You can build your own image by running the below command.

```bash
docker build -t jackett-stremio:myversion .
```

## Jackett
You need jackett installed for this addon to work. Going into detail on how to do that is out of the scope of this project.

### Install Jackett

- [Install Jackett on Windows](https://github.com/Jackett/Jackett#installation-on-windows)
- [Install Jackett on OSX](https://github.com/Jackett/Jackett#installation-on-macos)
- [Install Jackett on Linux](https://github.com/Jackett/Jackett#installation-on-linux)
- [Install Jackett using Docker](https://github.com/Jackett/Jackett?tab=readme-ov-file#installation-using-docker)

### Setup Jackett

Open your browser, go on `http://{{ YOUR IP }}:9117/`. Replace `{{ YOUR IP }}` with your LAN IP. Press "+ Add Indexer", add as many indexers as you want.

Copy the text from the input where it writes "API Key" from top right of the menu in Jackett and setup the indexers you want.

Once that is done change the ENV variables JACKETT_HOST and JACKETT_APIKEY to match your host on the container that you used.

### Add Jackett Add-on to Stremio

Add `http://{{ YOUR IP }}:7000/manifest.json`. Replace `{{ YOUR IP }}` with your LAN IP.

### ToDo

- Add caching headers.
- Reorg code to avoid iterating through the same data multiple times.
- Add your own trackers config.
- Resolve trackers and add cache for trackers ip addresses instead of sending FQDNs.
- Increase versions of npm modules.
- Update README for better understanding how to install.
- HTTP connection pooling.
