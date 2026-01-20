/**
 * ═══════════════════════════════════════════════════════════
 * LECTEUR PODCAST SOLITIQUO V3 (IMMERSIVE HERO)
 * ═══════════════════════════════════════════════════════════
 */

class SolitiquoPodcastPlayer {
  constructor(containerId, audioUrl, data) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    
    this.audioUrl = audioUrl;
    this.data = data;
    this.audio = new Audio(audioUrl);
    this.isPlaying = false;
    this.transcriptOpen = false;
    
    // Récupération du contenu de transcription (s'il existe dans le DOM)
    this.transcriptHTML = "";
    const rawTranscript = document.getElementById(data.transcriptId);
    if(rawTranscript) {
        this.transcriptHTML = rawTranscript.innerHTML;
        rawTranscript.remove(); // On le nettoie du DOM initial
    }

    this.render();
    this.elements = this.cacheElements();
    this.attachEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="glass-hero-wrapper" id="glass-wrapper">
        <div class="glass-bg" style="background-image: url('${this.data.cover}');"></div>
        
        <div class="glass-content">
            
            <div class="glass-top-row">
                <div class="glass-cover-box">
                    <img src="${this.data.cover}" class="glass-img">
                    <div class="glass-overlay-btn" id="btn-cover-play">▶</div>
                </div>

                <div class="glass-info-box">
                    <div class="glass-badges">
                        <span class="g-badge">${this.data.category || 'PODCAST'}</span>
                        <span class="g-date">${this.data.date}</span>
                    </div>
                    
                    <h1 class="glass-h1">${this.data.title}</h1>
                    
                    <div class="glass-visualizer" id="visualizer">
                        <div class="bar"></div><div class="bar"></div><div class="bar"></div>
                        <div class="bar"></div><div class="bar"></div><div class="bar"></div>
                        <div class="bar"></div><div class="bar"></div><div class="bar"></div>
                    </div>
                </div>
            </div>

            <div class="glass-controls-area">
                <div class="g-progress-row">
                    <span id="t-current">0:00</span>
                    <div class="g-track">
                        <div class="g-fill" id="p-fill"></div>
                        <input type="range" id="p-input" min="0" max="100" value="0" step="0.1">
                    </div>
                    <span id="t-total">${this.data.duration}</span>
                </div>

                <div class="g-buttons-row">
                    <div class="g-main-btns">
                        <button class="g-btn-sec" id="btn-rw">↺ 15s</button>
                        <button class="g-btn-prim" id="btn-pp">
                            <span class="icon-play">▶</span>
                            <span class="icon-pause" style="display:none;">⏸</span>
                        </button>
                        <button class="g-btn-sec" id="btn-fw">15s ↻</button>
                    </div>

                    <div class="g-extra-btns">
                        <button class="g-text-btn" id="btn-transcript-toggle">
                            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
                            Transcription
                        </button>
                        <div class="vol-box">
                            <span style="font-size:1.2rem">🔊</span>
                            <input type="range" id="vol-input" min="0" max="1" step="0.1" value="1">
                        </div>
                    </div>
                </div>
            </div>

            <div class="glass-transcript-drawer" id="transcript-drawer">
                <div class="g-transcript-inner">
                    ${this.transcriptHTML || "<p>Transcription indisponible.</p>"}
                </div>
            </div>

        </div>
      </div>
    `;
  }

  cacheElements() {
    return {
      wrapper: this.container.querySelector('#glass-wrapper'),
      viz: this.container.querySelector('#visualizer'),
      btnPP: this.container.querySelector('#btn-pp'),
      btnCover: this.container.querySelector('#btn-cover-play'),
      iconPlay: this.container.querySelector('.icon-play'),
      iconPause: this.container.querySelector('.icon-pause'),
      pFill: this.container.querySelector('#p-fill'),
      pInput: this.container.querySelector('#p-input'),
      tCurrent: this.container.querySelector('#t-current'),
      drawer: this.container.querySelector('#transcript-drawer'),
      btnTrans: this.container.querySelector('#btn-transcript-toggle')
    };
  }

  toggle() {
    if(this.isPlaying) {
        this.audio.pause();
        this.isPlaying = false;
        this.elements.wrapper.classList.remove('is-playing'); // Stop animation
    } else {
        this.audio.play();
        this.isPlaying = true;
        this.elements.wrapper.classList.add('is-playing'); // Start animation
    }
    this.updateUI();
  }

  updateUI() {
    if(this.isPlaying) {
        this.elements.iconPlay.style.display = 'none';
        this.elements.iconPause.style.display = 'block';
        this.elements.btnCover.style.opacity = 0;
    } else {
        this.elements.iconPlay.style.display = 'block';
        this.elements.iconPause.style.display = 'none';
        this.elements.btnCover.style.opacity = 1;
    }
  }

  seekTo(seconds) {
    this.audio.currentTime = seconds;
    if(!this.isPlaying) this.toggle();
  }

  formatTime(s) {
    if(isNaN(s)) return "0:00";
    return Math.floor(s/60) + ":" + Math.floor(s%60).toString().padStart(2,'0');
  }

  attachEvents() {
    const el = this.elements;
    el.btnPP.addEventListener('click', () => this.toggle());
    el.btnCover.addEventListener('click', () => this.toggle());
    
    this.container.querySelector('#btn-rw').addEventListener('click', () => this.audio.currentTime -= 15);
    this.container.querySelector('#btn-fw').addEventListener('click', () => this.audio.currentTime += 15);
    
    // Volume
    this.container.querySelector('#vol-input').addEventListener('input', (e) => this.audio.volume = e.target.value);

    // Transcript Toggle
    el.btnTrans.addEventListener('click', () => {
        this.transcriptOpen = !this.transcriptOpen;
        el.drawer.style.maxHeight = this.transcriptOpen ? "500px" : "0";
        el.drawer.style.opacity = this.transcriptOpen ? "1" : "0";
        el.drawer.style.marginTop = this.transcriptOpen ? "2rem" : "0";
        el.btnTrans.style.color = this.transcriptOpen ? "var(--accent-red)" : "white";
    });

    // Time Update
    this.audio.addEventListener('timeupdate', () => {
        if(!this.audio.duration) return;
        const pct = (this.audio.currentTime / this.audio.duration) * 100;
        el.pFill.style.width = pct + "%";
        el.pInput.value = pct;
        el.tCurrent.textContent = this.formatTime(this.audio.currentTime);
    });
    
    // Seek
    el.pInput.addEventListener('input', (e) => {
        this.audio.currentTime = (e.target.value / 100) * this.audio.duration;
    });
    
    // Interactivité Timestamps dans la transcription
    this.container.querySelectorAll('.time-marker').forEach(mark => {
        mark.addEventListener('click', (e) => {
            const t = parseInt(e.target.dataset.time);
            this.seekTo(t);
        });
    });
  }
}