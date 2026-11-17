(function () {
  'use strict';

  const formatPrice = (value) => `${Number(value).toLocaleString('ru-RU').replace(/\s/g, ' ')} ₽`;

  const formatPriceLabel = (item) => {
    if (!item || item.price === null || item.price === undefined || item.price === '') return 'по запросу';
    return `${item.isFrom ? 'от ' : ''}${formatPrice(item.price)}`;
  };

  const legacyProjectImages = new Map([
    ['4', './assets/projects/pulse.jpg'],
    ['5', './assets/projects/blue-sea.jpg'],
    ['6', './assets/projects/bravo.jpg'],
    ['7', './assets/projects/steak-house.jpg'],
    ['8', './assets/projects/precision-auto.jpg'],
  ]);

  const normalizeProjects = (projects) => (Array.isArray(projects) ? projects : []).map((project) => {
    const sourceImage = project.imageUrl ?? project.image_url ?? '';
    const usesLegacyHost = /^(?:https?:)?\/\/[^/]*(?:iimage|iimg)\.su\//i.test(sourceImage);
    const localImage = !sourceImage || usesLegacyHost
      ? legacyProjectImages.get(String(project.id))
      : '';
    return {
      id: project.id,
      title: project.title,
      category: project.category,
      liveUrl: project.liveUrl ?? project.live_url ?? '',
      imageUrl: localImage || sourceImage,
      sortOrder: project.sortOrder ?? project.sort_order ?? 0,
      published: project.published,
      ...(project.previews ? { previews: project.previews } : {}),
      ...(project.type ? { type: project.type } : {}),
      ...(project.description ? { description: project.description } : {}),
      ...(project.details ? { details: project.details } : {}),
    };
  });

  const buildProjectImageUrl = (imageUrl, origin = '') => {
    if (!imageUrl) return '';
    try {
      const parsed = new URL(imageUrl, origin || undefined);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
      if (parsed.hostname === 'iimage.su' || parsed.hostname.endsWith('.iimage.su')) {
        return `/api/project-image?url=${encodeURIComponent(parsed.href)}`;
      }
      return parsed.href;
    } catch (_) {
      return '';
    }
  };

  const safeUrl = (value) => {
    try {
      const parsed = new URL(value);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch (_) { return ''; }
  };

  const projectsWord = (count) => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return 'проект';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'проекта';
    return 'проектов';
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildProjectImageUrl, formatPrice, formatPriceLabel, normalizeProjects, projectsWord };
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------- Маршрут ---------- */

  const STAGES = [
    { hash: 'start', label: 'Старт' },
    { hash: 'about', label: '01 · Обо мне' },
    { hash: 'works', label: '02 · Мои работы' },
    { hash: 'price', label: '03 · Прайс' },
    { hash: 'contacts', label: '04 · Контакты' },
  ];
  const LAST = STAGES.length - 1;
  const INTRO_MARKS = [0.8, 2.2, 3.6, 5.0];
  const PLATE_AR = 1672 / 941;
  const WORKS_PREVIEW = 6;
  const SEEN_KEY = 'spartak-drive-seen';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const root = document.documentElement;
  const app = $('#app');
  const scene = $('#scene');
  const video = $('#intro-video');
  const plates = $$('.plate', scene);
  const panels = $$('.panel', app);
  const bloom = $('#bloom');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  const isMobile = () => mobileQuery.matches;
  const lowPower = () => reducedMotion.matches || Boolean(navigator.connection && navigator.connection.saveData);

  const state = {
    stage: 0,
    busy: false,
    queued: null,
    introPlaying: false,
    introDone: false,
    visited: new Set(),
    lockUntil: 0,
    projects: [],
    showAllWorks: false,
    projectIndex: -1,
    lastFocus: null,
  };

  const readSeen = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch (_) { return false; } };
  const writeSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch (_) { /* приватный режим */ } };

  /* ---------- Сцена: раскладка «слоёв» как object-fit: cover с точкой фокуса ---------- */

  function layoutPlates() {
    const rect = scene.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;
    plates.forEach((plate) => {
      const ar = Number(plate.dataset.ar) || PLATE_AR;
      const mobile = isMobile();
      const w = Math.max(cw, (mobile ? ch * 0.6 : ch) * ar);
      const h = w / ar;
      const fx = Number(mobile ? plate.dataset.mfx : plate.dataset.fx) || 0.5;
      const left = Math.min(0, Math.max(cw - w, cw / 2 - fx * w));
      const top = mobile
        ? Math.min(0, ch * 0.3 - (Number(plate.dataset.my) || 0.6) * h)
        : Math.min(0, Math.max(ch - h, ch / 2 - 0.5 * h));
      Object.assign(plate.style, { width: `${w}px`, height: `${h}px`, left: `${left}px`, top: `${top}px` });
      plate.style.setProperty('--gx', `${Number(plate.dataset.gx) * 100}%`);
      plate.style.setProperty('--gy', `${Number(plate.dataset.gy) * 100}%`);
      const img = $('img:not(.plate__fallback)', plate);
      if (img) img.sizes = `${Math.round(w)}px`;
    });
    drawFrame();
  }

  function gatePoint(plate) {
    const box = plate.getBoundingClientRect();
    const host = scene.getBoundingClientRect();
    return {
      x: box.left - host.left + box.width * Number(plate.dataset.gx),
      y: box.top - host.top + box.height * Number(plate.dataset.gy),
    };
  }

  const plateLoads = new Map();
  function ensurePlate(index) {
    const plate = plates[index];
    if (!plate || !plate.dataset.src) return Promise.resolve();
    if (plateLoads.has(index)) return plateLoads.get(index);
    const name = plate.dataset.src;
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.srcset = `assets/drive/${name}-mobile.webp 1000w, assets/drive/${name}.webp 1672w`;
    img.sizes = plate.style.width || '100vw';
    img.src = `assets/drive/${name}.webp`;
    plate.prepend(img);
    const ready = (img.decode ? img.decode() : new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    })).catch(() => plate.classList.add('is-broken'));
    plateLoads.set(index, ready);
    return ready;
  }

  const withTimeout = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);

  function drawFrame() {
    const svg = $('.hud-frame');
    const path = $('#hud-frame-path');
    if (!svg || !path) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const a = W > 1100 ? 18 : 12;
    const lw = Math.min(330, W * 0.28);
    const ly = a + 58;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    path.setAttribute('d', [
      `M ${a + 20} ${a} L ${a} ${a + 20} L ${a} ${H - a - 12} L ${a + 12} ${H - a}`,
      `L ${W - a - 26} ${H - a} L ${W - a} ${H - a - 26} L ${W - a} ${a}`,
      `L ${lw + ly - a} ${a} L ${lw} ${ly} L ${a + 14} ${ly}`,
    ].join(' '));
  }

  /* ---------- Навигация и HUD ---------- */

  function updateHud(target) {
    const stage = target ?? state.stage;
    app.dataset.stage = String(stage);
    $$('#route-nav button, #route-list button').forEach((button) => {
      const index = Number(button.dataset.go);
      button.classList.toggle('is-active', index === stage);
      button.classList.toggle('is-visited', state.visited.has(index));
      if (index === stage) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    $('#prev-stage').disabled = stage === 0;
    $('#next-stage').disabled = stage === LAST;
    $('#progress-label').textContent = STAGES[stage].label;
    $('#route-restart').hidden = !(state.visited.has(LAST) && stage !== 0);
    $('#scroll-hint').hidden = stage === LAST || state.introPlaying;
    root.classList.toggle('route-done', state.visited.has(LAST));
  }

  function setProgress(value, duration) {
    const pct = `${(value / LAST) * 100}%`;
    const fill = $('#progress-fill');
    const car = $('#progress-car');
    if (window.gsap && duration) {
      gsap.to(fill, { width: pct, duration, ease: 'power2.inOut', overwrite: true });
      gsap.to(car, { left: pct, duration, ease: 'power2.inOut', overwrite: true });
    } else {
      fill.style.width = pct;
      car.style.left = pct;
    }
  }

  function setPanelState(index, active) {
    const panel = panels[index];
    panel.classList.toggle('is-active', active);
    panel.toggleAttribute('inert', !active);
    panel.setAttribute('aria-hidden', String(!active));
  }

  function setPlateActive(index) {
    plates.forEach((plate, i) => {
      plate.classList.toggle('is-active', i === index);
      if (i !== index && window.gsap) gsap.set(plate, { autoAlpha: 0, scale: 1, clearProps: 'filter' });
    });
    if (window.gsap) gsap.set(plates[index], { autoAlpha: 1, scale: 1 });
  }

  function syncHash(stage) {
    const hash = stage === 0 ? '' : `#${STAGES[stage].hash}`;
    if (location.hash !== hash) history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
  }

  async function goTo(target, options = {}) {
    target = Math.max(0, Math.min(LAST, Number(target)));
    if (state.busy) { state.queued = target; return; }
    if (target === state.stage && !options.force) return;
    if (state.introPlaying) stopIntro();
    closeProject(true);

    const from = state.stage;
    const dir = target >= from ? 1 : -1;
    const outPlate = plates[from];
    const inPlate = plates[target];
    const outPanel = panels[from];
    const inPanel = panels[target];
    state.busy = true;
    state.stage = target;
    state.visited.add(target);
    if (target === 0 && !video.classList.contains('is-hidden')) {
      try { video.pause(); video.currentTime = 0; } catch (_) { /* метаданные ещё не загружены */ }
    }
    updateHud(target);
    syncHash(target);
    ensurePlate(target + 1);

    await withTimeout(ensurePlate(target), 1500);

    const fast = reducedMotion.matches || !window.gsap;
    const mobile = isMobile();
    const total = fast ? 0.35 : (options.fromIntro ? 0.8 : (mobile ? 1.05 : 1.4));
    setProgress(target, total);

    const finish = () => {
      setPlateActive(target);
      setPanelState(from, from === target);
      state.busy = false;
      state.lockUntil = performance.now() + 380;
      if (target === LAST) root.classList.add('route-done');
      if (state.queued !== null) {
        const next = state.queued;
        state.queued = null;
        if (next !== state.stage) goTo(next);
      }
    };

    if (!window.gsap) {
      setPanelState(target, true);
      finish();
      return;
    }

    if (fast) {
      setPanelState(target, true);
      gsap.set(inPlate, { autoAlpha: 0, scale: 1 });
      gsap.timeline({ onComplete: finish })
        .to(outPanel, { autoAlpha: 0, duration: 0.2 }, 0)
        .to(inPlate, { autoAlpha: 1, duration: total }, 0)
        .fromTo(inPanel, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0.05);
      return;
    }

    const origin = gatePoint(dir > 0 ? outPlate : inPlate);
    const outBox = outPlate.getBoundingClientRect();
    const inBox = inPlate.getBoundingClientRect();
    const originOut = `${origin.x - outBox.left + scene.getBoundingClientRect().left}px ${origin.y - outBox.top + scene.getBoundingClientRect().top}px`;
    const inGate = gatePoint(inPlate);
    const originIn = `${inGate.x - inBox.left + scene.getBoundingClientRect().left}px ${inGate.y - inBox.top + scene.getBoundingClientRect().top}px`;
    bloom.style.setProperty('--bx', `${origin.x}px`);
    bloom.style.setProperty('--by', `${origin.y}px`);
    bloom.classList.toggle('bloom--final', target === LAST);

    const tag = $('#gate-tag');
    $('#gate-tag-num').textContent = String(target).padStart(2, '0');
    $('#gate-tag-label').textContent = STAGES[target].label.replace(/^\d+ · /, '');
    tag.style.left = `${origin.x}px`;
    tag.style.top = `${origin.y}px`;
    const children = $$(':scope > *', inPanel);
    const shift = mobile ? { x: 0, y: 26 } : { x: 0, y: 18 };
    const tl = gsap.timeline({ onComplete: finish, defaults: { ease: 'sine.inOut' } });

    tl.to(outPanel, { autoAlpha: 0, x: -shift.x * 0.6, y: mobile ? 16 : -shift.y * 0.4, duration: 0.32, ease: 'power2.in' }, 0);
    gsap.set(outPlate, { transformOrigin: originOut });

    if (options.fromIntro) {
      gsap.set(inPlate, { autoAlpha: 0, scale: 1, transformOrigin: originIn });
      tl.to(inPlate, { autoAlpha: 1, duration: 0.25, ease: 'none' }, 0)
        .set(outPlate, { autoAlpha: 0 }, 0.3);
    } else if (dir > 0) {
      gsap.set(inPlate, { autoAlpha: 0, scale: 1.06, transformOrigin: originIn });
      tl.to(outPlate, { scale: 1.12, duration: total * 0.6, ease: 'power1.in' }, 0)
        .to(outPlate, { autoAlpha: 0, duration: total * 0.45, ease: 'sine.in' }, total * 0.08)
        .to(bloom, { opacity: 0.32, duration: total * 0.4, ease: 'sine.in' }, total * 0.1)
        .to(bloom, { opacity: 0, duration: total * 0.45, ease: 'sine.out' }, total * 0.5)
        .to(inPlate, { autoAlpha: 1, duration: total * 0.45, ease: 'sine.out' }, total * 0.42)
        .to(inPlate, { scale: 1, duration: total * 0.6, ease: 'power2.out' }, total * 0.4);
    } else {
      gsap.set(inPlate, { autoAlpha: 0, scale: 1.1, transformOrigin: originIn });
      tl.to(outPlate, { scale: 1.04, duration: total * 0.55, ease: 'sine.in' }, 0)
        .to(outPlate, { autoAlpha: 0, duration: total * 0.45, ease: 'sine.in' }, 0.04)
        .to(inPlate, { autoAlpha: 1, duration: total * 0.45, ease: 'sine.out' }, total * 0.38)
        .to(inPlate, { scale: 1, duration: total * 0.7, ease: 'power3.out' }, total * 0.32);
    }
    if (!mobile && !options.fromIntro) {
      tl.fromTo(outPlate, { filter: 'blur(0px)' }, { filter: 'blur(5px)', duration: total * 0.45, ease: 'sine.in' }, 0);
    }

    if (dir > 0 && target > 0 && !options.fromIntro) {
      tl.fromTo(tag, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: total * 0.3, ease: 'power2.out' }, 0.05)
        .to(tag, { autoAlpha: 0, y: -12, duration: total * 0.25, ease: 'power2.in' }, total * 0.5);
    }

    const panelAt = options.fromIntro ? 0.15 : total * 0.62;
    tl.call(() => setPanelState(target, true), null, panelAt)
      .fromTo(inPanel, { autoAlpha: 0, x: shift.x, y: shift.y }, { autoAlpha: 1, x: 0, y: 0, duration: 0.5, ease: 'power3.out' }, panelAt)
      .fromTo(children, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.42, stagger: 0.045, ease: 'power2.out', clearProps: 'transform,opacity,visibility' }, panelAt + 0.06);
  }

  const step = (delta) => goTo(state.stage + delta);

  /* ---------- Вступление: видео A ---------- */

  function chooseVideoSource() {
    const small = Math.min(window.screen.width, window.screen.height) <= 760;
    video.src = small ? 'assets/drive/intro-mobile.mp4' : 'assets/drive/intro.mp4';
    video.preload = lowPower() ? 'metadata' : 'auto';
  }

  function useVideoFallback() {
    video.classList.add('is-hidden');
    plates[0].classList.add('is-fallback');
    if (state.introPlaying) finishIntro();
  }

  let introFrame = 0;
  function watchIntro() {
    if (!state.introPlaying) return;
    const t = video.currentTime || 0;
    const end = video.duration || 8.33;
    setProgress(Math.min(1, t / end) * 0.98);
    $$('#route-list li').forEach((item, index) => item.classList.toggle('is-shown', t >= INTRO_MARKS[index]));
    if (t >= end - 0.06) { finishIntro(); return; }
    introFrame = requestAnimationFrame(watchIntro);
  }

  async function playIntro() {
    if (video.classList.contains('is-hidden') || reducedMotion.matches) { goTo(1); return; }
    state.introPlaying = true;
    $$('#route-list li').forEach((item) => item.classList.remove('is-shown'));
    root.classList.add('intro-playing');
    $('#skip-intro').hidden = false;
    updateHud(0);
    try {
      if (video.currentTime > 0.05) video.currentTime = 0;
      await video.play();
      introFrame = requestAnimationFrame(watchIntro);
    } catch (_) {
      stopIntro();
    }
  }

  function stopIntro() {
    state.introPlaying = false;
    cancelAnimationFrame(introFrame);
    root.classList.remove('intro-playing');
    $('#skip-intro').hidden = true;
    state.introDone = true;
    writeSeen();
    updateHud();
  }

  function finishIntro() {
    if (!state.introPlaying) return;
    const playedToEnd = (video.currentTime || 0) >= (video.duration || 8.33) - 0.3;
    stopIntro();
    goTo(1, { fromIntro: playedToEnd });
  }

  /* ---------- Ввод: колесо, клавиатура, касания ---------- */

  function canScroll(target, dy) {
    let node = target instanceof Element ? target : null;
    while (node && node !== app) {
      if (node.scrollHeight > node.clientHeight + 1) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY)) {
          if (dy > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
          if (dy < 0 && node.scrollTop > 0) return true;
        }
      }
      node = node.parentElement;
    }
    return false;
  }

  let wheelSum = 0;
  let wheelTimer = 0;
  function onWheel(event) {
    if (!$('#project-modal').hidden) return;
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    if (canScroll(event.target, event.deltaY)) return;
    event.preventDefault();
    const now = performance.now();
    if (state.busy || now < state.lockUntil) {
      state.lockUntil = Math.max(state.lockUntil, now + 140);
      wheelSum = 0;
      return;
    }
    wheelSum += event.deltaMode === 1 ? event.deltaY * 30 : event.deltaY;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelSum = 0; }, 180);
    if (Math.abs(wheelSum) < 36) return;
    const dir = Math.sign(wheelSum);
    wheelSum = 0;
    if (state.introPlaying && dir > 0) { finishIntro(); return; }
    step(dir);
  }

  function onKey(event) {
    if (!$('#project-modal').hidden) {
      if (event.key === 'Escape') closeProject();
      if (event.key === 'ArrowRight') shiftProject(1);
      if (event.key === 'ArrowLeft') shiftProject(-1);
      if (event.key === 'Tab') trapFocus(event);
      return;
    }
    const tag = event.target.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    const interactive = ['BUTTON', 'A'].includes(tag) || event.target.getAttribute('role') === 'tab';
    const forward = ['ArrowDown', 'PageDown'].includes(event.key) || (event.key === ' ' && !interactive);
    const back = ['ArrowUp', 'PageUp'].includes(event.key);
    if (!forward && !back && event.key !== 'Home' && event.key !== 'End') return;
    if (canScroll(event.target, forward ? 1 : -1) && event.target !== document.body) return;
    event.preventDefault();
    if (event.key === 'Home') goTo(0);
    else if (event.key === 'End') goTo(LAST);
    else if (state.introPlaying && forward) finishIntro();
    else step(forward ? 1 : -1);
  }

  let touch = null;
  function onTouchStart(event) {
    if (event.touches.length !== 1 || !$('#project-modal').hidden) { touch = null; return; }
    const point = event.touches[0];
    touch = {
      x: point.clientX,
      y: point.clientY,
      t: performance.now(),
      target: event.target,
      atEnd: !canScroll(event.target, 1),
      atStart: !canScroll(event.target, -1),
    };
  }

  function onTouchEnd(event) {
    if (!touch) return;
    const point = event.changedTouches[0];
    const dx = point.clientX - touch.x;
    const dy = point.clientY - touch.y;
    const quick = performance.now() - touch.t < 700;
    const start = touch;
    touch = null;
    if (!quick || state.busy) return;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (start.target.closest('.price-tabs, .route-nav')) return;
      step(dx < 0 ? 1 : -1);
      return;
    }
    if (Math.abs(dy) > 64 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      const dir = dy < 0 ? 1 : -1;
      if (start.target.closest('.panel') && !(dir > 0 ? start.atEnd : start.atStart)) return;
      if (state.introPlaying && dir > 0) { finishIntro(); return; }
      step(dir);
    }
  }

  /* ---------- Контент ---------- */

  function renderAbout(content) {
    const about = content.about || {};
    const copy = $('#about-copy');
    copy.replaceChildren(
      el('p', 'about__lead', about.lead || ''),
      ...(about.text || []).map((text) => el('p', '', text)),
    );
    if (content.owner && content.owner.photo) $('#about-photo').src = content.owner.photo;
    const list = $('#about-directions');
    const note = $('#about-direction-note');
    const directions = about.directions || [];
    list.replaceChildren(...directions.map((direction, index) => {
      const item = el('div', 'chips__item');
      item.setAttribute('role', 'listitem');
      const button = el('button', 'chip', direction.title);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(index === 0));
      button.addEventListener('click', () => {
        $$('.chip', list).forEach((chip) => chip.setAttribute('aria-pressed', String(chip === button)));
        note.textContent = direction.text;
      });
      item.append(button);
      return item;
    }));
    note.textContent = directions[0] ? directions[0].text : '';
  }

  function projectPicture(project, variant, eager) {
    const picture = el('picture');
    const previews = project.previews && project.previews.desktop;
    const img = el('img');
    img.alt = variant === 'card' ? '' : `Скриншот проекта ${project.title}`;
    img.decoding = 'async';
    img.loading = eager ? 'eager' : 'lazy';
    if (previews) {
      const avif = el('source');
      avif.type = 'image/avif';
      avif.srcset = previews.avif;
      picture.append(avif);
      img.src = previews.webp;
    } else {
      img.src = buildProjectImageUrl(project.imageUrl, location.origin);
    }
    img.addEventListener('error', () => picture.classList.add('is-broken'), { once: true });
    picture.append(img);
    return picture;
  }

  function renderWorks() {
    const grid = $('#works-grid');
    const projects = state.projects;
    const visible = state.showAllWorks ? projects : projects.slice(0, WORKS_PREVIEW);
    $('#works-count').textContent = projects.length
      ? `${projects.length} ${projectsWord(projects.length)} — нажмите, чтобы открыть`
      : 'Проекты скоро появятся';
    grid.replaceChildren(...visible.map((project, index) => {
      const item = el('div', 'works__item');
      item.setAttribute('role', 'listitem');
      item.style.setProperty('--i', String(index % WORKS_PREVIEW));
      const card = el('button', 'work-card');
      card.type = 'button';
      card.setAttribute('aria-label', `${project.title} — подробнее о проекте`);
      const meta = el('span', 'work-card__meta');
      meta.append(el('strong', '', project.title), el('small', '', [project.type, project.category].filter(Boolean).join(' · ')));
      const arrow = el('span', 'work-card__arrow');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '↗';
      card.append(projectPicture(project, 'card'), meta, arrow);
      card.addEventListener('click', () => openProject(index));
      item.append(card);
      return item;
    }));
    const more = $('#works-more');
    more.hidden = projects.length <= WORKS_PREVIEW;
    more.firstChild.textContent = state.showAllWorks ? 'Свернуть список ' : `Смотреть все проекты (${projects.length}) `;
    more.lastElementChild.textContent = state.showAllWorks ? '↑' : '→';
  }

  function renderPrice(pricing) {
    const tabs = $('#price-tabs');
    const list = $('#price-list');
    const categories = (pricing && pricing.categories) || [];
    $('#price-note').textContent = (pricing && pricing.note) || '';
    const select = (index, focus) => {
      $$('[role="tab"]', tabs).forEach((tab, i) => {
        tab.setAttribute('aria-selected', String(i === index));
        tab.tabIndex = i === index ? 0 : -1;
        if (i === index && focus) tab.focus();
      });
      const category = categories[index];
      list.setAttribute('aria-labelledby', `price-tab-${category.key}`);
      list.replaceChildren(...category.items.map((item, i) => {
        const row = el('div', 'price-row');
        row.style.setProperty('--i', String(i));
        const label = el('span', 'price-row__title', item.title);
        const value = el('span', 'price-row__value', formatPriceLabel(item));
        if (item.price === null || item.price === undefined) value.classList.add('is-muted');
        row.append(el('span', 'price-row__mark', category.mark || '/'), label, el('span', 'price-row__line'), value);
        return row;
      }));
    };
    tabs.replaceChildren(...categories.map((category, index) => {
      const tab = el('button', 'price-tab');
      tab.type = 'button';
      tab.id = `price-tab-${category.key}`;
      tab.setAttribute('role', 'tab');
      tab.append(el('span', 'price-tab__mark', category.mark || '/'), el('span', '', category.title));
      tab.addEventListener('click', () => select(index));
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowRight', 'ArrowLeft'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        select((index + (event.key === 'ArrowRight' ? 1 : -1) + categories.length) % categories.length, true);
      });
      return tab;
    }));
    if (categories.length) select(0);
  }

  const ICONS = {
    telegram: 'M21 4L3 11l6 2.5M21 4l-4 16-8-6.5M21 4L9 13.5V19l3-3.2',
    channel: 'M4 9v6h3l6 4V5L7 9H4zm13-1a5 5 0 010 8',
    phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2',
    mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
    link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  };

  function svgIcon(name) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', ICONS[name] || ICONS.link);
    svg.append(path);
    return svg;
  }

  function renderContacts(contacts) {
    if (!contacts) return;
    $('#contacts-cta').textContent = contacts.cta || '';
    $('#contacts-subtitle').textContent = contacts.subtitle || '';
    const primary = $('#contacts-primary');
    const primaryUrl = contacts.primary && safeUrl(contacts.primary.url);
    if (primaryUrl) {
      primary.href = primaryUrl;
      primary.querySelector('span').textContent = contacts.primary.label;
    }
    $('#contacts-list').replaceChildren(...(contacts.items || []).filter((item) => safeUrl(item.url)).map((item) => {
      const li = el('li');
      const link = el('a', 'contact');
      link.href = safeUrl(item.url);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const icon = el('span', 'contact__icon');
      icon.append(svgIcon(item.icon));
      const text = el('span', 'contact__text');
      text.append(el('small', '', item.label), el('span', '', item.value));
      const arrow = el('span', 'contact__arrow', '↗');
      arrow.setAttribute('aria-hidden', 'true');
      link.append(icon, text, arrow);
      li.append(link);
      return li;
    }));
  }

  /* ---------- Подробности проекта ---------- */

  function detailSection(title, body) {
    const section = el('section', 'project-section');
    section.append(el('h4', '', title), body);
    return section;
  }

  function fillProject(index) {
    const project = state.projects[index];
    if (!project) return;
    state.projectIndex = index;
    const details = project.details || {};
    $('#project-meta').textContent = [project.type, project.category].filter(Boolean).join(' · ');
    $('#project-title').textContent = project.title;
    $('#project-media').replaceChildren(projectPicture(project, 'detail', true));
    const sections = [];
    if (project.description) sections.push(el('p', 'project-lead', project.description));
    if (details.task) sections.push(detailSection('Задача', el('p', '', details.task)));
    if (Array.isArray(details.done) && details.done.length) {
      const list = el('ul', 'project-list');
      details.done.forEach((item) => list.append(el('li', '', item)));
      sections.push(detailSection('Что реализовано', list));
    }
    if (Array.isArray(details.tech) && details.tech.length) {
      const tags = el('div', 'project-tags');
      details.tech.forEach((item) => tags.append(el('span', '', item)));
      sections.push(detailSection('Технологии', tags));
    }
    if (details.result) sections.push(detailSection('Результат', el('p', '', details.result)));
    if (!sections.length) sections.push(el('p', 'project-lead is-muted', 'Подробное описание задачи и результата скоро появится. Проект можно посмотреть вживую по ссылке ниже.'));
    $('#project-details').replaceChildren(...sections);
    const link = $('#project-link');
    const live = safeUrl(project.liveUrl);
    link.hidden = !live;
    if (live) link.href = live;
    $('#project-index').textContent = `${index + 1} / ${state.projects.length}`;
  }

  function openProject(index) {
    const modal = $('#project-modal');
    state.lastFocus = document.activeElement;
    fillProject(index);
    modal.hidden = false;
    root.classList.add('modal-open');
    const card = $('.project-modal__card', modal);
    if (window.gsap && !reducedMotion.matches) {
      gsap.fromTo($('.project-modal__backdrop', modal), { opacity: 0 }, { opacity: 1, duration: 0.35 });
      gsap.fromTo(card, { opacity: 0, y: 24, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'power3.out' });
    }
    card.focus();
  }

  function closeProject(instant) {
    const modal = $('#project-modal');
    if (modal.hidden) return;
    const done = () => {
      modal.hidden = true;
      root.classList.remove('modal-open');
      if (state.lastFocus && document.contains(state.lastFocus)) state.lastFocus.focus();
    };
    if (instant === true || !window.gsap || reducedMotion.matches) { done(); return; }
    gsap.to($('.project-modal__backdrop', modal), { opacity: 0, duration: 0.25 });
    gsap.to($('.project-modal__card', modal), { opacity: 0, y: 16, duration: 0.25, ease: 'power2.in', onComplete: done });
  }

  function shiftProject(delta) {
    const count = state.projects.length;
    if (!count) return;
    const next = (state.projectIndex + delta + count) % count;
    fillProject(next);
    const card = $('.project-modal__body');
    if (window.gsap && !reducedMotion.matches) gsap.fromTo([card, '#project-media'], { opacity: 0.2 }, { opacity: 1, duration: 0.35 });
  }

  function trapFocus(event) {
    const focusable = $$('#project-modal button, #project-modal a[href]:not([hidden])').filter((node) => !node.hidden && node.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === $('.project-modal__card'))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function loadContent() {
    const response = await fetch('./content/site.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Content request failed: ${response.status}`);
    const content = await response.json();
    let projects = content.projects || [];
    try {
      const projectsResponse = await fetch('/api/projects', { cache: 'no-store' });
      if (!projectsResponse.ok) throw new Error(`Projects request failed: ${projectsResponse.status}`);
      const apiProjects = await projectsResponse.json();
      if (Array.isArray(apiProjects)) {
        const localProjects = new Map(projects.map((project) => [String(project.id), project]));
        const merged = normalizeProjects(apiProjects).map((project) => ({ ...localProjects.get(String(project.id)), ...project }));
        const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; } };
        const known = new Set(merged.flatMap((project) => [String(project.id), hostOf(project.liveUrl)]).filter(Boolean));
        const localOnly = projects.filter((project) => !known.has(String(project.id)) && !known.has(hostOf(project.liveUrl)));
        projects = [...merged, ...localOnly];
      }
    } catch (_) { /* Локальный просмотр и сбои API используют site.json. */ }

    state.projects = normalizeProjects(projects)
      .filter((project) => project.published !== false)
      .map((project) => ({ type: 'Сайт', ...project }));
    renderAbout(content);
    renderWorks();
    renderPrice(content.pricing);
    renderContacts(content.contacts);
  }

  function showContentError() {
    $('#about-copy').replaceChildren(el('p', '', 'Не удалось загрузить содержимое. Обновите страницу или напишите в Telegram: @Spartlak.'));
    $('#works-grid').replaceChildren(el('p', 'panel__error', 'Список проектов временно недоступен.'));
    $('#works-count').textContent = '';
  }

  /* ---------- Запуск ---------- */

  function bindControls() {
    document.addEventListener('click', (event) => {
      const go = event.target.closest('[data-go]');
      if (go) {
        event.preventDefault();
        const target = Number(go.dataset.go);
        if (target === 1 && state.stage === 0 && !state.introDone && !state.introPlaying && !lowPower()) playIntro();
        else goTo(target);
        return;
      }
      if (event.target.closest('[data-close-project]')) closeProject();
    });
    $('#prev-stage').addEventListener('click', () => step(-1));
    $('#next-stage').addEventListener('click', () => (state.introPlaying ? finishIntro() : step(1)));
    $('#skip-intro').addEventListener('click', finishIntro);
    $('#route-restart').addEventListener('click', () => goTo(0));
    $('#project-prev').addEventListener('click', () => shiftProject(-1));
    $('#project-next').addEventListener('click', () => shiftProject(1));
    $('#works-more').addEventListener('click', () => {
      state.showAllWorks = !state.showAllWorks;
      renderWorks();
      if (!state.showAllWorks) panels[2].scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    app.addEventListener('touchstart', onTouchStart, { passive: true });
    app.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('hashchange', () => {
      const index = STAGES.findIndex((stage) => `#${stage.hash}` === location.hash);
      if (index > 0 && index !== state.stage) goTo(index);
    });
    let resizeFrame = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(layoutPlates);
    });
    mobileQuery.addEventListener('change', layoutPlates);
    video.addEventListener('error', useVideoFallback);
    video.addEventListener('ended', finishIntro);
  }

  function runLoader(tasks) {
    const bar = $('#loader-bar');
    let done = 0;
    const tick = () => { done += 1; bar.style.width = `${(done / tasks.length) * 100}%`; };
    const all = Promise.all(tasks.map((task) => Promise.resolve(task).catch(() => null).then(tick)));
    const minimum = new Promise((resolve) => setTimeout(resolve, 650));
    return Promise.all([withTimeout(all, 4500), minimum]);
  }

  function videoReady() {
    if (lowPower()) return Promise.resolve();
    return new Promise((resolve) => {
      if (video.readyState >= 3) { resolve(); return; }
      video.addEventListener('canplaythrough', resolve, { once: true });
      video.addEventListener('error', resolve, { once: true });
    });
  }

  async function init() {
    panels.forEach((_, index) => setPanelState(index, index === 0));
    plates[0].classList.add('is-active');
    layoutPlates();
    bindControls();
    chooseVideoSource();

    const startIndex = Math.max(0, STAGES.findIndex((stage) => `#${stage.hash}` === location.hash));
    const content = loadContent().catch(showContentError);
    const poster = new Image();
    poster.src = 'assets/drive/intro-poster.webp';
    const tasks = [
      content,
      document.fonts ? document.fonts.ready : null,
      poster.decode ? poster.decode() : null,
      ensurePlate(startIndex || 1),
    ];
    if (!startIndex) tasks.push(videoReady());
    await runLoader(tasks);

    if (startIndex > 0) {
      state.introDone = true;
      state.stage = startIndex;
      state.visited.add(startIndex);
      setPanelState(0, false);
      setPanelState(startIndex, true);
      setProgress(startIndex);
    } else {
      setProgress(0);
    }
    updateHud();
    setPlateActive(state.stage);

    root.classList.remove('is-loading');
    root.classList.add('is-ready');
    $('#loader').setAttribute('aria-hidden', 'true');
    ensurePlate(state.stage + 1);

    const autoplay = !startIndex && !readSeen() && !lowPower() && !video.classList.contains('is-hidden');
    if (autoplay) setTimeout(() => { if (state.stage === 0 && !state.busy) playIntro(); }, 900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
