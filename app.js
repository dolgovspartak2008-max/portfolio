(function () {
  'use strict';

  const formatPrice = (value) => `${Number(value).toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} ₽`;

  const calculateEstimate = (pricing, selectedKeys) => {
    const selectedSet = new Set(selectedKeys);
    const selected = pricing.extras.filter((item) => selectedSet.has(item.key));
    return {
      total: pricing.base.price + selected.reduce((sum, item) => sum + item.price, 0),
      isFrom: selected.some((item) => item.isFrom),
      selected,
    };
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
      ...(project.caseStudy ? { caseStudy: project.caseStudy } : {}),
      ...(project.previews ? { previews: project.previews } : {}),
    };
  });

  const buildProjectImageUrl = (imageUrl, origin = '') => {
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

  const applyPointerForce = (particle, pointer, radius = 150) => {
    if (!pointer?.active) return;
    const dx = particle.x - pointer.x;
    const dy = particle.y - pointer.y;
    const distanceSquared = (dx * dx) + (dy * dy);
    if (!distanceSquared || distanceSquared >= radius * radius) return;
    const distance = Math.sqrt(distanceSquared);
    const force = (1 - distance / radius) * .72;
    const nx = dx / distance;
    const ny = dy / distance;
    particle.vx += (nx - ny * .28) * force;
    particle.vy += (ny + nx * .28) * force;
  };

  const buildTelegramUrl = (username, pricing, selectedKeys, brief = {}) => {
    const cleanUsername = String(username || '').trim().replace(/^@/, '');
    if (!cleanUsername) return '';

    const estimate = calculateEstimate(pricing, selectedKeys);
    const rows = [
      `— ${pricing.base.title} — ${formatPrice(pricing.base.price)}`,
      ...estimate.selected.map((item) => `— ${item.title} — ${item.isFrom ? 'от ' : ''}${formatPrice(item.price)}`),
    ];
    const totalLabel = `${estimate.isFrom ? 'от ' : ''}${formatPrice(estimate.total)}`;
    const briefRows = [
      ['Тип бизнеса', brief.businessType],
      ['Контент', brief.contentStatus],
      ['Срок', brief.timeline],
    ].filter(([, value]) => value);
    const message = [
      'Здравствуйте! Хочу заказать лендинг.',
      '',
      'Выбранные услуги:',
      ...rows,
      ...(briefRows.length ? ['', 'О проекте:', ...briefRows.map(([label, value]) => `${label}: ${value}`)] : []),
      '',
      `Предварительная стоимость: ${totalLabel}`,
      '',
      'Хочу обсудить детали проекта.',
    ].join('\n');

    return `https://t.me/${cleanUsername}?text=${encodeURIComponent(message)}`;
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      applyPointerForce,
      buildProjectImageUrl,
      buildTelegramUrl,
      calculateEstimate,
      formatPrice,
      normalizeProjects,
    };
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = {
    content: null,
    selected: new Set(),
    brief: { businessType: '', contentStatus: '', timeline: '' },
    scrollContext: null,
  };

  const setText = (selector, value) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  };

  function runIntro() {
    const intro = document.getElementById('intro');
    if (!intro) return;

    let alreadyShown = false;
    try { alreadyShown = sessionStorage.getItem('spartak-intro-v2-seen') === '1'; } catch (_) { alreadyShown = false; }
    const gsap = window.gsap;
    let finished = false;
    let finishTimer = 0;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(finishTimer);
      intro.classList.add('is-done');
      document.body.classList.remove('intro-active');
      document.documentElement.classList.remove('intro-pending');
      window.clearTimeout(window.__introFallback);
      try { sessionStorage.setItem('spartak-intro-v2-seen', '1'); } catch (_) { /* Storage can be unavailable. */ }
      runNameDecode(alreadyShown || reducedMotionQuery.matches);
      revealHero(alreadyShown || reducedMotionQuery.matches);
    };
    finishTimer = window.setTimeout(finish, 3000);

    if (gsap) {
      const word = intro.querySelector('.intro__word');
      const mark = intro.querySelector('.intro__mark');
      const flash = intro.querySelector('.intro__flash');
      const line = intro.querySelector('.intro__line');
      const leftPanel = intro.querySelector('.intro__panel--left');
      const rightPanel = intro.querySelector('.intro__panel--right');
      const timeline = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });

      intro.classList.add('is-gsap');
      gsap.set(word, { autoAlpha: 0, y: 20 });
      gsap.set(mark, { rotation: -120, scale: .6 });
      gsap.set([flash, line], { autoAlpha: 0 });
      timeline
        .to(word, { autoAlpha: 1, y: 0, duration: .55 }, 0)
        .to(mark, { rotation: 360, scale: 1, duration: .82, ease: 'back.out(1.4)' }, .06)
        .to(word, { autoAlpha: 0, y: -12, duration: .22, ease: 'power2.in' }, 1.02)
        .to(flash, { autoAlpha: .72, duration: .07, yoyo: true, repeat: 1, ease: 'none' }, 1.2)
        .fromTo(line, { autoAlpha: 0, scaleY: 0, scaleX: 1 }, { autoAlpha: 1, scaleY: 1, duration: .22 }, 1.34)
        .to(line, { scaleX: Math.max(600, window.innerWidth), duration: .32, ease: 'power4.in' }, 1.56)
        .to(leftPanel, { xPercent: -101, duration: .72, ease: 'power4.inOut' }, 1.68)
        .to(rightPanel, { xPercent: 101, duration: .72, ease: 'power4.inOut' }, 1.68)
        .to(line, { autoAlpha: 0, duration: .18 }, 1.76)
        .call(finish, [], 2.42);

      window.__introTimeline = timeline;
      const seekTime = new URLSearchParams(location.search).get('t');
      if (seekTime !== null) {
        document.body.classList.add('intro-active');
        timeline.seek(Math.max(0, Number(seekTime) || 0)).pause();
      } else if (alreadyShown || reducedMotionQuery.matches) {
        timeline.progress(1).pause();
        finish();
      } else {
        document.body.classList.add('intro-active');
        timeline.play(0);
      }
      window.__ready = true;
      return;
    }

    if (alreadyShown || reducedMotionQuery.matches) {
      finish();
      window.__ready = true;
      return;
    }

    document.body.classList.add('intro-active');
    intro.classList.add('is-running');
    window.setTimeout(finish, 2700);
    window.setTimeout(() => {
      intro.classList.add('is-done');
      document.body.classList.remove('intro-active');
    }, 3300);
    window.__ready = true;
  }

  function revealHero(reduced) {
    const hero = document.querySelector('.hero');
    if (!hero || hero.dataset.revealed === 'true') return;
    hero.dataset.revealed = 'true';
    if (!window.gsap || reduced) return;
    const timeline = window.gsap.timeline({ defaults: { duration: .58, ease: 'power3.out' } });
    timeline
      .from('.eyebrow', { autoAlpha: 0, y: 18 })
      .from('.hero h1', { autoAlpha: 0, y: 28 }, '-=.34')
      .from('.hero__lead', { autoAlpha: 0, y: 22 }, '-=.36')
      .from('.hero__actions', { autoAlpha: 0, y: 18 }, '-=.38')
      .from('.hero__meta', { autoAlpha: 0, y: 14 }, '-=.4')
      .from('.hero__visual', { autoAlpha: 0, x: 36, duration: .8 }, '-=.82');
  }

  function runNameDecode(reduced) {
    const name = document.getElementById('name-decode');
    if (!name) return;
    const finalText = 'СПАРТАК';
    const glyphs = '{}[]<>/\\#*+01';

    if (reduced || reducedMotionQuery.matches) {
      name.textContent = finalText;
      name.parentElement?.classList.add('is-decoded');
      return;
    }

    const proxy = { progress: 0 };
    const update = () => {
      const progress = proxy.progress;
      const resolved = Math.floor(progress * finalText.length);
      name.textContent = Array.from(finalText, (letter, index) => (
        index < resolved ? letter : glyphs[Math.floor(Math.random() * glyphs.length)]
      )).join('');
      if (progress >= 1) {
        name.textContent = finalText;
        name.parentElement?.classList.add('is-decoded');
      }
    };
    if (window.gsap) {
      window.gsap.to(proxy, { progress: 1, duration: .78, ease: 'none', onUpdate: update, onComplete: update });
    } else {
      const startedAt = performance.now();
      const tick = (now) => {
        proxy.progress = Math.min(1, (now - startedAt) / 760);
        update();
        if (proxy.progress < 1) window.setTimeout(() => requestAnimationFrame(tick), 42);
      };
      requestAnimationFrame(tick);
    }
  }

  function renderStack(items) {
    const root = document.getElementById('stack-list');
    if (!root) return;
    root.replaceChildren(...items.map((item, index) => {
      const outcome = document.createElement('article');
      outcome.className = 'outcome-item';
      const number = document.createElement('span');
      number.className = 'outcome-item__number';
      number.setAttribute('aria-hidden', 'true');
      number.textContent = String(index + 1).padStart(2, '0');
      const title = document.createElement('h3');
      title.textContent = item.title;
      const description = document.createElement('p');
      description.textContent = item.description;
      outcome.append(number, title, description);
      return outcome;
    }));
  }

  function renderProjectShowcase(projects) {
    const root = document.getElementById('projects-root');
    if (!root) return;
    if (!projects.length) {
      root.innerHTML = '<div class="empty-state"><div class="empty-state__content"><h3>Новые проекты скоро появятся</h3><p>Можно обсудить ваш проект уже сегодня.</p><a class="button button--primary" href="#pricing">Рассчитать свой проект</a></div></div>';
      return;
    }

    let activeIndex = 0;
    let device = 'desktop';
    const showcase = document.createElement('div');
    showcase.className = 'project-showcase';

    const selector = document.createElement('div');
    selector.className = 'project-selector';
    selector.setAttribute('role', 'tablist');
    selector.setAttribute('aria-label', 'Выберите проект');

    const stage = document.createElement('div');
    stage.className = 'project-stage';
    const controls = document.createElement('div');
    controls.className = 'project-stage__controls';
    const controlLabel = document.createElement('span');
    controlLabel.textContent = 'Просмотр';
    const deviceSwitch = document.createElement('div');
    deviceSwitch.className = 'device-switch';
    deviceSwitch.setAttribute('role', 'group');
    deviceSwitch.setAttribute('aria-label', 'Размер макета');
    const desktopButton = document.createElement('button');
    desktopButton.type = 'button';
    desktopButton.textContent = 'Desktop';
    desktopButton.setAttribute('aria-label', 'Версия для компьютера');
    const mobileButton = document.createElement('button');
    mobileButton.type = 'button';
    mobileButton.textContent = 'Mobile';
    mobileButton.setAttribute('aria-label', 'Мобильная версия');
    deviceSwitch.append(desktopButton, mobileButton);
    controls.append(controlLabel, deviceSwitch);

    const preview = document.createElement('div');
    preview.className = 'project-preview';
    preview.dataset.device = device;
    const browserBar = document.createElement('div');
    browserBar.className = 'project-preview__bar';
    browserBar.innerHTML = '<span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>';
    const address = document.createElement('small');
    browserBar.append(address);
    const picture = document.createElement('picture');
    const avifSource = document.createElement('source');
    avifSource.type = 'image/avif';
    const previewImage = document.createElement('img');
    previewImage.loading = 'lazy';
    previewImage.decoding = 'async';
    previewImage.width = 1440;
    previewImage.height = 900;
    picture.append(avifSource, previewImage);
    preview.append(browserBar, picture);

    const detail = document.createElement('article');
    detail.className = 'case-detail';
    detail.id = 'case-detail';
    detail.setAttribute('role', 'tabpanel');
    detail.setAttribute('aria-live', 'polite');
    const category = document.createElement('p');
    category.className = 'case-detail__category';
    const title = document.createElement('h3');
    const facts = document.createElement('dl');
    const liveLink = document.createElement('a');
    liveLink.className = 'button button--secondary';
    liveLink.target = '_blank';
    liveLink.rel = 'noopener noreferrer';
    liveLink.textContent = 'Открыть живой сайт';
    detail.append(category, title, facts, liveLink);
    stage.append(controls, preview, detail);

    const projectButtons = projects.map((project, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'project-tab';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', detail.id);
      const number = document.createElement('span');
      number.textContent = String(index + 1).padStart(2, '0');
      number.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = project.title;
      const type = document.createElement('small');
      type.textContent = project.category;
      copy.append(name, type);
      button.append(number, copy);
      button.addEventListener('click', () => selectProject(index));
      selector.append(button);
      return button;
    });

    const updatePreview = (project) => {
      const files = project.previews?.[device] || {};
      if (files.avif) avifSource.srcset = files.avif;
      else avifSource.removeAttribute('srcset');
      previewImage.src = files.webp || buildProjectImageUrl(project.imageUrl, location.origin);
      previewImage.alt = `Первый экран сайта «${project.title}» — ${device === 'desktop' ? 'версия для компьютера' : 'мобильная версия'}`;
      previewImage.width = device === 'desktop' ? 1440 : 390;
      previewImage.height = device === 'desktop' ? 900 : 844;
      preview.dataset.device = device;
      address.textContent = (() => {
        try { return new URL(project.liveUrl).hostname; } catch (_) { return project.title; }
      })();
    };

    const selectDevice = (nextDevice) => {
      device = nextDevice;
      desktopButton.setAttribute('aria-pressed', String(device === 'desktop'));
      mobileButton.setAttribute('aria-pressed', String(device === 'mobile'));
      updatePreview(projects[activeIndex]);
    };

    function selectProject(index) {
      activeIndex = index;
      const project = projects[index];
      projectButtons.forEach((button, buttonIndex) => {
        const selected = buttonIndex === index;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
      category.textContent = project.category;
      title.textContent = project.title;
      const rows = [
        ['Задача', project.caseStudy?.challenge],
        ['Решение', project.caseStudy?.approach],
        ['Результат', project.caseStudy?.outcome],
      ];
      facts.replaceChildren(...rows.flatMap(([label, value]) => {
        const term = document.createElement('dt');
        term.textContent = label;
        const description = document.createElement('dd');
        description.textContent = value || 'Подробности проекта доступны на живом сайте.';
        return [term, description];
      }));
      let safeUrl = '';
      try {
        const parsed = new URL(project.liveUrl);
        if (['http:', 'https:'].includes(parsed.protocol)) safeUrl = parsed.href;
      } catch (_) { safeUrl = ''; }
      liveLink.href = safeUrl || '#contacts';
      liveLink.target = safeUrl ? '_blank' : '_self';
      updatePreview(project);
    }

    desktopButton.addEventListener('click', () => selectDevice('desktop'));
    mobileButton.addEventListener('click', () => selectDevice('mobile'));
    selector.addEventListener('keydown', (event) => {
      const current = projectButtons.indexOf(document.activeElement);
      if (current < 0) return;
      const moves = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(event.key in moves) && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? projectButtons.length - 1
          : (current + moves[event.key] + projectButtons.length) % projectButtons.length;
      selectProject(next);
      projectButtons[next].focus();
    });

    showcase.append(selector, stage);
    root.replaceChildren(showcase);
    selectDevice('desktop');
    selectProject(0);
  }

  function renderProjects(projects) {
    const root = document.getElementById('projects-root');
    if (!root) return;
    if (state.radialCleanup) {
      state.radialCleanup();
      state.radialCleanup = null;
    }

    if (!projects.length) {
      root.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__content">
            <span class="empty-state__index" aria-hidden="true">00</span>
            <h3>Новые проекты скоро появятся</h3>
            <p>Сейчас портфолио обновляется. Можно обсудить ваш проект уже сегодня.</p>
            <a class="button button--primary" href="#pricing">Рассчитать свой проект</a>
          </div>
        </div>`;
      return;
    }

    const stage = document.createElement('div');
    stage.className = 'radial-stage';
    const viewport = document.createElement('div');
    viewport.className = 'radial-viewport';
    const wheel = document.createElement('ul');
    wheel.className = 'radial-wheel';

    projects.forEach((project, index) => {
      let safeUrl = '';
      try {
        const parsed = new URL(project.liveUrl);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') safeUrl = parsed.href;
      } catch (_) { safeUrl = ''; }

      const item = document.createElement('li');
      item.className = 'radial-wheel__item';
      item.dataset.index = String(index);
      const angle = (index * 360) / projects.length;
      item.style.setProperty('--orbit-angle', `${angle}deg`);
      item.style.setProperty('--orbit-card-angle', `${-angle}deg`);
      const card = document.createElement(safeUrl ? 'a' : 'article');
      card.className = 'project-card';
      if (safeUrl) {
        card.href = safeUrl;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
      }
      const visual = document.createElement('div');
      visual.className = 'project-card__visual';
      visual.setAttribute('aria-hidden', 'true');
      const imageUrl = buildProjectImageUrl(project.imageUrl, location.origin);
      if (imageUrl) {
        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = '';
        image.loading = 'eager';
        image.decoding = 'async';
        image.fetchPriority = index === 0 ? 'high' : 'auto';
        image.addEventListener('error', () => image.remove(), { once: true });
        visual.append(image);
      }
      const category = document.createElement('small');
      category.textContent = project.category;
      const title = document.createElement('h3');
      title.setAttribute('aria-label', project.title);
      let glyphIndex = 0;
      String(project.title || '').split(/(\s+)/).forEach((part) => {
        if (!part.trim()) return;
        const word = document.createElement('span');
        word.className = 'project-card__word';
        word.setAttribute('aria-hidden', 'true');
        Array.from(part).forEach((character) => {
          const glyph = document.createElement('span');
          glyph.className = 'project-card__glyph';
          glyph.style.setProperty('--glyph-index', String(glyphIndex));
          glyphIndex += 1;
          ['base', 'top', 'middle', 'bottom'].forEach((layer) => {
            const slice = document.createElement('span');
            slice.className = `project-card__glyph-${layer}`;
            if (layer === 'base') slice.textContent = character;
            else {
              slice.dataset.character = character;
              slice.setAttribute('aria-hidden', 'true');
            }
            glyph.append(slice);
          });
          word.append(glyph);
        });
        title.append(word);
      });
      const info = document.createElement('div');
      info.className = 'project-card__info';
      info.append(category, title);
      card.append(visual, info);
      item.append(card);
      wheel.append(item);
    });
    viewport.append(wheel);
    stage.append(viewport);
    root.replaceChildren(stage);
    requestAnimationFrame(() => setupRadialGallery(stage, wheel));
  }

  function setupRadialGallery(stage, wheel) {
    const items = Array.from(wheel.querySelectorAll('.radial-wheel__item'));
    const cards = items.map((item) => item.querySelector('.project-card'));
    let activeIndex = 0;
    let mode = '';
    let context = null;
    let revealObserver = null;
    let resizeFrame = 0;
    let disposed = false;
    const shutterTokens = new WeakMap();
    const scheduleShutterCleanup = (card) => {
      const token = (shutterTokens.get(card) || 0) + 1;
      shutterTokens.set(card, token);
      requestAnimationFrame(() => {
        const animations = card.getAnimations({ subtree: true });
        if (!animations.length) return;
        Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
          if (shutterTokens.get(card) === token) card.classList.remove('is-shutter-active');
        });
      });
    };
    const activateCard = (index, replay = false, exclusive = true, reveal = true) => {
      activeIndex = index;
      cards.forEach((card, cardIndex) => {
        const item = items[cardIndex];
        const isActive = cardIndex === index;
        item?.classList.toggle('is-active', isActive);
        if (item && exclusive) {
          item.inert = !isActive;
          if (isActive) item.removeAttribute('aria-hidden');
          else item.setAttribute('aria-hidden', 'true');
          if (card.matches('a')) card.tabIndex = isActive ? 0 : -1;
        } else if (item) {
          item.inert = false;
          item.removeAttribute('aria-hidden');
          if (card.matches('a')) card.removeAttribute('tabindex');
        }
        if (cardIndex !== index) card.classList.remove('is-shutter-active');
      });
      const activeCard = cards[index];
      if (!activeCard) return;
      if (!reveal) {
        activeCard.classList.remove('is-shutter-active');
        return;
      }
      if (replay && activeCard.classList.contains('is-shutter-active')) {
        activeCard.classList.remove('is-shutter-active');
        requestAnimationFrame(() => {
          activeCard.classList.add('is-shutter-active');
          scheduleShutterCleanup(activeCard);
        });
      } else {
        activeCard.classList.add('is-shutter-active');
        scheduleShutterCleanup(activeCard);
      }
    };
    const stopAnimation = () => {
      revealObserver?.disconnect();
      revealObserver = null;
      context?.revert();
      context = null;
      stage.classList.remove('is-animating');
    };
    const startAnimation = () => {
      activateCard(0, false, true, false);
      revealObserver = new IntersectionObserver(([entry], observer) => {
        if (!entry.isIntersecting) return;
        activateCard(activeIndex, true);
        observer.disconnect();
      }, { threshold: .2 });
      revealObserver.observe(stage);
      window.gsap.registerPlugin(window.ScrollTrigger);
      const step = 360 / items.length;
      context = window.gsap.context(() => {
        const updateGallery = (progress) => {
          items.forEach((item, index) => {
            const angle = ((((index * step) - (progress * 360)) + 180) % 360 + 360) % 360 - 180;
            const distance = Math.abs(angle);
            const opacity = distance <= step * .45
              ? 1
              : Math.max(0, 1 - ((distance - step * .45) / (step * .8)));
            window.gsap.set(item, { opacity });
          });
          const index = Math.round(progress * items.length) % items.length;
          if (index !== activeIndex) activateCard(index);
        };
        items.forEach((item, index) => {
          const angle = index * step;
            window.gsap.set(item, { rotation: angle });
            window.gsap.set(cards[index], { rotation: -angle });
        });
        updateGallery(0);
        const timeline = window.gsap.timeline({
          scrollTrigger: {
            trigger: stage,
            pin: true,
            start: 'top top',
            end: () => `+=${Math.max(1500, items.length * Math.min(window.innerHeight * .72, 620))}`,
            scrub: .65,
            anticipatePin: 1,
              invalidateOnRefresh: true,
              onEnter: () => activateCard(activeIndex, true),
              onEnterBack: () => activateCard(activeIndex, true),
              onToggle: (self) => stage.classList.toggle('is-animating', self.isActive),
            },
          onUpdate() {
            updateGallery(this.progress());
          },
        });
        timeline
          .to(items, { rotation: (index) => (index * step) - 360, duration: 1, ease: 'none' }, 0)
          .to(cards, { rotation: (index) => -(index * step) + 360, duration: 1, ease: 'none' }, 0);
      }, stage);
      window.ScrollTrigger.refresh();
    };
    const syncMode = () => {
      if (disposed) return;
      const staticGallery = reducedMotionQuery.matches
        || (window.innerHeight < 600 && window.innerWidth > window.innerHeight)
        || !window.gsap
        || !window.ScrollTrigger;
      const nextMode = staticGallery ? 'static' : 'animated';
      if (mode === nextMode) {
        if (!staticGallery) window.ScrollTrigger?.refresh();
        return;
      }
      stopAnimation();
      mode = nextMode;
      stage.classList.toggle('is-static', staticGallery);
      if (staticGallery) activateCard(0, false, false, false);
      else startAnimation();
    };
    const scheduleSync = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(syncMode);
    };
    window.addEventListener('resize', scheduleSync, { passive: true });
    reducedMotionQuery.addEventListener('change', scheduleSync);
    state.radialCleanup = () => {
      disposed = true;
      cancelAnimationFrame(resizeFrame);
      window.removeEventListener('resize', scheduleSync);
      reducedMotionQuery.removeEventListener('change', scheduleSync);
      stopAnimation();
      stage.classList.remove('is-static');
    };
    syncMode();
  }

  function setupScrollReveals() {
    if (!window.gsap || !window.ScrollTrigger || reducedMotionQuery.matches) return;
    if (state.scrollContext) state.scrollContext.revert();
    state.scrollContext = window.gsap.context(() => {
      window.ScrollTrigger.batch('.proof-strip, .section-heading, .stack-grid, .project-showcase, .process-list, .pricing-layout, .final-cta', {
        start: 'top 86%',
        once: true,
        onEnter: (elements) => window.gsap.fromTo(elements,
          { autoAlpha: 0, y: 34 },
          { autoAlpha: 1, y: 0, duration: .72, stagger: .09, ease: 'power3.out', clearProps: 'transform' }),
      });
    }, document.body);
    window.ScrollTrigger.refresh();
  }

  function renderPricing(content) {
    const { pricing, owner } = content;
    setText('#base-price', formatPrice(pricing.base.price));
    setText('#calculator-base-price', formatPrice(pricing.base.price));

    const includedRoot = document.getElementById('included-list');
    if (includedRoot) {
      includedRoot.replaceChildren(...pricing.base.included.map((text) => {
        const item = document.createElement('li');
        item.textContent = text;
        return item;
      }));
    }

    const servicesRoot = document.getElementById('services-list');
    if (servicesRoot) {
      servicesRoot.replaceChildren(...pricing.extras.map((service) => {
        const label = document.createElement('label');
        label.className = 'service-option';
        label.innerHTML = `
          <input type="checkbox" name="service" value="${service.key}" />
          <span class="service-option__check" aria-hidden="true">✓</span>
          <span class="service-option__copy"><strong></strong><small></small></span>
          <span class="service-option__price"></span>`;
        label.querySelector('strong').textContent = service.title;
        label.querySelector('small').textContent = service.description;
        label.querySelector('.service-option__price').textContent = `${service.isFrom ? 'от ' : ''}${formatPrice(service.price)}`;
        label.querySelector('input').addEventListener('change', (event) => {
          if (event.currentTarget.checked) state.selected.add(service.key);
          else state.selected.delete(service.key);
          updateEstimate(owner, pricing);
        });
        return label;
      }));
    }

    ['businessType', 'contentStatus', 'timeline'].forEach((name) => {
      const field = document.querySelector(`[name="${name}"]`);
      if (!field) return;
      field.addEventListener('change', (event) => {
        state.brief[name] = event.currentTarget.value;
        updateEstimate(owner, pricing);
      });
    });

    updateEstimate(owner, pricing);
  }

  function updateEstimate(owner, pricing) {
    const selectedKeys = Array.from(state.selected);
    const estimate = calculateEstimate(pricing, selectedKeys);
    const lines = document.getElementById('estimate-lines');
    if (lines) {
      const items = [pricing.base, ...estimate.selected];
      lines.replaceChildren(...items.map((item) => {
        const row = document.createElement('div');
        row.className = 'estimate__line';
        const title = document.createElement('span');
        title.textContent = item.title;
        const price = document.createElement('span');
        price.textContent = `${item.isFrom ? 'от ' : ''}${formatPrice(item.price)}`;
        row.append(title, price);
        return row;
      }));
    }
    setText('#estimate-total', `${estimate.isFrom ? 'от ' : ''}${formatPrice(estimate.total)}`);

    const url = buildTelegramUrl(owner.telegramUsername, pricing, selectedKeys, state.brief);
    ['telegram-order', 'mobile-telegram-order'].forEach((id) => {
      const orderLink = document.getElementById(id);
      if (orderLink && url) orderLink.href = url;
    });
    setText('#mobile-estimate-total', `${estimate.isFrom ? 'от ' : ''}${formatPrice(estimate.total)}`);
  }

  function setupNavigation() {
    const header = document.getElementById('site-header');
    const menu = document.querySelector('.menu-button');
    const nav = document.getElementById('site-nav');
    const links = Array.from(document.querySelectorAll('.site-nav a'));
    const mobileNavigationQuery = window.matchMedia('(max-width: 760px)');

    const syncHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 18);
    syncHeader();
    window.addEventListener('scroll', syncHeader, { passive: true });

    const setMenuOpen = (open) => {
      const expanded = mobileNavigationQuery.matches && open;
      menu?.setAttribute('aria-expanded', String(expanded));
      menu?.setAttribute('aria-label', expanded ? 'Закрыть меню' : 'Открыть меню');
      nav?.classList.toggle('is-open', expanded);
      if (nav) nav.inert = mobileNavigationQuery.matches && !expanded;
    };
    setMenuOpen(false);
    menu?.addEventListener('click', () => setMenuOpen(menu.getAttribute('aria-expanded') !== 'true'));
    links.forEach((link) => link.addEventListener('click', () => setMenuOpen(false)));
    mobileNavigationQuery.addEventListener('change', () => setMenuOpen(false));
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || menu?.getAttribute('aria-expanded') !== 'true') return;
      setMenuOpen(false);
      menu.focus();
    });

    const sections = links.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      links.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === `#${visible.target.id}`));
    }, { rootMargin: '-25% 0px -60%', threshold: [0, .2, .5] });
    sections.forEach((section) => observer.observe(section));
  }

  function setupFlowField() {
    const canvas = document.getElementById('flow-canvas');
    const region = document.getElementById('post-hero');
    if (!canvas || !region) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let width = 0;
    let height = 0;
    let particles = [];
    let frameId = 0;
    let active = false;
    let reduced = reducedMotionQuery.matches;
    const finePointerQuery = window.matchMedia('(pointer: fine)');
    const pointer = { x: 0, y: 0, active: false };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = reduced ? 70 : (width < 768 ? 150 : 440);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: 0,
        vy: 0,
        age: Math.random() * 240,
        life: 180 + Math.random() * 180,
      }));
      context.fillStyle = '#030712';
      context.fillRect(0, 0, width, height);
      if (reduced) draw(true);
    };

    const draw = (staticFrame) => {
      context.globalAlpha = 1;
      context.fillStyle = staticFrame ? 'rgba(3, 7, 18, 1)' : 'rgba(3, 7, 18, .11)';
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#38bdf8';

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        if (!staticFrame) {
          const angle = (Math.cos(particle.x * .0048) + Math.sin(particle.y * .0048)) * Math.PI;
          particle.vx = (particle.vx + Math.cos(angle) * .085) * .955;
          particle.vy = (particle.vy + Math.sin(angle) * .085) * .955;
          if (finePointerQuery.matches) applyPointerForce(particle, pointer);
          particle.x += particle.vx;
          particle.y += particle.vy;
          particle.age += 1;
          if (particle.x < 0) particle.x = width;
          else if (particle.x > width) particle.x = 0;
          if (particle.y < 0) particle.y = height;
          else if (particle.y > height) particle.y = 0;
          if (particle.age > particle.life) {
            particle.x = Math.random() * width;
            particle.y = Math.random() * height;
            particle.vx = 0;
            particle.vy = 0;
            particle.age = 0;
          }
        }
        context.globalAlpha = staticFrame ? .18 : Math.max(0, 1 - Math.abs(particle.age / particle.life - .5) * 2) * .7;
        context.fillRect(particle.x, particle.y, 1.4, 1.4);
      }
      context.globalAlpha = 1;
    };

    const animate = () => {
      if (!active || reduced || document.hidden) return;
      draw(false);
      frameId = requestAnimationFrame(animate);
    };

    const restart = () => {
      cancelAnimationFrame(frameId);
      if (active && !reduced && !document.hidden) frameId = requestAnimationFrame(animate);
    };

    new IntersectionObserver(([entry]) => {
      active = entry.isIntersecting;
      restart();
    }, { rootMargin: '150px' }).observe(region);

    document.addEventListener('visibilitychange', restart);
    region.addEventListener('pointermove', (event) => {
      if (reduced || !finePointerQuery.matches) return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    }, { passive: true });
    region.addEventListener('pointerleave', () => { pointer.active = false; }, { passive: true });
    finePointerQuery.addEventListener('change', (event) => { if (!event.matches) pointer.active = false; });
    reducedMotionQuery.addEventListener('change', (event) => {
      reduced = event.matches;
      if (reduced) pointer.active = false;
      resize();
      restart();
    });
    let resizeFrame = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(resize);
    }, { passive: true });
    resize();
  }

  async function loadContent() {
    try {
      const response = await fetch('./content/site.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Content request failed: ${response.status}`);
      const content = await response.json();
      let projects = content.projects;
      try {
        const projectsResponse = await fetch('/api/projects', { cache: 'no-store' });
        if (!projectsResponse.ok) throw new Error(`Projects request failed: ${projectsResponse.status}`);
        const apiProjects = await projectsResponse.json();
        if (Array.isArray(apiProjects) && apiProjects.length) {
          const localProjects = new Map(content.projects.map((project) => [String(project.id), project]));
          projects = apiProjects.map((project) => ({
            ...localProjects.get(String(project.id)),
            ...project,
          }));
        }
      } catch (_) { /* Local preview and API failures use the JSON fallback. */ }
      state.content = content;
      renderStack(content.outcomes || content.stack);
      renderProjects(normalizeProjects(projects).filter((project) => project.published !== false));
      renderPricing(content);
      setupScrollReveals();
    } catch (_) {
      const stack = document.getElementById('stack-list');
      const projects = document.getElementById('projects-root');
      if (stack) stack.innerHTML = '<p class="package-note">Не удалось загрузить список технологий.</p>';
      if (projects) projects.innerHTML = '<div class="empty-state"><div class="empty-state__content"><h3>Контент временно недоступен</h3><p>Напишите Спартаку в Telegram — связь работает.</p></div></div>';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (window.gsap && window.ScrollTrigger) window.gsap.registerPlugin(window.ScrollTrigger);
    setText('#year', new Date().getFullYear());
    runIntro();
    setupNavigation();
    setupFlowField();
    loadContent();
  });
}());
