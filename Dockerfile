# Kör appen på en hostingtjänst (Render, Railway, Fly m.fl.)
FROM node:22-slim

# Python + Piper för den svenska/engelska/tyska rösten
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/* \
  && pip3 install --no-cache-dir --break-system-packages piper-tts

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Ladda ner röstmodellerna vid bygget så att de finns på servern
RUN python3 -m piper.download_voices sv_SE-nst-medium en_US-lessac-medium de_DE-thorsten-medium --data-dir voices

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
