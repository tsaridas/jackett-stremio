FROM node:18-alpine3.19

WORKDIR /srv 
EXPOSE 7000

# Config vars 
ENV INTERVAL=
ENV RESPONSE_TIMEOUT=
ENV PORT=
ENV MIN_SEED=
ENV MAX_RESULTS=
ENV MAX_SIZE=
ENV JACKETT_HOSTS=
ENV JACKETT_APIKEYS=
ENV JACKETT_RTIMEOUT=
ENV JACKETT_OTIMEOUT=
ENV SEARCH_BY_TYPE=
ENV DEBUG=
ENV DOWNLOAD_TORRENT_QUEUE=
ENV ADD_BEST_TRACKERS=
ENV ADD_RUSSIAN_TRACKERS=
ENV ADD_EXTRA_TRACKERS=
ENV PARSE_TORRENT_FILES=
ENV REMOVE_BLACKLIST_TRACKERS=
ENV INDEXER_FILTERS=
ENV ADDON_NAME=
ENV CACHE_INDEXERS_TIME=
ENV CACHE_RESULTS_TIME=
ENV TMDB_APIKEY=
ENV UPDATE_TRACKERS_INTERVAL=
# 
ENV NODE_ENV=production

ARG VERSION=testing
LABEL org.opencontainers.image.source=https://github.com/tsaridas/jackett-stremio
LABEL org.opencontainers.image.description="Jackett Local Addon for Stremio"
LABEL org.opencontainers.image.licenses=MIT
LABEL version=${VERSION}


COPY . .
RUN chmod +x start.sh
RUN apk update && apk upgrade && rm -rf /var/cache/apk/*
RUN npm install --no-fund --omit=dev


ENTRYPOINT ["./start.sh"]
