const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

const helpText = [
  'Команды:',
  '/list — список работ',
  '/add Название | Категория | https://сайт | https://обложка | порядок',
  '/publish ID — опубликовать',
  '/hide ID — скрыть',
  '/delete ID CONFIRM — удалить',
].join('\n');

const parseUrl = (value) => {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch (_) { return ''; }
};

export const parseCommand = (text) => {
  const source = String(text || '').trim();
  const [rawCommand = '', ...words] = source.split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase();
  const body = words.join(' ').trim();

  if (command === '/list') return { action: 'list' };
  if (command === '/add') {
    const [title = '', category = '', live = '', image = '', order = '0'] = body.split('|').map((value) => value.trim());
    const liveUrl = parseUrl(live);
    const imageUrl = parseUrl(image);
    const sortOrder = Number.parseInt(order, 10);
    if (!title || !category || (live && !liveUrl) || (image && !imageUrl) || !Number.isFinite(sortOrder)) return { action: 'help' };
    return { action: 'add', title, category, liveUrl, imageUrl, sortOrder };
  }

  const [idText = '', confirmation = ''] = body.split(/\s+/);
  const id = Number.parseInt(idText, 10);
  if (!Number.isInteger(id) || id < 1) return { action: 'help' };
  if (command === '/publish') return { action: 'publish', id };
  if (command === '/hide') return { action: 'hide', id };
  if (command === '/delete' && confirmation === 'CONFIRM') return { action: 'delete', id };
  return { action: 'help' };
};

const configuration = () => ({
  token: process.env.TELEGRAM_BOT_TOKEN,
  adminId: process.env.TELEGRAM_ADMIN_ID,
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  supabaseUrl: process.env.SUPABASE_URL?.replace(/\/$/, ''),
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

const supabaseRequest = async (config, path, init = {}) => {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`Supabase: ${response.status}`);
  return response.status === 204 ? [] : response.json();
};

const execute = async (config, command) => {
  if (command.action === 'list') {
    const projects = await supabaseRequest(config, 'projects?select=id,title,published,sort_order&order=sort_order.asc');
    if (!projects.length) return 'Работ пока нет.';
    return projects.map((project) => `${project.id} · ${project.published ? 'опубликован' : 'скрыт'} · ${project.title}`).join('\n');
  }
  if (command.action === 'add') {
    const [project] = await supabaseRequest(config, 'projects', {
      method: 'POST',
      body: JSON.stringify({
        title: command.title,
        category: command.category,
        live_url: command.liveUrl || null,
        image_url: command.imageUrl || null,
        sort_order: command.sortOrder,
        published: false,
      }),
    });
    return `Добавлено: ${project.title} · ID ${project.id} · пока скрыт.`;
  }
  if (command.action === 'publish' || command.action === 'hide') {
    const published = command.action === 'publish';
    const projects = await supabaseRequest(config, `projects?id=eq.${command.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ published }),
    });
    return projects.length ? `ID ${command.id}: ${published ? 'опубликован' : 'скрыт'}.` : `ID ${command.id} не найден.`;
  }
  if (command.action === 'delete') {
    const projects = await supabaseRequest(config, `projects?id=eq.${command.id}`, { method: 'DELETE' });
    return projects.length ? `ID ${command.id} удалён.` : `ID ${command.id} не найден.`;
  }
  return helpText;
};

const reply = (config, chatId, text) => fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chat_id: chatId, text }),
});

export default {
  async fetch(request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const config = configuration();
    if (!config.webhookSecret || request.headers.get('x-telegram-bot-api-secret-token') !== config.webhookSecret) {
      return json({ error: 'Unauthorized' }, 401);
    }
    if (!config.token || !config.adminId || !config.supabaseUrl || !config.serviceKey) {
      return json({ error: 'Bot is not configured' }, 500);
    }

    let update;
    try { update = await request.json(); } catch (_) { return json({ error: 'Invalid JSON' }, 400); }
    const message = update?.message;
    if (!message?.text || String(message.from?.id) !== String(config.adminId)) return json({ ok: true });

    try {
      await reply(config, message.chat.id, await execute(config, parseCommand(message.text)));
    } catch (error) {
      await reply(config, message.chat.id, `Ошибка: ${error.message}`);
    }
    return json({ ok: true });
  },
};
