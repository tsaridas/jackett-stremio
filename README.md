# Stremio Jackett Add-on

## Install and Usage
Build docker container and run or

```bash
npm install
node index.js
```

### Install Jackett

- [Install Jackett on Windows](https://github.com/Jackett/Jackett#installation-on-windows)
- [Install Jackett on OSX](https://github.com/Jackett/Jackett#installation-on-macos)
- [Install Jackett on Linux](https://github.com/Jackett/Jackett#installation-on-linux)


### Setup Jackett

Open your browser, go on [http://{{ YOUR IP }}:9117/](http://{{ YOUR IP }}:9117/). Replace `{{ YOUR IP }}` with your LAN IP. Press "+ Add Indexer", add as many indexers as you want.

Copy the text from the input where it writes "API Key" from top right of the menu in Jackett.


### Run Jackett Add-on

```bash
$ docker build -t jacket-stremio .
```

<pre>
$ docker run -d \
  --name=jacket-stremio \
  -e JACKETT_HOST=http://{{ YOURIP }}:9117/ \ # Replace `{{ YOUR IP }}` with your LAN IP.
  -p 7000:7000/tcp \
  --restart unless-stopped \
  jacket-stremio:latest
</pre>


### Add Jackett Add-on to Stremio

Add `http://{{ YOUR IP }}:7000/{{my-jackett-key}}/manifest.json` (replace `{{my-jackett-key}}` with your Jackett API Key) as an Add-on URL in Stremio. Replace `{{ YOUR IP }}` with your LAN IP.

![addlink](https://user-images.githubusercontent.com/1777923/43146711-65a33ccc-8f6a-11e8-978e-4c69640e63e3.png)
