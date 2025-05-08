require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const ytdl = require('ytdl-core');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static('public'));

const {
    SAPLING_API_KEY,
    LASTFM_API_KEY,
    SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET,
    YOUTUBE_API_KEY
} = process.env;

let spotifyAccessToken = '';

// Spotify token management (unchanged)
async function getSpotifyToken() {
    try {
        const response = await axios.post(
            'https://accounts.spotify.com/api/token',
            'grant_type=client_credentials',
            {
                headers: {
                    'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        spotifyAccessToken = response.data.access_token;
        console.log('✅ Spotify token refreshed');
        setTimeout(getSpotifyToken, 55 * 60 * 1000);
    } catch (error) {
        console.error('❌ Spotify token error:', error.message);
        setTimeout(getSpotifyToken, 10000);
    }
}

// Emotion detection (unchanged)
async function detectEmotion(text) {
    if (SAPLING_API_KEY) {
        try {
            const response = await axios.post(
                'https://api.sapling.ai/api/v1/emotion',
                { text },
                {
                    headers: {
                        'API-KEY': SAPLING_API_KEY,
                        'Content-Type': 'application/json'
                    }
                }
            );
            if (response.data?.emotion) return response.data.emotion.toLowerCase();
        } catch (err) {
            console.warn('🔁 Falling back to keyword detection');
        }
    }

    const textLower = text.toLowerCase();
    const emotionKeywords = {
        happy: ['happy', 'joy', 'excited', 'மகிழ்ச்சி', 'சந்தோஷம்', 'ஆனந்தம்'],
        sad: ['sad', 'depress', 'lonely', 'வருத்தம்', 'துக்கம்', 'சோகம்'],
        energetic: ['energetic', 'pump', 'excite', 'ஆற்றல்', 'உற்சாகம்'],
        calm: ['calm', 'peace', 'relax', 'அமைதி', 'சாந்தி'],
        angry: ['angry', 'rage', 'frustrat', 'கோபம்', 'ஆத்திரம்']
    };

    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
        if (keywords.some(keyword => textLower.includes(keyword))) return emotion;
    }
    return 'happy';
}

// MODIFIED: Better Tamil song search
async function getSpotifyTracks(query, language, limit) {
    try {
        if (!spotifyAccessToken) await getSpotifyToken();

        const searchQuery = language === 'tamil'
            ? `${query} genre:tamil OR genre:"tamil film"` // Improved Tamil search
            : `${query} genre:pop OR genre:rock`;

        const response = await axios.get(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=${limit}`,
            {
                headers: {
                    'Authorization': `Bearer ${spotifyAccessToken}`
                }
            }
        );

        const tracks = await Promise.all(
            response.data.tracks.items.map(async track => {
                let youtubeId = null;
                if (!track.preview_url && YOUTUBE_API_KEY) {
                    youtubeId = await findYouTubeId(
                        `${track.name} ${track.artists[0].name} ${
                            language === 'tamil' ? 'tamil song' : 'official audio'
                        }`
                    );
                }

                return {
                    id: track.id,
                    name: track.name,
                    artist: track.artists.map(a => a.name).join(', '),
                    audio: track.preview_url || (youtubeId ? `/youtube-audio/${youtubeId}` : null),
                    image: track.album.images[0]?.url || '',
                    language,
                    duration: track.duration_ms,
                    spotify_url: track.external_urls.spotify,
                    youtube_id: youtubeId
                };
            })
        );

        return tracks.filter(track => track.audio !== null);
    } catch (err) {
        console.error('Spotify error:', err.message);
        return [];
    }
}

// YouTube search (unchanged)
async function findYouTubeId(query) {
    try {
        const url = `https://www.googleapis.com/youtube/v3/search?part=id&q=${encodeURIComponent(query)}&type=video&maxResults=1&key=${YOUTUBE_API_KEY}`;
        const response = await axios.get(url);
        return response.data.items?.[0]?.id?.videoId || null;
    } catch (err) {
        console.error('YouTube search error:', err.message);
        return null;
    }
}

// Audio endpoint (unchanged)
app.get('/youtube-audio/:id', async (req, res) => {
    try {
        const id = req.params.id;
        if (!ytdl.validateID(id)) return res.status(400).json({ error: 'Invalid ID' });

        res.header('Content-Disposition', 'inline');
        res.header('Content-Type', 'audio/mpeg');
        
        ytdl(id, {
            quality: 'highestaudio',
            filter: 'audioonly'
        }).pipe(res);
    } catch (err) {
        console.error('YouTube proxy error:', err.message);
        res.status(500).json({ error: 'Failed to fetch YouTube audio' });
    }
});

// Recommendation endpoint (unchanged)
app.post('/recommend', async (req, res) => {
    const { message, count = 10, languages = ['english', 'tamil'] } = req.body;
    if (!message) {
        return res.status(400).json({
            error: 'Please describe your mood',
            songs: getFallbackSongs(languages)
        });
    }

    try {
        const emotion = await detectEmotion(message);
        console.log(`🧠 Detected: ${emotion}`);

        let songs = [];
        const perLang = Math.ceil(count / languages.length);

        for (const lang of languages) {
            const langSongs = await getSpotifyTracks(emotion, lang, perLang);
            songs.push(...langSongs);
        }

        if (songs.length < count) {
            const extras = await getSpotifyTracks('', languages[0], count - songs.length);
            songs.push(...extras);
        }

        if (!songs.length) songs = getFallbackSongs(languages);

        res.json({ emotion, songs: songs.slice(0, count) });
    } catch (err) {
        console.error('Recommend error:', err.message);
        res.status(500).json({
            error: 'Something went wrong',
            songs: getFallbackSongs(languages)
        });
    }
});

function getFallbackSongs(languages = ['english']) {
    const fallback = {
        english: [
            {
                id: 'fallback-en-1',
                name: "Blinding Lights",
                artist: "The Weeknd",
                audio: "/youtube-audio/fHI8X4OXluQ",
                youtube_id: "fHI8X4OXluQ",
                image: "https://i.ytimg.com/vi/fHI8X4OXluQ/hqdefault.jpg",
                language: "english",
                duration: 200000,
                spotify_url: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b"
            },
            {
                id: 'fallback-en-2',
                name: "Uptown Funk",
                artist: "Mark Ronson ft. Bruno Mars",
                audio: "/youtube-audio/OPf0YbXqDm0",
                youtube_id: "OPf0YbXqDm0",
                image: "https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg",
                language: "english",
                duration: 270000,
                spotify_url: "https://open.spotify.com/track/32OlwWuMpZ6b0aN2RZOeMS"
            },
            {
                id: 'fallback-en-3',
                name: "Levitating",
                artist: "Dua Lipa",
                audio: "/youtube-audio/TUVcZfQe-Kw",
                youtube_id: "TUVcZfQe-Kw",
                image: "https://i.ytimg.com/vi/TUVcZfQe-Kw/hqdefault.jpg",
                language: "english",
                duration: 203000,
                spotify_url: "https://open.spotify.com/track/463CkQjx2Zk1yXoBuierM9"
            },
            {
                id: 'fallback-en-4',
                name: "Senorita",
                artist: "Shawn Mendes & Camila Cabello",
                audio: "/youtube-audio/Pkh8UtuejGw",
                youtube_id: "Pkh8UtuejGw",
                image: "https://i.ytimg.com/vi/Pkh8UtuejGw/hqdefault.jpg",
                language: "english",
                duration: 190000,
                spotify_url: "https://open.spotify.com/track/0TK2YIli7K1leLovkQiNik"
            },
            {
                id: 'fallback-en-5',
                name: "Perfect",
                artist: "Ed Sheeran",
                audio: "/youtube-audio/2Vv-BfVoq4g",
                youtube_id: "2Vv-BfVoq4g",
                image: "https://i.ytimg.com/vi/2Vv-BfVoq4g/hqdefault.jpg",
                language: "english",
                duration: 263000,
                spotify_url: "https://open.spotify.com/track/0tgVpDi06FyKpA1z0VMD4v"
            }
        ],
        tamil: [
           
            {
                id: 'fallback-ta-6',
                name: "Ootagatha Kattiko",
                artist: "S. P. Balasubrahmanyam & K. S. Chithra",
                audio: "https://www.youtube.com/watch?v=BthWzOAihkk",
                youtube_id: "BthWzOAihkk",
                image: "https://i.ytimg.com/vi/BthWzOAihkk/hqdefault.jpg",
                language: "tamil",
                duration: 300000,
                spotify_url: "https://open.spotify.com/track/065hhs8MnhsgLay10eZ9En"
            },
            {
                id: 'fallback-ta-6',
                name: "Anbe Anbe",
                artist: "A. R. Rahman",
                audio: "https://www.youtube.com/watch?v=WeUPSXzoeRs",
                youtube_id: "WeUPSXzoeRs",
                image: "https://i.ytimg.com/vi/WeUPSXzoeRs/hqdefault.jpg",
                language: "tamil",
                duration: 333000,
                spotify_url: "https://open.spotify.com/track/0IvGf9t99AcOKB1yXhD3Xr"
            },
            {
                "id": "fallback-ta-6",
                "name": "Poopola Theepola",
                "artist": "Hariharan",
                "audio": "https://www.youtube.com/watch?v=rJburXBhIf0",
                "youtube_id": "rJburXBhIf0",
                "image": "https://i.ytimg.com/vi/rJburXBhIf0/hqdefault.jpg",
                "language": "tamil",
                "duration": 295000,
                "spotify_url": "https://open.spotify.com/track/0FdYyJAcAhhVWYUVvcUBYz"
              },
              {
                id: 'fallback-ta-1',
                name: "Enjoy Enjaami",
                artist: "Dhee ft. Arivu",
                audio: "/youtube-audio/eYq7WapuDLU",
                youtube_id: "eYq7WapuDLU",
                image: "https://i.ytimg.com/vi/eYq7WapuDLU/hqdefault.jpg",
                language: "tamil",
                duration: 260000,
                spotify_url: "https://open.spotify.com/track/4sJJ2mXrAPEyHWIvKbV4ef"
            },
    
            
            
            
            
            
            
            
            
        ]
    };

    return languages.flatMap(lang => fallback[lang] || []);
}



app.listen(PORT, () => {
    console.log(`🎵 MusicPatch API running at http://localhost:${PORT}`);
    getSpotifyToken();
});