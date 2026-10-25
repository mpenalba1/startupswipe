// StartupSwipe site: small progressive enhancements. Everything works without this file.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const L = document.documentElement.lang === 'es'
    ? { pause: 'Pausa', play: 'Reproducir', of: 'de' }
    : { pause: 'Pause', play: 'Play', of: 'of' };

  // Remember the language the person picked, so the home page doesn't send them back.
  for (const a of document.querySelectorAll('a[hreflang]')) {
    a.addEventListener('click', () => { try { localStorage.setItem('ss-lang', a.getAttribute('hreflang')); } catch (e) { /* private mode */ } });
  }

  // ------------------------------------------------------------ the reel
  const video = document.querySelector('.reel-video');
  if (video) {
    if (matchMedia('(min-width: 700px)').matches && video.dataset.wide) {
      video.querySelector('source').src = video.dataset.wide;
      video.poster = video.dataset.widePoster;
      video.width = 1920; video.height = 1080;
      video.load();
    }
    if (!reduce && 'IntersectionObserver' in window) {
      video.controls = false;
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn reel-toggle'; btn.textContent = L.pause;
      video.parentElement.append(btn);
      let wanted = true;
      const sync = () => { btn.textContent = video.paused ? L.play : L.pause; };
      video.addEventListener('play', sync); video.addEventListener('pause', sync);
      btn.addEventListener('click', () => { wanted = video.paused; if (wanted) video.play(); else video.pause(); });
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting && wanted) video.play().catch(() => { video.controls = true; btn.remove(); });
        else if (!e.isIntersecting) video.pause();
      }, { threshold: 0.35 }).observe(video);
    }
  }

  // ---------------------------------------------- Augusto types his line
  const line = document.querySelector('.dlg-line p');
  if (line && !reduce && 'IntersectionObserver' in window) {
    const text = line.textContent;
    const sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = text;
    const vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true');
    for (const ch of text) { const s = document.createElement('span'); s.className = 'ch'; s.textContent = ch; vis.append(s); }
    line.replaceChildren(sr, vis);
    const chars = [...vis.children];
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      let i = 0;
      const tick = () => {
        chars[i++].classList.add('on');
        if (i < chars.length) setTimeout(tick, 32);
        else { const n = document.createElement('span'); n.className = 'dlg-next'; n.setAttribute('aria-hidden', 'true'); vis.append(n); }
      };
      setTimeout(tick, 250);
    }, { threshold: 0.7 });
    io.observe(line);
  }

  // ------------------------------------------------------------- gallery
  const rail = document.querySelector('.rail');
  if (rail) {
    const items = [...rail.querySelectorAll('.rail-item')];
    const now = document.querySelector('.rail-now');
    let current = 0;
    const mark = () => {
      const mid = rail.scrollLeft + rail.clientWidth / 2;
      let best = 0, dist = Infinity;
      items.forEach((it, i) => { const d = Math.abs(it.offsetLeft + it.offsetWidth / 2 - mid); if (d < dist) { dist = d; best = i; } });
      current = best;
      items.forEach((it, i) => it.classList.toggle('is-now', i === best));
      if (now) now.textContent = String(best + 1);
    };
    const go = (i) => {
      const it = items[(i + items.length) % items.length];
      rail.scrollTo({ left: it.offsetLeft + it.offsetWidth / 2 - rail.clientWidth / 2, behavior: reduce ? 'auto' : 'smooth' });
    };
    let raf = 0;
    rail.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(mark); }, { passive: true });
    addEventListener('resize', mark);
    document.querySelector('.rail-prev')?.addEventListener('click', () => go(current - 1));
    document.querySelector('.rail-next')?.addEventListener('click', () => go(current + 1));
    rail.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(current + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1); }
    });
    rail.classList.add('is-ready');
    mark();

    // Full-size viewer.
    const dlg = document.querySelector('.viewer');
    if (dlg && typeof dlg.showModal === 'function') {
      const img = dlg.querySelector('.viewer-img');
      const count = dlg.querySelector('.viewer-count');
      let at = 0;
      const show = (i) => {
        at = (i + items.length) % items.length;
        const src = items[at].querySelector('img');
        img.src = src.currentSrc || src.src; img.alt = src.alt;
        count.textContent = `${at + 1} ${L.of} ${items.length}`;
      };
      items.forEach((it, i) => it.querySelector('button').addEventListener('click', () => {
        if (i !== current) { go(i); return; }
        show(i); dlg.showModal();
      }));
      dlg.querySelector('.viewer-prev').addEventListener('click', () => show(at - 1));
      dlg.querySelector('.viewer-next').addEventListener('click', () => show(at + 1));
      dlg.querySelector('.viewer-close').addEventListener('click', () => dlg.close());
      dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.classList.contains('viewer-in')) dlg.close(); });
      dlg.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') show(at + 1);
        if (e.key === 'ArrowLeft') show(at - 1);
      });
      dlg.addEventListener('close', () => go(at));
      let x0 = null;
      img.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
      img.addEventListener('pointerup', (e) => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) show(at + (dx < 0 ? 1 : -1)); });
    }
  }
})();
