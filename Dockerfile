FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    nodejs npm ffmpeg curl \
    && pip install -U yt-dlp \
    && apt-get clean

WORKDIR /app
COPY package.json .
RUN npm install
COPY server.js .

EXPOSE 3000
CMD ["node", "server.js"]
