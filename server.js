const express = require('express');
const { execSync } = require('child_process');
const http = require('http');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000;

// Auto update yt-dlp saat startup
try {
    execSync('pip install -U yt-dlp 2>/dev/null', { timeout: 60000 });
    console.log('yt-dlp updated');
} catch(e) {
    console.log('yt-dlp update skipped');
}

app.use(express.json());

// ── HEALTH CHECK ─────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ status: 'DiamondSound Backend OK', version: '1.2' });
});

// ── SEARCH ───────────────────────────────────────────────────
app.get('/search', (req, res) => {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'query required' });
    try {
        const cmd = `yt-dlp "ytsearch15:${q}" --dump-json --flat-playlist --no-warnings 2>/dev/null`;
        const out = execSync(cmd, { timeout: 30000 }).toString();
        const results = out.trim().split('\n').filter(Boolean).map(line => {
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

// ── PLAYLIST ─────────────────────────────────────────────────
// GET /playlist?q=query&limit=10
// Return satu playlist berdasarkan query — filter hanya lagu (bukan video pendek/non-musik)
app.get('/playlist', (req, res) => {
    const q = req.query.q || 'lagu populer indonesia';
    const limit = parseInt(req.query.limit) || 10;

    try {
        const cmd = `yt-dlp "ytsearch${limit * 2}:${q} official audio" --dump-json --flat-playlist --no-warnings 2>/dev/null`;
        const out = execSync(cmd, { timeout: 40000 }).toString();
        const all = out.trim().split('\n').filter(Boolean).map(line => {
            try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean);

        // Filter: hanya yang duration > 60 detik dan < 600 detik (1-10 menit = kemungkinan lagu)
        const songs = all.filter(d => {
            const dur = d.duration || 0;
            return dur > 60 && dur < 600;
        }).slice(0, limit).map(d => ({
            videoId: d.id,
            title: d.title,
            uploader: d.uploader || d.channel || '',
            thumbnailUrl: d.thumbnail || `https://i.ytimg.com/vi/${d.id}/hqdefault.jpg`,
            duration: d.duration || 0
        }));

        // Ambil thumbnail pertama sebagai cover playlist
        const cover = songs.length > 0 ? songs[0].thumbnailUrl : '';

        res.json({
            title: q,
            cover: cover,
            songs: songs
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── SECTIONS ─────────────────────────────────────────────────
// GET /sections?keywords=pop+indonesia,sad+viral,vibes+barat
// Return multiple playlist sections sekaligus
app.get('/sections', (req, res) => {
    const kwParam = req.query.keywords || '';
    const keywords = kwParam
        ? kwParam.split(',').map(k => k.trim()).filter(Boolean)
        : ['lagu sad viral tiktok', 'lagu vibes barat', 'lagu pop indonesia 2025', 'lagu galau trending'];

    const results = [];

    for (const kw of keywords) {
        try {
            const cmd = `yt-dlp "ytsearch12:${kw} official audio" --dump-json --flat-playlist --no-warnings 2>/dev/null`;
            const out = execSync(cmd, { timeout: 35000 }).toString();
            const all = out.trim().split('\n').filter(Boolean).map(line => {
                try { return JSON.parse(line); } catch { return null; }
            }).filter(Boolean);

            const songs = all.filter(d => {
                const dur = d.duration || 0;
                return dur > 60 && dur < 600;
            }).slice(0, 8).map(d => ({
                videoId: d.id,
                title: d.title,
                uploader: d.uploader || d.channel || '',
                thumbnailUrl: d.thumbnail || `https://i.ytimg.com/vi/${d.id}/hqdefault.jpg`,
                duration: d.duration || 0
            }));

            if (songs.length > 0) {
                results.push({
                    title: formatSectionTitle(kw),
                    query: kw,
                    cover: songs[0].thumbnailUrl,
                    songs: songs
                });
            }
        } catch (e) {
            console.error('Section error for', kw, ':', e.message);
        }
    }

    res.json(results);
});

// ── TRENDING ─────────────────────────────────────────────────
app.get('/trending', (req, res) => {
    try {
        const cmd = `yt-dlp "ytsearch20:lagu viral indonesia terbaru 2025 official" --dump-json --flat-playlist --no-warnings 2>/dev/null`;
        const out = execSync(cmd, { timeout: 40000 }).toString();
        const results = out.trim().split('\n').filter(Boolean).map(line => {
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

// ── STREAM INFO ───────────────────────────────────────────────
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
app.get('/stream', (req, res) => {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
        const cmd = `yt-dlp "https://www.youtube.com/watch?v=${id}" -f "bestaudio[ext=m4a]/bestaudio" --get-url --no-warnings 2>/dev/null`;
        const audioUrl = execSync(cmd, { timeout: 30000 }).toString().trim();
        if (!audioUrl) return res.status(404).json({ error: 'No stream found' });

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

// ── HELPER ───────────────────────────────────────────────────
function formatSectionTitle(query) {
    const map = {
        'lagu sad viral tiktok': 'Sad Vibes 🌧️',
        'lagu vibes barat': 'Western Vibes 🎵',
        'lagu pop indonesia 2025': 'Pop Indonesia 🇮🇩',
        'lagu galau trending': 'Galau Mode 💔',
        'lagu romantis indonesia': 'Romantis 🌹',
        'lagu nostalgia indonesia': 'Nostalgia 🎶',
        'lagu hits barat 2025': 'Hits Barat 🔥',
        'lagu indie indonesia': 'Indie Lokal 🎸',
    };
    return map[query] || query.replace(/lagu /i, '').replace(/\b\w/g, l => l.toUpperCase());
}

app.listen(PORT, () => {
    console.log(`DiamondSound backend running on port ${PORT}`);
});
