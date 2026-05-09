const express = require('express');
const { execSync } = require('child_process');
const http = require('http');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── HEALTH CHECK ─────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ status: 'DiamondSound Backend OK', version: '1.1' });
});

// ── SEARCH ───────────────────────────────────────────────────
// GET /search?q=lagu+kamu
app.get('/search', (req, res) => {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'query required' });

    try {
        const cmd = `yt-dlp "ytsearch15:${q}" --dump-json --flat-playlist --no-warnings 2>/dev/null`;
        const out = execSync(cmd, { timeout: 30000 }).toString();
        const lines = out.trim().split('\n').filter(Boolean);
        const results = lines.map(line => {
            try {
                const d = JSON.parse(line);
                return {
                    videoId: d.id,
                    title: d.title,
                    uploader: d.uploader || d.channel || '',
                    thumbnailUrl: d.thumbnail || `https://i.ytimg.com/vi/${d.id}/hqdefault.jpg`,
                    duration: d.duration || 0
                };
            } catch { return null; }
        }).filter(Boolean);

        res.json(results);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── TRENDING ─────────────────────────────────────────────────
// GET /trending?region=ID
app.get('/trending', (req, res) => {
    const region = req.query.region || 'ID';
    try {
        const cmd = `yt-dlp "https://www.youtube.com/feed/trending?bp=4gINGgt5dG1hX2NoYXJ0cw%3D%3D&gl=${region}" --dump-json --flat-playlist --no-warnings --playlist-end 20 2>/dev/null`;
        const out = execSync(cmd, { timeout: 40000 }).toString();
        const lines = out.trim().split('\n').filter(Boolean);
        const results = lines.map(line => {
            try {
                const d = JSON.parse(line);
                return {
                    videoId: d.id,
                    title: d.title,
                    uploader: d.uploader || d.channel || '',
                    thumbnailUrl: d.thumbnail || `https://i.ytimg.com/vi/${d.id}/hqdefault.jpg`,
                    duration: d.duration || 0
                };
            } catch { return null; }
        }).filter(Boolean);

        res.json(results);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── STREAM INFO (metadata + audio URL) ───────────────────────
// GET /streaminfo?id=VIDEO_ID
app.get('/streaminfo', (req, res) => {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id required' });

    try {
        const audioUrlCmd = `yt-dlp "https://www.youtube.com/watch?v=${id}" -f "bestaudio[ext=m4a]/bestaudio" --get-url --no-warnings 2>/dev/null`;
        const audioUrl = execSync(audioUrlCmd, { timeout: 30000 }).toString().trim();

        if (!audioUrl) return res.status(404).json({ error: 'No stream found' });

        const infoCmd = `yt-dlp "https://www.youtube.com/watch?v=${id}" --dump-json --no-warnings 2>/dev/null`;
        const info = JSON.parse(execSync(infoCmd, { timeout: 30000 }).toString());

        res.json({
            videoId: id,
            title: info.title || '',
            uploader: info.uploader || info.channel || '',
            thumbnailUrl: info.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            duration: info.duration || 0,
            audioUrl: audioUrl,
            mimeType: 'audio/mp4'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── STREAM PROXY ─────────────────────────────────────────────
// GET /stream?id=VIDEO_ID
// Proxy audio langsung dari server — bypass IP restriction
app.get('/stream', (req, res) => {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id required' });

    try {
        const cmd = `yt-dlp "https://www.youtube.com/watch?v=${id}" -f "bestaudio[ext=m4a]/bestaudio" --get-url --no-warnings 2>/dev/null`;
        const audioUrl = execSync(cmd, { timeout: 30000 }).toString().trim();
        if (!audioUrl) return res.status(404).json({ error: 'No stream found' });

        // Forward range header dari client
        const rangeHeader = req.headers['range'];
        const options = { headers: { 'User-Agent': 'Mozilla/5.0' } };
        if (rangeHeader) options.headers['Range'] = rangeHeader;

        const proto = audioUrl.startsWith('https') ? https : http;
        const proxyReq = proto.get(audioUrl, options, (proxyRes) => {
            const headers = {
                'Content-Type': proxyRes.headers['content-type'] || 'audio/mp4',
                'Accept-Ranges': 'bytes',
            };
            if (proxyRes.headers['content-length'])
                headers['Content-Length'] = proxyRes.headers['content-length'];
            if (proxyRes.headers['content-range'])
                headers['Content-Range'] = proxyRes.headers['content-range'];

            res.writeHead(proxyRes.statusCode, headers);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (e) => res.status(500).json({ error: e.message }));
        req.on('close', () => proxyReq.destroy());

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`DiamondSound backend running on port ${PORT}`);
});
