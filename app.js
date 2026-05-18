document.addEventListener('DOMContentLoaded', () => {
    const folderInput = document.getElementById('folderInput');
    const selectFolderBtn = document.getElementById('selectFolderBtn');
    const libraryContainer = document.getElementById('libraryContainer');
    
    // Hero Elements
    const heroVideo = document.getElementById('heroVideo');
    const heroTitle = document.getElementById('heroTitle');
    const heroActionButtons = document.getElementById('heroActionButtons');
    const heroPlayBtn = document.getElementById('heroPlayBtn');
    const heroListBtn = document.getElementById('heroListBtn');
    
    // Cinema & Pause Overlay Elements
    const cinemaOverlay = document.getElementById('cinemaOverlay');
    const mainPlayer = document.getElementById('mainPlayer');
    const closeCinemaBtn = document.getElementById('closeCinemaBtn');
    const subtitleDropzone = document.getElementById('subtitleDropzone');
    const pauseOverlay = document.getElementById('pauseOverlay');
    const pauseRecommendations = document.getElementById('pauseRecommendations');

    // Global State
    let allFiles = [];
    const thumbnailCache = {}; // FITUR BARU: Menyimpan gambar di RAM agar muncul instan saat Pause
    let currentHeroFile = null;
    let heroBlobUrl = null;
    let activeMainUrl = null;
    let activeSubtitleUrl = null;
    let currentlyPlayingName = null;
    
    let currentPlaylist = [];
    let currentPlayIndex = -1;

    let myList = JSON.parse(localStorage.getItem('lokalflix_mylist')) || [];

    // --- 1. PEMINDAIAN FOLDER ---
    selectFolderBtn.addEventListener('click', () => folderInput.click());

    folderInput.addEventListener('change', async (event) => {
        libraryContainer.innerHTML = ''; 
        if (heroBlobUrl) { URL.revokeObjectURL(heroBlobUrl); heroVideo.src = ""; }
        
        allFiles = Array.from(event.target.files).filter(f => f.type.startsWith('video/'));
        if (allFiles.length === 0) return alert('Tidak ada file video.');

        const categories = {};
        allFiles.forEach(file => {
            const pathParts = file.webkitRelativePath.split('/');
            const catName = pathParts.length > 2 ? pathParts[pathParts.length - 2] : "Video Tersimpan";
            if (!categories[catName]) categories[catName] = [];
            categories[catName].push(file);
        });

        updateHeroBackground(allFiles[Math.floor(Math.random() * allFiles.length)]);

        const continueWatchingFiles = allFiles.filter(file => {
            const saved = JSON.parse(localStorage.getItem(`loc_stream_${file.name}`));
            return saved && saved.time > 30 && saved.time < (saved.dur - 10); 
        });
        if (continueWatchingFiles.length > 0) await createRow("Lanjutkan Menonton", continueWatchingFiles);

        const myListFiles = allFiles.filter(file => myList.includes(file.name));
        if (myListFiles.length > 0) await createRow("Daftar Saya", myListFiles);

        for (const [catName, files] of Object.entries(categories)) {
            await createRow(catName, files);
        }
    });

    // --- 2. ENGINE PEMBUAT BARIS ---
    async function createRow(title, filesArray) {
        const rowContainer = document.createElement('div');
        rowContainer.className = 'row-container';
        rowContainer.innerHTML = `
            <h2 class="row-title">${title}</h2>
            <div class="carousel-wrapper">
                <button class="nav-btn nav-left"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>
                <div class="video-carousel"></div>
                <button class="nav-btn nav-right"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>
            </div>
        `;
        libraryContainer.appendChild(rowContainer);

        const carousel = rowContainer.querySelector('.video-carousel');
        rowContainer.querySelector('.nav-left').onclick = () => carousel.scrollBy({ left: -window.innerWidth/2, behavior: 'smooth' });
        rowContainer.querySelector('.nav-right').onclick = () => carousel.scrollBy({ left: window.innerWidth/2, behavior: 'smooth' });

        for (const file of filesArray) {
            const skeleton = document.createElement('div');
            skeleton.className = 'video-card loading';
            skeleton.innerHTML = `<div class="thumbnail-container"></div>`;
            carousel.appendChild(skeleton);

            const meta = await extractVideoMetadata(file);
            if (meta.success) thumbnailCache[file.name] = meta.thumb; // Simpan gambar ke RAM
            renderCard(file, skeleton, meta, filesArray); 
        }
    }

    // --- 3. RENDERING KARTU ---
    function renderCard(file, skeleton, meta, playlist) {
        skeleton.classList.remove('loading');
        if (!meta.success) return skeleton.remove();

        const isListed = myList.includes(file.name);
        const listIcon = isListed ? `<path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round"/>` : `<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>`;
        const saved = JSON.parse(localStorage.getItem(`loc_stream_${file.name}`));
        const pPercent = (saved && saved.dur > 0) ? (saved.time / saved.dur) * 100 : 0;

        skeleton.innerHTML = `
            <div class="thumbnail-container">
                <img src="${meta.thumb}">
                <div class="duration-badge">${formatTime(meta.dur)}</div>
                <div class="watch-progress-bar" style="width: ${pPercent}%"></div>
            </div>
            <div class="video-info">
                <div class="video-title">${file.name.replace(/\.[^/.]+$/, "")}</div>
                <button class="btn-card-add" title="Daftar Saya">
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none">${listIcon}</svg>
                </button>
            </div>
        `;

        let heroTimeout;
        skeleton.addEventListener('mouseenter', () => {
            clearTimeout(heroTimeout);
            heroTimeout = setTimeout(() => updateHeroBackground(file), 500); 
        });
        skeleton.addEventListener('mouseleave', () => clearTimeout(heroTimeout));

        skeleton.querySelector('.thumbnail-container').addEventListener('click', () => openCinema(file, playlist));
        skeleton.querySelector('.btn-card-add').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMyList(file.name);
            if(currentHeroFile && currentHeroFile.name === file.name) updateHeroListBtnState();
        });
    }

    // --- 4. ENGINE HERO ---
    function updateHeroBackground(file) {
        if (!file || (currentHeroFile && currentHeroFile.name === file.name)) return;
        currentHeroFile = file;

        if (heroBlobUrl) URL.revokeObjectURL(heroBlobUrl);
        heroBlobUrl = URL.createObjectURL(file);
        
        heroVideo.src = heroBlobUrl;
        heroTitle.textContent = file.name.replace(/\.[^/.]+$/, "");
        heroActionButtons.style.display = 'flex';
        updateHeroListBtnState();

        heroVideo.addEventListener('loadedmetadata', function initHero() {
            if (heroVideo.duration > 15) heroVideo.currentTime = heroVideo.duration * (0.2 + (Math.random() * 0.2));
            heroVideo.play().catch(()=>{});
            heroVideo.removeEventListener('loadedmetadata', initHero);
        });

        heroPlayBtn.onclick = () => openCinema(file, allFiles);
    }

    function updateHeroListBtnState() {
        const isListed = myList.includes(currentHeroFile.name);
        const svg = heroListBtn.querySelector('svg');
        if (isListed) {
            svg.innerHTML = `<path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round"/>`;
            document.getElementById('heroListText').textContent = "Hapus Daftar";
        } else {
            svg.innerHTML = `<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>`;
            document.getElementById('heroListText').textContent = "Daftar Saya";
        }
    }

    heroListBtn.onclick = () => toggleMyList(currentHeroFile.name);

    function toggleMyList(fileName) {
        if (myList.includes(fileName)) {
            myList = myList.filter(n => n !== fileName);
            alert(`Dihapus dari Daftar Saya (Refresh halaman folder untuk melihat perubahan)`);
        } else {
            myList.push(fileName);
        }
        localStorage.setItem('lokalflix_mylist', JSON.stringify(myList));
        updateHeroListBtnState();
    }

    // --- 5. CINEMA PLAYER ---
    function openCinema(file, playlist) {
        if (activeMainUrl) URL.revokeObjectURL(activeMainUrl);
        if (activeSubtitleUrl) URL.revokeObjectURL(activeSubtitleUrl);
        
        mainPlayer.innerHTML = ''; 
        pauseOverlay.classList.add('hidden'); // Sembunyikan menu pause saat awal buka
        
        currentlyPlayingName = file.name;
        currentPlaylist = playlist;
        currentPlayIndex = playlist.findIndex(f => f.name === file.name);

        activeMainUrl = URL.createObjectURL(file);
        mainPlayer.src = activeMainUrl;
        
        heroVideo.pause(); 
        cinemaOverlay.classList.remove('hidden');

        const saved = JSON.parse(localStorage.getItem(`loc_stream_${file.name}`));
        if (saved && saved.time > 5) mainPlayer.currentTime = saved.time;

        mainPlayer.play();
    }

    mainPlayer.addEventListener('ended', () => {
        if (currentPlayIndex >= 0 && currentPlayIndex < currentPlaylist.length - 1) {
            openCinema(currentPlaylist[currentPlayIndex + 1], currentPlaylist);
        } else {
            closeCinemaBtn.click(); 
        }
    });

    closeCinemaBtn.addEventListener('click', () => {
        pauseOverlay.classList.add('hidden');
        mainPlayer.pause();
        mainPlayer.src = ""; 
        cinemaOverlay.classList.add('hidden');
        if (activeMainUrl) { URL.revokeObjectURL(activeMainUrl); activeMainUrl = null; }
        heroVideo.play().catch(()=>{}); 
    });

    mainPlayer.addEventListener('timeupdate', () => {
        if (!currentlyPlayingName || mainPlayer.duration === 0) return;
        localStorage.setItem(`loc_stream_${currentlyPlayingName}`, JSON.stringify({time: mainPlayer.currentTime, dur: mainPlayer.duration}));
    });

    // --- 6. LOGIKA PAUSE MENU (FITUR BARU) ---
    let pauseMenuTimeout;
    
    mainPlayer.addEventListener('pause', () => {
        if (cinemaOverlay.classList.contains('hidden') || !activeMainUrl) return;

        // Beri jeda 0.4 detik sebelum muncul agar transisinya elegan
        clearTimeout(pauseMenuTimeout);
        pauseMenuTimeout = setTimeout(() => {
            if (mainPlayer.paused) showPauseRecommendations();
        }, 400);
    });

    mainPlayer.addEventListener('play', () => {
        clearTimeout(pauseMenuTimeout);
        pauseOverlay.classList.add('hidden');
    });

    function showPauseRecommendations() {
        // Ambil video lain yang sedang tidak diputar
        const availableFiles = allFiles.filter(f => f.name !== currentlyPlayingName);
        if (availableFiles.length === 0) return;

        // Acak urutan dan ambil 5 teratas
        const shuffled = availableFiles.sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 5);

        pauseRecommendations.innerHTML = '';
        selected.forEach(file => {
            const card = document.createElement('div');
            card.className = 'pause-card';
            const thumbSrc = thumbnailCache[file.name] || ''; 
            const imgHTML = thumbSrc ? `<img src="${thumbSrc}">` : `<div style="height:100%; background:#333; display:flex; align-items:center; justify-content:center; color:#888;">Loading...</div>`;
            
            card.innerHTML = `
                ${imgHTML}
                <div class="title">${file.name.replace(/\.[^/.]+$/, "")}</div>
            `;
            
            card.onclick = (e) => {
                e.stopPropagation(); // Cegah player utama ikut terklik
                openCinema(file, allFiles); // Langsung pindah muter video ini
            };
            pauseRecommendations.appendChild(card);
        });

        pauseOverlay.classList.remove('hidden');
    }

    // --- 7. DRAG & DROP SUBTITLE ---
    cinemaOverlay.addEventListener('dragover', (e) => { e.preventDefault(); subtitleDropzone.classList.remove('hidden'); });
    cinemaOverlay.addEventListener('dragleave', (e) => { e.preventDefault(); subtitleDropzone.classList.add('hidden'); });
    
    cinemaOverlay.addEventListener('drop', async (e) => {
        e.preventDefault();
        subtitleDropzone.classList.add('hidden');
        
        const file = e.dataTransfer.files[0];
        if (!file || (!file.name.endsWith('.srt') && !file.name.endsWith('.vtt'))) return alert("Hanya mendukung file .srt atau .vtt");

        const text = await file.text();
        let vttText = text;
        if (file.name.endsWith('.srt')) {
            vttText = 'WEBVTT\n\n' + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'); 
        }

        const blob = new Blob([vttText], { type: 'text/vtt' });
        if (activeSubtitleUrl) URL.revokeObjectURL(activeSubtitleUrl);
        activeSubtitleUrl = URL.createObjectURL(blob);

        mainPlayer.innerHTML = ''; 
        const track = document.createElement('track');
        track.kind = 'subtitles'; track.label = 'Indonesia'; track.srclang = 'id'; track.default = true;
        track.src = activeSubtitleUrl;
        
        mainPlayer.appendChild(track);
        alert(`Subtitle "${file.name}" berhasil dimuat!`);
    });

    // --- 8. HELPER ---
    function extractVideoMetadata(file) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const objUrl = URL.createObjectURL(file);
            video.src = objUrl; video.muted = true; video.playsInline = true;

            const toId = setTimeout(() => { URL.revokeObjectURL(objUrl); resolve({success: false}); }, 2500);

            video.addEventListener('loadedmetadata', () => {
                canvas.width = video.videoWidth; canvas.height = video.videoHeight;
                video.currentTime = Math.min(1, video.duration / 2);
            });
            video.addEventListener('seeked', () => {
                clearTimeout(toId);
                try {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    resolve({ success: true, thumb: canvas.toDataURL('image/jpeg', 0.6), dur: video.duration });
                } catch(e) { resolve({success: false}); }
                URL.revokeObjectURL(objUrl);
            });
            video.addEventListener('error', () => { clearTimeout(toId); URL.revokeObjectURL(objUrl); resolve({success: false}); });
        });
    }

    document.addEventListener('keydown', (e) => {
        if (cinemaOverlay.classList.contains('hidden')) return;
        if ([' ', 'ArrowRight', 'ArrowLeft', 'f', 'Escape'].includes(e.key)) e.preventDefault();
        switch (e.key) {
            case ' ': if (mainPlayer.paused) mainPlayer.play(); else mainPlayer.pause(); break;
            case 'ArrowRight': mainPlayer.currentTime += 10; break;
            case 'ArrowLeft': mainPlayer.currentTime -= 10; break;
            case 'f': if (!document.fullscreenElement) mainPlayer.requestFullscreen().catch(()=>{}); else document.exitFullscreen(); break;
            case 'Escape': closeCinemaBtn.click(); break;
        }
    });

    function formatTime(sec) {
        if (isNaN(sec) || sec === Infinity) return "00:00";
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
        return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
    }
});
