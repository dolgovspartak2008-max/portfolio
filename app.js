(function () {
  'use strict';

  const PAGE_SIZE = 12;

  const formatPrice = (value) => `${Number(value).toLocaleString('ru-RU').replace(/ /g, ' ')} ₽`;

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
      ...(project.previews ? { previews: project.previews } : {}),
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

  const safeLiveUrl = (value) => {
    try {
      const parsed = new URL(value);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch (_) { return ''; }
  };

  const filterProjects = (projects, query) => {
    const needle = String(query || '').trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) => `${project.title} ${project.category}`.toLowerCase().includes(needle));
  };

  const projectsWord = (count) => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return 'проект';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'проекта';
    return 'проектов';
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
      buildProjectImageUrl,
      buildTelegramUrl,
      calculateEstimate,
      filterProjects,
      formatPrice,
      normalizeProjects,
      projectsWord,
    };
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const state = {
    selected: new Set(),
    brief: { businessType: '', contentStatus: '', timeline: '' },
  };

  const setText = (selector, value) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  };

  const create = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  function renderServices(services) {
    const root = document.getElementById('services-list');
    if (!root || !Array.isArray(services)) return;
    root.replaceChildren(...services.map((service, index) => {
      const card = create('article', 'service-card');
      card.append(
        create('span', 'service-card__number', String(index + 1).padStart(2, '0')),
        create('h3', '', service.title),
        create('p', '', service.description),
      );
      const list = create('ul', 'service-card__list');
      list.append(...(service.items || []).map((item) => create('li', '', item)));
      card.append(list);
      return card;
    }));
  }

  function createProjectCard(project) {
    const url = safeLiveUrl(project.liveUrl);
    const card = create(url ? 'a' : 'article', 'project-card');
    if (url) {
      card.href = url;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.setAttribute('aria-label', `${project.title} — ${project.category}, открыть сайт в новой вкладке`);
    }

    const visual = create('div', 'project-card__visual');
    const placeholder = create('span', 'project-card__placeholder', project.title);
    visual.append(placeholder);
    const preview = project.previews?.desktop;
    const imageUrl = preview?.webp || buildProjectImageUrl(project.imageUrl, location.origin);
    if (imageUrl) {
      const picture = document.createElement('picture');
      if (preview?.avif) {
        const source = document.createElement('source');
        source.type = 'image/avif';
        source.srcset = preview.avif;
        picture.append(source);
      }
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.width = 640;
      image.height = 400;
      image.addEventListener('load', () => { placeholder.hidden = true; });
      image.addEventListener('error', () => {
        const fallback = buildProjectImageUrl(legacyProjectImages.get(String(project.id)), location.origin);
        if (fallback && image.src !== fallback) image.src = fallback;
        else picture.remove();
      });
      picture.append(image);
      visual.append(picture);
    }

    const info = create('div', 'project-card__info');
    const text = create('div', 'project-card__text');
    text.append(create('small', '', project.category), create('h3', '', project.title));
    info.append(text);
    if (url) {
      const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; } })();
      info.append(create('span', 'project-card__host', `${host} ↗`));
    }
    card.append(visual, info);
    return card;
  }

  function setupProjects(projects) {
    const root = document.getElementById('projects-root');
    const search = document.getElementById('works-search');
    const more = document.getElementById('works-more');
    const count = document.getElementById('works-count');
    if (!root) return;

    const total = projects.length;
    if (total) {
      setText('#proof-text', '');
      const proof = document.getElementById('proof-text');
      if (proof) {
        proof.append(create('strong', '', `${total} ${projectsWord(total)}`), ' в портфолио — сайты для разных ниш. Новые работы добавляются регулярно.');
      }
    }

    if (!total) {
      root.innerHTML = '<div class="empty-state"><h3>Новые проекты скоро появятся</h3><p>Можно обсудить ваш проект уже сегодня.</p><a class="button button--primary" href="#contacts">Связаться</a></div>';
      if (search) search.closest('.works-toolbar').hidden = true;
      return;
    }

    const grid = create('div', 'projects-grid');
    root.replaceChildren(grid);
    let visible = PAGE_SIZE;
    let filtered = projects;

    const render = () => {
      const shown = filtered.slice(0, visible);
      grid.replaceChildren(...shown.map(createProjectCard));
      if (!filtered.length) grid.append(create('p', 'projects-grid__empty', 'Ничего не найдено. Попробуйте другое слово.'));
      if (more) {
        const rest = filtered.length - shown.length;
        more.hidden = rest <= 0;
        more.textContent = `Показать ещё ${Math.min(rest, PAGE_SIZE)} из ${rest}`;
      }
      if (count) {
        count.textContent = filtered.length === total
          ? `${total} ${projectsWord(total)}`
          : `Найдено: ${filtered.length} из ${total}`;
      }
    };

    more?.addEventListener('click', () => {
      const firstNew = visible;
      visible += PAGE_SIZE;
      render();
      grid.children[firstNew]?.focus?.();
    });

    let searchTimer = 0;
    search?.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        filtered = filterProjects(projects, search.value);
        visible = PAGE_SIZE;
        render();
      }, 120);
    });

    render();
  }

  function renderPricing(content) {
    const { pricing, owner } = content;
    setText('#base-price', formatPrice(pricing.base.price));
    setText('#calculator-base-price', formatPrice(pricing.base.price));

    const includedRoot = document.getElementById('included-list');
    if (includedRoot) includedRoot.replaceChildren(...pricing.base.included.map((text) => create('li', '', text)));

    const extrasRoot = document.getElementById('extras-list');
    if (extrasRoot) {
      extrasRoot.replaceChildren(...pricing.extras.map((service) => {
        const label = create('label', 'service-option');
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
      field?.addEventListener('change', (event) => {
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
      lines.replaceChildren(...[pricing.base, ...estimate.selected].map((item) => {
        const row = create('div', 'estimate__line');
        row.append(create('span', '', item.title), create('span', '', `${item.isFrom ? 'от ' : ''}${formatPrice(item.price)}`));
        return row;
      }));
    }
    const totalLabel = `${estimate.isFrom ? 'от ' : ''}${formatPrice(estimate.total)}`;
    setText('#estimate-total', totalLabel);
    setText('#mobile-estimate-total', totalLabel);

    const url = buildTelegramUrl(owner.telegramUsername, pricing, selectedKeys, state.brief);
    ['telegram-order', 'mobile-telegram-order'].forEach((id) => {
      const orderLink = document.getElementById(id);
      if (orderLink && url) orderLink.href = url;
    });
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
        if (Array.isArray(apiProjects)) {
          const localProjects = new Map(content.projects.map((project) => [String(project.id), project]));
          projects = normalizeProjects(apiProjects).map((project) => ({
            ...localProjects.get(String(project.id)),
            ...project,
          }));
        }
      } catch (_) { /* Local preview and API failures use the JSON fallback. */ }
      renderServices(content.services);
      setupProjects(normalizeProjects(projects).filter((project) => project.published !== false));
      renderPricing(content);
    } catch (_) {
      const projects = document.getElementById('projects-root');
      if (projects) projects.innerHTML = '<div class="empty-state"><h3>Контент временно недоступен</h3><p>Напишите Спартаку в Telegram — связь работает.</p></div>';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    setText('#year', new Date().getFullYear());
    setupNavigation();
    loadContent();
  });
}());
