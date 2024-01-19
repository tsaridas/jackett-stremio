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
ENV JACKETT_HOST=
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


ENV NODE_ENV=production

ARG VERSION=testing
LABEL org.opencontainers.image.source=https://github.com/tsaridas/jackett-stremio
LABEL org.opencontainers.image.description="Jackett Local Addon for Stremio"
LABEL org.opencontainers.image.licenses=MIT
LABEL version=${VERSION}



COPY . .
RUN apk update && apk upgrade && rm -rf /var/cache/apk/*
<<<<<<< HEAD
RUN npm install --no-fund --omit=optional --production
=======
RUN npm install --no-fund --no-audit --no-optional --production
>>>>>>> 07a27efec2fc3ee3543c9a15ffc176ae0727f419

CMD ["node", "index.js"]
