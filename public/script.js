document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chatBox = document.getElementById('chat-box');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const recommendedTracks = document.getElementById('recommended-tracks');
    const audioPlayerContainer = document.getElementById('audio-player-container');
    const globalAudioPlayer = document.getElementById('global-audio-player');
    const nowPlayingArt = document.getElementById('now-playing-art');
    const nowPlayingTitle = document.getElementById('now-playing-title');
    const nowPlayingArtist = document.getElementById('now-playing-artist');
    const closePlayerBtn = document.getElementById('close-player-btn');
    globalAudioPlayer.pause();
globalAudioPlayer.removeAttribute('src');
globalAudioPlayer.load();  // Clear before re-setting


    
    // State
    let currentPlayingTrack = null;
    let isPlayerInitialized = false;
    let isFetching = false;

    // Initialize
    initAudioPlayer();
    setupEventListeners();

    function setupEventListeners() {
        sendBtn.addEventListener('click', handleSendMessage);
        userInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleSendMessage());
        closePlayerBtn.addEventListener('click', closePlayer);
    }

    function initAudioPlayer() {
        if (isPlayerInitialized) return;
        
        const controls = `
            <div class="player-controls">
                <button class="control-btn play-pause-btn"><i class="fas fa-play"></i></button>
                <input type="range" class="progress-bar" value="0" min="0" max="100">
                <div class="time-display">0:00 / 0:00</div>
                <button class="control-btn volume-icon"><i class="fas fa-volume-up"></i></button>
                <input type="range" class="volume-control" value="80" min="0" max="100">
            </div>
        `;
        audioPlayerContainer.insertAdjacentHTML('afterbegin', controls);
        
        // Event listeners
        document.querySelector('.play-pause-btn').addEventListener('click', togglePlayPause);
        document.querySelector('.progress-bar').addEventListener('input', seekAudio);
        document.querySelector('.volume-control').addEventListener('input', adjustVolume);
        document.querySelector('.volume-icon').addEventListener('click', toggleMute);
        
        globalAudioPlayer.addEventListener('timeupdate', updateProgressBar);
        globalAudioPlayer.addEventListener('ended', handleAudioEnd);
        globalAudioPlayer.addEventListener('volumechange', updateVolumeIcon);
        
        globalAudioPlayer.volume = 0.8;
        isPlayerInitialized = true;
    }

    async function handleSendMessage() {
        const message = userInput.value.trim();
        if (!message || isFetching) return;

        addMessage(message, 'user');
        userInput.value = '';
        isFetching = true;
        
        const loadingId = addLoadingMessage();

        try {
            // FORCE FAILURE TEST - Uncomment to test failure
            // throw new Error("Forced failure test");
            
            const response = await fetch('/recommend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: message,
                    count: 10,
                    languages: ['tamil', 'english'] // Tamil first
                })
            });

            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            
            const data = await response.json();
            displaySongs(data.songs);
            addMessage(`I found songs for <strong>${data.emotion}</strong> mood:`, 'bot');

        } catch (error) {
            // This will execute when chatbot fails
            console.error("Chatbot failed:", error);
            displaySongs(getFallbackSongs());
            addMessage("Sorry, I couldn't process your request. Here are some fallback songs.", 'bot', true);
        } finally {
            removeLoadingMessage(loadingId);
            isFetching = false;
        }
    }

    function displaySongs(songs) {
        recommendedTracks.innerHTML = songs.length ? '' : `
            <div class="no-results">
                <i class="fas fa-music"></i> No songs found
            </div>
        `;

        songs.forEach(song => {
            const canPlay = song.audio || song.youtube_id;
            const card = document.createElement('div');
            card.className = 'track-card';
            card.innerHTML = `
                <div class="album-art-container ${canPlay ? 'has-preview' : 'no-preview'}">
                    <img src="${song.image || 'https://via.placeholder.com/300'}" 
                         class="album-art" 
                         alt="${song.name} cover">
                    ${canPlay ? `
                    <button class="play-btn" data-song='${JSON.stringify(song).replace(/'/g, "\\'")}'>
                        <i class="fas fa-play"></i>
                    </button>` : `
                    <div class="no-preview-message">
                        <i class="fas fa-ban"></i> No Preview
                    </div>`}
                </div>
                <div class="track-info">
                    <div class="track-title">
                        ${song.name || 'Unknown Track'}
                        <span class="language-tag">${song.language?.toUpperCase() || 'EN'}</span>
                    </div>
                    <div class="track-artist">${song.artist || 'Unknown Artist'}</div>
                    <div class="track-duration">${formatDuration(song.duration)}</div>
                    ${song.spotify_url ? `
                    <a href="${song.spotify_url}" target="_blank" class="spotify-link">
                        <i class="fab fa-spotify"></i> Spotify
                    </a>` : ''}
                </div>
            `;
            recommendedTracks.appendChild(card);
        });

        // SINGLE PLAY BUTTON HANDLER
        document.querySelectorAll('.play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const song = JSON.parse(btn.dataset.song);
                playSong(song);
            });
        });
    }
    function handleAudioEnd() {
        document.querySelector('.play-pause-btn').innerHTML = '<i class="fas fa-play"></i>';
        globalAudioPlayer.currentTime = 0;
    }
    if (!audioSrc) throw new Error("No audio source");
    if (!song.audio && song.youtube_id) {
        embedYouTubePlayer(song.youtube_id);
        return;
    }
    
    if (!song.audio && song.youtube_id) {
        embedYouTubePlayer(song.youtube_id);
        return;
    }
    
    
    async function playSong(song) {
        // Toggle if same song
        if (currentPlayingTrack?.id === song.id) {
            togglePlayPause();
            return;
        }
    
        // Reset player
        globalAudioPlayer.pause();
        currentPlayingTrack = song;
    
        // Update UI
        nowPlayingArt.src = song.image || 'https://via.placeholder.com/300';
        nowPlayingTitle.textContent = song.name || 'Unknown Track';
        nowPlayingArtist.textContent = song.artist || 'Unknown Artist';
        document.querySelector('.time-display').textContent = `0:00 / ${formatDuration(song.duration)}`;
        audioPlayerContainer.style.display = 'flex';
    
        try {
            const audioSrc = song.audio || `/youtube-audio/${song.youtube_id}`;
            if (!audioSrc) throw new Error("No audio source");
    
            globalAudioPlayer.src = audioSrc;
            await globalAudioPlayer.play();
            document.querySelector('.play-pause-btn').innerHTML = '<i class="fas fa-pause"></i>';
        } catch (error) {
            console.warn("Audio playback failed, falling back to external links.");
            if (song.youtube_id) {
                window.open(`https://www.youtube.com/watch?v=${song.youtube_id}`, '_blank');
            } else if (song.spotify_url) {
                window.open(song.spotify_url, '_blank');
            } else {
                showErrorInChat("No playback source available.");
            }
        }
    }
    async function playSong(song) {
        // If the same song is playing, toggle pause/play
        if (currentPlayingTrack?.id === song.id) {
            togglePlayPause();
            return;
        }
    
        // Stop current track and reset
        globalAudioPlayer.pause();
        globalAudioPlayer.currentTime = 0;
    
        // Set new track
        currentPlayingTrack = song;
    
        // Update UI
        nowPlayingArt.src = song.image || 'https://via.placeholder.com/300';
        nowPlayingTitle.textContent = song.name || 'Unknown Track';
        nowPlayingArtist.textContent = song.artist || 'Unknown Artist';
        audioPlayerContainer.style.display = 'flex';
        document.querySelector('.play-pause-btn').innerHTML = '<i class="fas fa-play"></i>';
        document.querySelector('.time-display').textContent = `0:00 / ${formatDuration(song.duration)}`;
    
        try {
            const audioSrc = song.audio || `/youtube-audio/${song.youtube_id}`;
            if (!audioSrc) throw new Error("No audio source available");
    
            globalAudioPlayer.src = audioSrc;
            await globalAudioPlayer.play();
    
            document.querySelector('.play-pause-btn').innerHTML = '<i class="fas fa-pause"></i>';
        } catch (error) {
            console.error("Playback failed:", error);
            if (song.youtube_id) {
                window.open(`https://www.youtube.com/watch?v=${song.youtube_id}`, '_blank');
            } else if (song.spotify_url) {
                window.open(song.spotify_url, '_blank');
            } else {
                showErrorInChat("No audio or link available.");
            }
        }
    }
    function handleAudioEnd() {
        document.querySelector('.play-pause-btn').innerHTML = '<i class="fas fa-play"></i>';
        globalAudioPlayer.currentTime = 0;
    }
    function highlightPlayingTrack(songId) {
        document.querySelectorAll('.track-card').forEach(card => {
            card.classList.remove('playing');
        });
        const playingCard = [...document.querySelectorAll('.play-btn')].find(btn => {
            const btnSong = JSON.parse(btn.dataset.song);
            return btnSong.id === songId;
        });
        if (playingCard) {
            playingCard.closest('.track-card').classList.add('playing');
        }
    }
    
    async function playSong(song) {
        // Toggle if same song
        if (currentPlayingTrack?.id === song.id) {
            togglePlayPause();
            return;
        }
    
        // Stop current track and reset
        globalAudioPlayer.pause();
        globalAudioPlayer.currentTime = 0;
    
        // Set new track
        currentPlayingTrack = song;
    
        // Update UI
        nowPlayingArt.src = song.image || 'https://via.placeholder.com/300';
        nowPlayingTitle.textContent = song.name || 'Unknown Track';
        nowPlayingArtist.textContent = song.artist || 'Unknown Artist';
        audioPlayerContainer.style.display = 'flex';
        document.querySelector('.play-pause-btn').innerHTML = '<i class="fas fa-play"></i>';
        document.querySelector('.time-display').textContent = `0:00 / ${formatDuration(song.duration)}`;
    
        try {
            const audioSrc = song.audio || `/youtube-audio/${song.youtube_id}`;
            if (!audioSrc) throw new Error("No audio source available");
    
            globalAudioPlayer.src = audioSrc;
            await globalAudioPlayer.play();
    
            document.querySelector('.play-pause-btn').innerHTML = '<i class="fas fa-pause"></i>';
        } catch (error) {
            console.error("Playback failed:", error);
            if (song.youtube_id) {
                window.open(`https://www.youtube.com/watch?v=${song.youtube_id}`, '_blank');
            } else if (song.spotify_url) {
                window.open(song.spotify_url, '_blank');
            } else {
                showErrorInChat("No audio or link available.");
            }
        }
    }
    function embedYouTubePlayer(youtubeId) {
        const playerContainer = document.createElement('div');
        playerContainer.id = 'youtube-player-container';
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=0`;
        iframe.width = '100%';
        iframe.height = '100%';
        iframe.frameBorder = '0';
        playerContainer.appendChild(iframe);
        audioPlayerContainer.appendChild(playerContainer);
    }
    document.addEventListener('DOMContentLoaded', () => {
        // DOM Elements
        const chatBox = document.getElementById('chat-box');
        const userInput = document.getElementById('user-input');
        const sendBtn = document.getElementById('send-btn');
        const recommendedTracks = document.getElementById('recommended-tracks');
        const audioPlayerContainer = document.getElementById('audio-player-container');
        const globalAudioPlayer = document.getElementById('global-audio-player');
        const nowPlayingArt = document.getElementById('now-playing-art');
        const nowPlayingTitle = document.getElementById('now-playing-title');
        const nowPlayingArtist = document.getElementById('now-playing-artist');
        const closePlayerBtn = document.getElementById('close-player-btn');
        
        globalAudioPlayer.pause();
        globalAudioPlayer.removeAttribute('src');
        globalAudioPlayer.load();  // Clear before re-setting
    
        // State
        let currentPlayingTrack = null;
        let isPlayerInitialized = false;
        let isFetching = false;
    
        // Initialize
        initAudioPlayer();
        setupEventListeners();
    
        function setupEventListeners() {
            sendBtn.addEventListener('click', handleSendMessage);
            userInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleSendMessage());
            closePlayerBtn.addEventListener('click', closePlayer);
        }
    
        function initAudioPlayer() {
            if (isPlayerInitialized) return;
    
            const controls = `
                <div class="player-controls">
                    <button class="control-btn play-pause-btn"><i class="fas fa-play"></i></button>
                    <input type="range" class="progress-bar" value="0" min="0" max="100">
                    <div class="time-display">0:00 / 0:00</div>
                    <button class="control-btn volume-icon"><i class="fas fa-volume-up"></i></button>
                    <input type="range" class="volume-control" value="80" min="0" max="100">
                </div>
            `;
            audioPlayerContainer.insertAdjacentHTML('afterbegin', controls);
    
            // Event listeners
            document.querySelector('.play-pause-btn').addEventListener('click', togglePlayPause);
            document.querySelector('.progress-bar').addEventListener('input', seekAudio);
            document.querySelector('.volume-control').addEventListener('input', adjustVolume);
            document.querySelector('.volume-icon').addEventListener('click', toggleMute);
    
            globalAudioPlayer.addEventListener('timeupdate', updateProgressBar);
            globalAudioPlayer.addEventListener('ended', handleAudioEnd);
            globalAudioPlayer.addEventListener('volumechange', updateVolumeIcon);
    
            globalAudioPlayer.volume = 0.8;
            isPlayerInitialized = true;
        }
    
        async function handleSendMessage() {
            const message = userInput.value.trim();
            if (!message || isFetching) return;
    
            addMessage(message, 'user');
            userInput.value = '';
            isFetching = true;
    
            const loadingId = addLoadingMessage();
    
            try {
                const response = await fetch('/recommend', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: message,
                        count: 10,
                        languages: ['tamil', 'english']
                    })
                });
    
                if (!response.ok) throw new Error(`Server error: ${response.status}`);
    
                const data = await response.json();
                displaySongs(data.songs);
                addMessage(`I found songs for <strong>${data.emotion}</strong> mood:`, 'bot');
    
            } catch (error) {
                console.error("Chatbot failed:", error);
                displaySongs(getFallbackSongs());
                addMessage("Sorry, I couldn't process your request. Here are some fallback songs.", 'bot', true);
            } finally {
                removeLoadingMessage(loadingId);
                isFetching = false;
            }
        }
    
        function displaySongs(songs) {
            recommendedTracks.innerHTML = songs.length ? '' : `
                <div class="no-results">
                    <i class="fas fa-music"></i> No songs found
                </div>
            `;
    
            songs.forEach(song => {
                const canPlay = song.audio || song.youtube_id;
                const card = document.createElement('div');
                card.className = 'track-card';
                card.innerHTML = `
                    <div class="album-art-container ${canPlay ? 'has-preview' : 'no-preview'}">
                        <img src="${song.image || 'https://via.placeholder.com/300'}" 
                             class="album-art" 
                             alt="${song.name} cover">
                        ${canPlay ? `
                        <button class="play-btn" data-song='${JSON.stringify(song).replace(/'/g, "\\'")}'><i class="fas fa-play"></i></button>` : `
                        <div class="no-preview-message">
                            <i class="fas fa-ban"></i> No Preview
                        </div>`}
                    </div>
                    <div class="track-info">
                        <div class="track-title">
                            ${song.name || 'Unknown Track'}
                            <span class="language-tag">${song.language?.toUpperCase() || 'EN'}</span>
                        </div>
                        <div class="track-artist">${song.artist || 'Unknown Artist'}</div>
                        <div class="track-duration">${formatDuration(song.duration)}</div>
                        ${song.spotify_url ? `
                        <a href="${song.spotify_url}" target="_blank" class="spotify-link">
                            <i class="fab fa-spotify"></i> Spotify
                        </a>` : ''}
                    </div>
                `;
                recommendedTracks.appendChild(card);
            });
    
            document.querySelectorAll('.play-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const song = JSON.parse(btn.dataset.song);
                    playSong(song);
                });
            });
        }
    
        async function playSong(song) {
            if (currentPlayingTrack?.id === song.id) {
                togglePlayPause();
                return;
            }
    
            globalAudioPlayer.pause();
            globalAudioPlayer.currentTime = 0;
    
            currentPlayingTrack = song;
    
            nowPlayingArt.src = song.image || 'https://via.placeholder.com/300';
            nowPlayingTitle.textContent = song.name || 'Unknown Track';
            nowPlayingArtist.textContent = song.artist || 'Unknown Artist';
            document.querySelector('.time-display').textContent = `0:00 / ${formatDuration(song.duration)}`;
            audioPlayerContainer.style.display = 'flex';
    
            try {
                const audioSrc = song.audio || `/youtube-audio/${song.youtube_id}`;
                if (!audioSrc) throw new Error("No audio source available");
    
                globalAudioPlayer.src = audioSrc;
                await globalAudioPlayer.play();
                document.querySelector('.play-pause-btn').innerHTML = '<i class="fas fa-pause"></i>';
            } catch (error) {
                console.error("Playback failed:", error);
                if (song.youtube_id) {
                    window.open(`https://www.youtube.com/watch?v=${song.youtube_id}`, '_blank');
                } else if (song.spotify_url) {
                    window.open(song.spotify_url, '_blank');
                } else {
                    showErrorInChat("No audio or link available.");
                }
            }
        }
    
        function togglePlayPause() {
            if (globalAudioPlayer.paused) {
                globalAudioPlayer.play()
                    .then(() => document.querySelector('.play-pause-btn').innerHTML = '<i class="fas fa-pause"></i>')
                    .catch(err => console.error("Play failed:", err));
            } else {
                globalAudioPlayer.pause();
                document.querySelector('.play-pause-btn').innerHTML = '<i class="fas fa-play"></i>';
            }
        }
    
        function updateProgressBar() {
            const progress = (globalAudioPlayer.currentTime / globalAudioPlayer.duration) * 100 || 0;
            document.querySelector('.progress-bar').value = progress;
            document.querySelector('.time-display').textContent =
                `${formatTime(globalAudioPlayer.currentTime)} / ${formatTime(globalAudioPlayer.duration)}`;
        }
    
        function formatTime(seconds = 0) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    
        function formatDuration(ms = 0) {
            return formatTime(ms / 1000);
        }
    
        function showErrorInChat(message) {
            addMessage(`<i class="fas fa-exclamation-circle"></i> ${message}`, 'bot', true);
        }
    
        function getFallbackSongs() {
            return [
              
            ];
        }
    });
    
    // Player control functions
    function togglePlayPause() {
        if (globalAudioPlayer.paused) {
            globalAudioPlayer.play()
                .then(() => document.querySelector('.play-pause-btn').innerHTML = '<i class="fas fa-pause"></i>')
                .catch(err => console.error("Play failed:", err));
        } else {
            globalAudioPlayer.pause();
            document.querySelector('.play-pause-btn').innerHTML = '<i class="fas fa-play"></i>';
        }
    }

    function updateProgressBar() {
        const progress = (globalAudioPlayer.currentTime / globalAudioPlayer.duration) * 100 || 0;
        document.querySelector('.progress-bar').value = progress;
        document.querySelector('.time-display').textContent = 
            `${formatTime(globalAudioPlayer.currentTime)} / ${formatTime(globalAudioPlayer.duration)}`;
    }

    function seekAudio() {
        globalAudioPlayer.currentTime = (document.querySelector('.progress-bar').value / 100) * globalAudioPlayer.duration;
    }

    function adjustVolume() {
        globalAudioPlayer.volume = document.querySelector('.volume-control').value / 100;
        globalAudioPlayer.muted = false;
        updateVolumeIcon();
    }

    function toggleMute() {
        globalAudioPlayer.muted = !globalAudioPlayer.muted;
        updateVolumeIcon();
    }

    function updateVolumeIcon() {
        const icon = document.querySelector('.volume-icon');
        if (globalAudioPlayer.muted || globalAudioPlayer.volume === 0) {
            icon.innerHTML = '<i class="fas fa-volume-mute"></i>';
            document.querySelector('.volume-control').value = 0;
        } else {
            icon.innerHTML = `<i class="fas ${globalAudioPlayer.volume < 0.5 ? 'fa-volume-down' : 'fa-volume-up'}"></i>`;
            document.querySelector('.volume-control').value = globalAudioPlayer.volume * 100;
        }
    }

    function handleAudioEnd() {
        document.querySelector('.play-pause-btn').innerHTML = '<i class="fas fa-play"></i>';
    }

    function closePlayer() {
        audioPlayerContainer.style.display = 'none';
        globalAudioPlayer.pause();
    }

    // Helper functions
    function formatTime(seconds = 0) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function formatDuration(ms = 0) {
        return formatTime(ms / 1000);
    }

    function addMessage(text, type, isError = false) {
        const msg = document.createElement('div');
        msg.className = `message ${type}-message ${isError ? 'error-message' : ''}`;
        msg.innerHTML = text;
        chatBox.appendChild(msg);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function addLoadingMessage() {
        const id = 'loading-' + Date.now();
        const loading = document.createElement('div');
        loading.id = id;
        loading.className = 'message bot-message';
        loading.innerHTML = `
            <div class="loading-container">
                <span>Finding songs...</span>
                <div class="loading-spinner"></div>
            </div>
        `;
        chatBox.appendChild(loading);
        chatBox.scrollTop = chatBox.scrollHeight;
        return id;
    }

    function removeLoadingMessage(id) {
        document.getElementById(id)?.remove();
    }

    function showErrorInChat(message) {
        addMessage(`<i class="fas fa-exclamation-circle"></i> ${message}`, 'bot', true);
    }

    function getFallbackSongs() {
        return [
            {
                id: 'fallback-1',
                name: "Vaathi Coming",
                artist: "Anirudh",
                audio: null,
                youtube_id: "naQ0fS0n8a4",
                image: "https://i.ytimg.com/vi/naQ0fS0n8a4/hqdefault.jpg",
                language: "tamil",
                duration: 211000,
                spotify_url: "https://open.spotify.com/track/4dJrjWtAhEkW7VdPYSL1Ip?si=f76749aad50f4b74"
            },
            {
                id: 'fallback-2',
                name: "Happy",
                artist: "Pharrell Williams",
                audio: null,
                youtube_id: "ZbZSe6N_BXs",
                image: "https://i.scdn.co/image/ab67616d0000b2738a3f0a3ca7929dea23cd274c",
                language: "english",
                duration: 233000,
                spotify_url: "https://open.spotify.com/track/60nZcImufyMA1MKQY3dcCH"
            }
        ];
    }
});