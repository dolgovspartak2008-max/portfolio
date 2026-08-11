const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

const helpText = [
  'Команды:',
  '/list — список работ',
  '/add Название | Категория | https://сайт | https://обложка | порядок',
  '/image ID — отправить фото с этой подписью и заменить обложку',
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
  if (command === '/image' || command === '/photo') return { action: 'image', id };
  if (command === '/delete' && confirmation === 'CONFIRM') return { action: 'delete', id };
  return { action: 'help' };
};

const configuration = () => ({
  token: process.env.TELEGRAM_BOT_TOKEN,
  adminId: process.env.TELEGRAM_ADMIN_ID,
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  supabaseUrl: process.env.SUPABASE_URL?.replace(/\/$/, ''),
  serviceKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
});

const configurationStatus = (config) => ({
  token: Boolean(config.token),
  adminId: Boolean(config.adminId),
  webhookSecret: Boolean(config.webhookSecret),
  supabaseUrl: Boolean(config.supabaseUrl),
  serviceKey: Boolean(config.serviceKey),
});

const authorizationHeaders = (config) => ({
  apikey: config.serviceKey,
  ...(config.serviceKey.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${config.serviceKey}` }),
});

const supabaseRequest = async (config, path, init = {}) => {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...authorizationHeaders(config),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...init.headers,
    },
  });
  if (!response.ok) {
    let error;
    try { error = await response.json(); } catch (_) { error = {}; }
    if (response.status === 404 && error.code === 'PGRST205') {
      throw new Error('Supabase: таблица projects не найдена. Выполните supabase/schema.sql в Supabase SQL Editor.');
    }
    throw new Error(`Supabase: ${response.status}${error.code ? ` · ${error.code}` : ''}`);
  }
  return response.status === 204 ? [] : response.json();
};

const ensurePortfolioBucket = async (config) => {
  const headers = authorizationHeaders(config);
  const current = await fetch(`${config.supabaseUrl}/storage/v1/bucket/portfolio`, { headers });
  if (current.ok) return;
  if (current.status !== 404) throw new Error(`Supabase Storage: ${current.status}`);
  const created = await fetch(`${config.supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'portfolio',
      name: 'portfolio',
      public: true,
      file_size_limit: 10485760,
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
    }),
  });
  if (!created.ok && created.status !== 409) throw new Error(`Supabase Storage: ${created.status}`);
};

const updateProjectImage = async (config, command, message, updateId) => {
  const photo = message.photo?.at(-1);
  if (!photo?.file_id) throw new Error('Отправьте фото с подписью /image ID.');

  const fileResponse = await fetch(`https://api.telegram.org/bot${config.token}/getFile?file_id=${encodeURIComponent(photo.file_id)}`);
  const fileResult = await fileResponse.json();
  const filePath = fileResult?.result?.file_path;
  if (!fileResponse.ok || !fileResult.ok || !filePath) throw new Error('Telegram не вернул файл изображения.');

  const download = await fetch(`https://api.telegram.org/file/bot${config.token}/${filePath}`);
  if (!download.ok) throw new Error(`Telegram file: ${download.status}`);
  const extension = filePath.match(/\.(jpe?g|png|webp)$/i)?.[1].toLowerCase().replace('jpeg', 'jpg') || 'jpg';
  const inferredType = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[extension];
  const responseType = download.headers.get('content-type')?.split(';')[0];
  const contentType = ['image/jpeg', 'image/png', 'image/webp'].includes(responseType) ? responseType : inferredType;

  await ensurePortfolioBucket(config);
  const uniqueId = String(photo.file_unique_id || photo.file_id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'image';
  const objectPath = `projects/${command.id}-${Number(updateId) || Date.now()}-${uniqueId}.${extension}`;
  const upload = await fetch(`${config.supabaseUrl}/storage/v1/object/portfolio/${objectPath}`, {
    method: 'POST',
    headers: {
      ...authorizationHeaders(config),
      'Content-Type': contentType,
      'x-upsert': 'true',
      'cache-control': '3600',
    },
    body: await download.arrayBuffer(),
  });
  if (!upload.ok) throw new Error(`Supabase Storage upload: ${upload.status}`);

  const imageUrl = `${config.supabaseUrl}/storage/v1/object/public/portfolio/${objectPath}`;
  const projects = await supabaseRequest(config, `projects?id=eq.${command.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ image_url: imageUrl }),
  });
  return projects.length ? `Обложка ID ${command.id} обновлена.` : `ID ${command.id} не найден.`;
};

const execute = async (config, command, message, updateId) => {
  if (command.action === 'image') return updateProjectImage(config, command, message, updateId);
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

const reply = async (config, chatId, text) => {
  const response = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!response.ok) throw new Error(`Telegram: ${response.status}`);
};

export default {
  async fetch(request) {
    const config = configuration();
    if (request.method === 'GET') {
      const configured = configurationStatus(config);
      const ok = Object.values(configured).every(Boolean);
      return json({ ok, configured }, ok ? 200 : 503);
    }
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (!config.webhookSecret || request.headers.get('x-telegram-bot-api-secret-token') !== config.webhookSecret) {
      return json({ error: 'Unauthorized' }, 401);
    }
    if (!config.token || !config.adminId || !config.supabaseUrl || !config.serviceKey) {
      return json({ error: 'Bot is not configured' }, 500);
    }

    let update;
    try { update = await request.json(); } catch (_) { return json({ error: 'Invalid JSON' }, 400); }
    const message = update?.message;
    if (!message || String(message.from?.id) !== String(config.adminId)) return json({ ok: true });
    const messageText = message.text || message.caption;
    if (!messageText) return json({ ok: true });

    try {
      await reply(config, message.chat.id, await execute(config, parseCommand(messageText), message, update.update_id));
    } catch (error) {
      try {
        await reply(config, message.chat.id, `Ошибка: ${error.message}`);
      } catch (replyError) {
        return json({ error: replyError.message }, 502);
      }
    }
    return json({ ok: true });
  },
};
