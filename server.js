const express = require('express');
const { execSync, exec } = require('child_process');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── HEALTH CHECK ─────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ status: 'DiamondSound Backend OK', version: '1.0' });
});

// ── SEARCH ───────────────────────────────────────────────────
// GET /search?q=lagu+kamu
app.get('/search', async (req, res) => {
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
app.get('/trending', async (req, res) => {
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

// ── STREAM URL ───────────────────────────────────────────────
// GET /stream?id=VIDEO_ID
app.get('/stream', async (req, res) => {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id required' });

    try {
        const cmd = `yt-dlp "https://www.youtube.com/watch?v=${id}" -f "bestaudio[ext=m4a]/bestaudio" --get-url --no-warnings 2>/dev/null`;
        const url = execSync(cmd, { timeout: 30000 }).toString().trim();

        if (!url) return res.status(404).json({ error: 'No stream found' });

        // Ambil info juga
        const infoCmd = `yt-dlp "https://www.youtube.com/watch?v=${id}" --dump-json --no-warnings 2>/dev/null`;
        const infoOut = execSync(infoCmd, { timeout: 30000 }).toString();
        const info = JSON.parse(infoOut);

        res.json({
            videoId: id,
            title: info.title,
            uploader: info.uploader || info.channel || '',
            thumbnailUrl: info.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            duration: info.duration || 0,
            audioUrl: url,
            mimeType: 'audio/mp4'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`DiamondSound backend running on port ${PORT}`);
});
