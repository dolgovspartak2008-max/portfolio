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

  const normalizeProjects = (projects) => (Array.isArray(projects) ? projects : []).map((project) => ({
    id: project.id,
    title: project.title,
    category: project.category,
    liveUrl: project.liveUrl ?? project.live_url ?? '',
    imageUrl: project.imageUrl ?? project.image_url ?? '',
    sortOrder: project.sortOrder ?? project.sort_order ?? 0,
    published: project.published,
  }));

  const buildTelegramUrl = (username, pricing, selectedKeys) => {
    const cleanUsername = String(username || '').trim().replace(/^@/, '');
    if (!cleanUsername) return '';

    const estimate = calculateEstimate(pricing, selectedKeys);
    const rows = [
      `— ${pricing.base.title} — ${formatPrice(pricing.base.price)}`,
      ...estimate.selected.map((item) => `— ${item.title} — ${item.isFrom ? 'от ' : ''}${formatPrice(item.price)}`),
    ];
    const totalLabel = `${estimate.isFrom ? 'от ' : ''}${formatPrice(estimate.total)}`;
    const message = [
      'Здравствуйте! Хочу заказать лендинг.',
      '',
      'Выбранные услуги:',
      ...rows,
      '',
      `Предварительная стоимость: ${totalLabel}`,
      '',
      'Хочу обсудить детали проекта.',
    ].join('\n');

    return `https://t.me/${cleanUsername}?text=${encodeURIComponent(message)}`;
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildTelegramUrl, calculateEstimate, formatPrice, normalizeProjects };
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = { content: null, selected: new Set(), radialContext: null, scrollContext: null };

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
    const finish = () => {
      if (finished) return;
      finished = true;
      intro.classList.add('is-done');
      document.body.classList.remove('intro-active');
      document.documentElement.classList.remove('intro-pending');
      window.clearTimeout(window.__introFallback);
      try { sessionStorage.setItem('spartak-intro-v2-seen', '1'); } catch (_) { /* Storage can be unavailable. */ }
      runNameDecode(alreadyShown || reducedMotionQuery.matches);
      revealHero(alreadyShown || reducedMotionQuery.matches);
    };

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
    root.replaceChildren(...items.map((item) => {
      const card = document.createElement('div');
      card.className = 'stack-item';
      const code = document.createElement('span');
      code.className = 'stack-item__code';
      code.setAttribute('aria-hidden', 'true');
      code.textContent = item.code;
      const name = document.createElement('strong');
      name.textContent = item.name;
      card.append(code, name);
      return card;
    }));
  }

  function renderProjects(projects) {
    const root = document.getElementById('projects-root');
    if (!root) return;
    if (state.radialContext) {
      state.radialContext.revert();
      state.radialContext = null;
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
      if (project.imageUrl) {
        try {
          const parsedImage = new URL(project.imageUrl);
          if (parsedImage.protocol === 'https:' || parsedImage.protocol === 'http:') {
            const image = document.createElement('img');
            image.src = parsedImage.href;
            image.alt = '';
            image.loading = 'lazy';
            visual.append(image);
          }
        } catch (_) { /* Keep the default card visual. */ }
      }
      const category = document.createElement('small');
      category.textContent = project.category;
      const title = document.createElement('h3');
      title.textContent = project.title;
      card.append(visual, category, title);
      item.append(card);
      wheel.append(item);
    });
    viewport.append(wheel);
    stage.append(viewport);
    root.replaceChildren(stage);
    requestAnimationFrame(() => setupRadialGallery(stage, wheel));
  }

  function setupRadialGallery(stage, wheel) {
    if (!window.gsap || !window.ScrollTrigger || reducedMotionQuery.matches || (window.innerHeight < 600 && window.innerWidth > window.innerHeight)) return;
    window.gsap.registerPlugin(window.ScrollTrigger);
    const items = Array.from(wheel.querySelectorAll('.radial-wheel__item'));
    const cards = items.map((item) => item.querySelector('.project-card'));
    const step = 360 / items.length;
    const context = window.gsap.context(() => {
      items.forEach((item, index) => {
        const angle = index * step;
        window.gsap.set(item, { rotation: angle });
        window.gsap.set(cards[index], { rotation: -angle });
      });
      const timeline = window.gsap.timeline({
        scrollTrigger: {
          trigger: stage,
          pin: true,
          start: 'top top',
          end: () => `+=${Math.max(1500, items.length * Math.min(window.innerHeight * .72, 620))}`,
          scrub: .65,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });
      timeline
        .to(items, { rotation: (index) => (index * step) - 360, duration: 1, ease: 'none' }, 0)
        .to(cards, { rotation: (index) => -(index * step) + 360, duration: 1, ease: 'none' }, 0);
    }, stage);
    state.radialContext = context;
    window.ScrollTrigger.refresh();
  }

  function setupScrollReveals() {
    if (!window.gsap || !window.ScrollTrigger || reducedMotionQuery.matches) return;
    if (state.scrollContext) state.scrollContext.revert();
    state.scrollContext = window.gsap.context(() => {
      window.ScrollTrigger.batch('.section-heading, .stack-grid, .empty-state, .pricing-layout, .final-cta', {
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

    const orderLink = document.getElementById('telegram-order');
    const url = buildTelegramUrl(owner.telegramUsername, pricing, selectedKeys);
    if (orderLink && url) orderLink.href = url;
  }

  function setupNavigation() {
    const header = document.getElementById('site-header');
    const menu = document.querySelector('.menu-button');
    const nav = document.getElementById('site-nav');
    const links = Array.from(document.querySelectorAll('.site-nav a'));

    const syncHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 18);
    syncHeader();
    window.addEventListener('scroll', syncHeader, { passive: true });

    menu?.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      nav?.classList.toggle('is-open', open);
    });
    links.forEach((link) => link.addEventListener('click', () => {
      menu?.setAttribute('aria-expanded', 'false');
      menu?.setAttribute('aria-label', 'Открыть меню');
      nav?.classList.remove('is-open');
    }));

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
    reducedMotionQuery.addEventListener('change', (event) => {
      reduced = event.matches;
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
        if (Array.isArray(apiProjects) && apiProjects.length) projects = apiProjects;
      } catch (_) { /* Local preview and API failures use the JSON fallback. */ }
      state.content = content;
      renderStack(content.stack);
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
