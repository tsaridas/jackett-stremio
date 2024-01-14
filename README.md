# Stremio Jackett Add-on

## General
This is a stremio addon which requires Jackett application to search for torrents. You add the addon to stremio by the URL it provides and it should send you results.
This addon by default will only work if also stremio web player uses http. If you want to use this on a HTTPS stremio player then you need to also have this service in HTTPS. 
Its out of the scope of this guide how to achieve that.

## Run
Images are push to dockerhub for each release automatically.

Images saved in [Docker Hub](https://hub.docker.com/r/tsaridas/jackett-stremio)

<pre>
$ docker run -d \
  --name=jacket-stremio \
  -e JACKETT_HOST=http://{{ YOURIP }}:9117/ \ # Replace `{{ YOUR IP }}` with your LAN IP.
  -p 7000:7000/tcp \
  --restart unless-stopped \
  tsaridas/jackett-stremio:latest
</pre>

One could also run it outside docker. You need nodejs installed.

```bash
$ export JACKETT_HOST={{ YOUR JACKET IP:PORT }} # Replace `{{ YOUR JACKET IP:PORT }}` with your ip and Jackett port.
$ npm install
$ node index.js
```

## Options

| Env | Default | Example | Description |
| - | - | - | - |
| `RESPONSE_TIMEOUT` | 12000 | `8000` | This will timeout any queries to jackett after this given value in millisecond |
| `PORT` | 7000 | `8888` | The port which the Addon service will run on. |
| `MIN_SEED` | 3 | `10` | The minimum amount of seeds we should return results for. |
| `MAX_RESULTS` | 10 | `20` | Maximum amount of results we want to receive. |
| `MAX_SIZE` | 10000000000 | `5000000000` | Maximum size of the results we want to receive. Value is in Bytes. Default is 10GB.  |
| `MAX_QUEUE_SIZE` | 100 | `200` | Maximum amount queries we want to have parallel. |
| `JACKETT_HOST` | http://127.0.0.1:9117/ | `http://10.10.10.1:9117/` | Your Jackett host. Make sure there is a / in the end and its a valid url. |
| `JACKETT_RTIMEOUT` | 10000 | `20000` | Jackett http read timeout in millisecond. |
| `JACKETT_OTIMEOUT` | 10000 | `20000` | Jackett http open timeout in millisecond. |

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

You can build your own image by running the below command. By default it will build from development branch of web player and latest version of the server. If you want to build from latest release of web please you can add --build-arg BRANCH=release or the branch that you want.

```bash
docker build -t jackett-stremio:myversion .
```

## Jackett
You need jacket installed for this addon to work. Going into detail on how to do that is out of the scope of this project.

### Install Jackett

- [Install Jackett on Windows](https://github.com/Jackett/Jackett#installation-on-windows)
- [Install Jackett on OSX](https://github.com/Jackett/Jackett#installation-on-macos)
- [Install Jackett on Linux](https://github.com/Jackett/Jackett#installation-on-linux)
- [Install Jackett using Docker](https://github.com/Jackett/Jackett?tab=readme-ov-file#installation-using-docker)

### Setup Jackett

Open your browser, go on [http://{{ YOUR IP }}:9117/](http://{{ YOUR IP }}:9117/). Replace `{{ YOUR IP }}` with your LAN IP. Press "+ Add Indexer", add as many indexers as you want.

Copy the text from the input where it writes "API Key" from top right of the menu in Jackett.

### Add Jackett Add-on to Stremio

Add `http://{{ YOUR IP }}:7000/{{my-jackett-key}}/manifest.json` (replace `{{my-jackett-key}}` with your Jackett API Key) as an Add-on URL in Stremio. Replace `{{ YOUR IP }}` with your LAN IP.

### ToDo

- Add caching headers
- Add fileIdx if possible for series
- Add better searching for series
- Increase versions of npm modules
- Add option for user to specify max limit in MB/GB etc.
- Add dockerhub images
- Update README for better understanding how to install.
- Validate jackett http address
