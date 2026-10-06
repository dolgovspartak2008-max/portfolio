const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

const helpText = [
  'Команды:',
  '/list — список работ',
  '/add Название | Категория | https://сайт | https://обложка | порядок',
  '/image ID — отправить фото или файл JPG/PNG/WebP до 10 МБ с этой подписью',
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
    const sortOrder = Number.parseInt(order || '0', 10);
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
  token: process.env.TELEGRAM_BOT_TOKEN?.trim(),
  adminId: process.env.TELEGRAM_ADMIN_ID?.trim(),
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET?.trim(),
  supabaseUrl: process.env.SUPABASE_URL?.trim().replace(/\/$/, ''),
  serviceKey: (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim(),
});

const configurationStatus = (config) => ({
  token: Boolean(config.token),
  adminId: Boolean(config.adminId),
  webhookSecret: Boolean(config.webhookSecret),
  supabaseUrl: Boolean(config.supabaseUrl),
  serviceKey: Boolean(config.serviceKey),
});

// Telegram rejects setWebhook when secret_token has other characters, and the admin id must be numeric.
const configurationProblems = (config) => [
  config.adminId && !/^\d+$/.test(config.adminId)
    ? 'TELEGRAM_ADMIN_ID должен быть числом (ваш ID, не @username). Узнать ID: написать боту — он ответит.'
    : '',
  config.webhookSecret && !/^[A-Za-z0-9_-]{1,256}$/.test(config.webhookSecret)
    ? 'TELEGRAM_WEBHOOK_SECRET может содержать только латиницу, цифры, _ и -.'
    : '',
  config.supabaseUrl && !/^https:\/\/[^/]+\.supabase\.co$/.test(config.supabaseUrl)
    ? 'SUPABASE_URL должен выглядеть как https://PROJECT_REF.supabase.co без /rest/v1.'
    : '',
].filter(Boolean);

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
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Supabase: ${response.status} — проверьте SUPABASE_SECRET_KEY (нужен secret/service_role ключ, а не publishable).`);
    }
    throw new Error(`Supabase: ${response.status}${error.code ? ` · ${error.code}` : ''}`);
  }
  return response.status === 204 ? [] : response.json();
};

const ensurePortfolioBucket = async (config) => {
  const headers = authorizationHeaders(config);
  const current = await fetch(`${config.supabaseUrl}/storage/v1/bucket/portfolio`, { headers });
  if (current.ok) {
    const bucket = await current.json();
    if (!bucket.public) throw new Error('Supabase Storage: bucket portfolio должен быть публичным, иначе обложки не откроются на сайте.');
    return;
  }
  if (current.status !== 404 && current.status !== 400) throw new Error(`Supabase Storage: ${current.status}`);
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
  const photo = message.photo?.at(-1) || message.document;
  if (!photo?.file_id) throw new Error('Отправьте фото или файл JPG/PNG/WebP с подписью /image ID.');
  const types = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const documentType = message.document?.mime_type;
  if (message.document && !Object.values(types).includes(documentType)) {
    throw new Error('Поддерживаются файлы JPG, PNG и WebP. Отправьте другой формат как обычное фото.');
  }
  const maxSize = 10 * 1024 * 1024;
  if (photo.file_size > maxSize) throw new Error('Размер изображения должен быть не больше 10 МБ.');

  const fileResponse = await fetch(`https://api.telegram.org/bot${config.token}/getFile?file_id=${encodeURIComponent(photo.file_id)}`);
  const fileResult = await fileResponse.json();
  const filePath = fileResult?.result?.file_path;
  if (!fileResponse.ok || !fileResult.ok || !filePath) throw new Error('Telegram не вернул файл изображения.');

  const download = await fetch(`https://api.telegram.org/file/bot${config.token}/${filePath}`);
  if (!download.ok) throw new Error(`Telegram file: ${download.status}`);
  const extension = Object.keys(types).find((key) => types[key] === documentType)
    || filePath.match(/\.(jpe?g|png|webp)$/i)?.[1].toLowerCase().replace('jpeg', 'jpg') || 'jpg';
  const inferredType = types[extension];
  const responseType = download.headers.get('content-type')?.split(';')[0];
  const contentType = ['image/jpeg', 'image/png', 'image/webp'].includes(responseType) ? responseType : inferredType;

  const imageBytes = await download.arrayBuffer();
  if (imageBytes.byteLength > maxSize) throw new Error('Размер изображения должен быть не больше 10 МБ.');
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
    body: imageBytes,
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
    return `Добавлено: ${project.title} · ID ${project.id} · пока скрыт. Опубликовать: /publish ${project.id}`;
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

const telegramCall = async (config, method, body) => {
  try {
    const response = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return await response.json();
  } catch (error) {
    return { ok: false, description: error.message };
  }
};

// GET /api/telegram — диагностика. GET /api/telegram?setup=СЕКРЕТ — регистрирует webhook на этот адрес.
const status = async (request, config) => {
  const configured = configurationStatus(config);
  const problems = configurationProblems(config);
  const result = { ok: false, configured, problems };
  if (!config.token) return json(result, 503);

  const endpoint = new URL('/api/telegram', request.url).href;
  const setup = new URL(request.url).searchParams.get('setup');
  if (setup) {
    if (!config.webhookSecret || setup !== config.webhookSecret) return json({ error: 'Unauthorized' }, 401);
    const registered = await telegramCall(config, 'setWebhook', {
      url: endpoint,
      secret_token: config.webhookSecret,
      allowed_updates: ['message'],
      drop_pending_updates: true,
    });
    result.setup = registered.ok ? 'webhook зарегистрирован' : `Telegram: ${registered.description || 'ошибка'}`;
  }

  const me = await telegramCall(config, 'getMe');
  if (!me.ok) {
    problems.push(`TELEGRAM_BOT_TOKEN не принят Telegram: ${me.description || 'ошибка'}`);
    return json(result, 503);
  }
  result.bot = `@${me.result.username}`;
  const info = await telegramCall(config, 'getWebhookInfo');
  const webhook = info.result || {};
  result.webhook = {
    url: webhook.url || '',
    pointsHere: webhook.url === endpoint,
    pendingUpdates: webhook.pending_update_count || 0,
    lastError: webhook.last_error_message || '',
  };
  if (!webhook.url) problems.push('Webhook не зарегистрирован — откройте /api/telegram?setup=ВАШ_TELEGRAM_WEBHOOK_SECRET.');
  else if (webhook.url !== endpoint) problems.push(`Webhook указывает на ${webhook.url}, а не на ${endpoint}.`);
  if (webhook.last_error_message) problems.push(`Последняя ошибка доставки: ${webhook.last_error_message}`);

  result.ok = Object.values(configured).every(Boolean) && !problems.length;
  return json(result, result.ok ? 200 : 503);
};

export default {
  async fetch(request) {
    const config = configuration();
    if (request.method === 'GET') return status(request, config);
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
    if (!message?.chat) return json({ ok: true });

    try {
      if (String(message.from?.id) !== String(config.adminId)) {
        // Раньше бот молча игнорировал чужой ID — из-за этого казалось, что он «не работает».
        if (message.chat.type === 'private') {
          await reply(config, message.chat.id, `Нет доступа. Ваш Telegram ID: ${message.from?.id}. Если это вы — укажите его в TELEGRAM_ADMIN_ID на Vercel и сделайте Redeploy.`);
        }
        return json({ ok: true });
      }
      const messageText = message.text || message.caption || (message.photo || message.document ? '/help' : '');
      if (!messageText) return json({ ok: true });
      try {
        await reply(config, message.chat.id, await execute(config, parseCommand(messageText), message, update.update_id));
      } catch (error) {
        if (/^Telegram: /.test(error.message)) throw error;
        await reply(config, message.chat.id, `Ошибка: ${error.message}`);
      }
    } catch (error) {
      // 200, чтобы Telegram не повторял одно и то же сообщение бесконечно; причина видна в логах Vercel.
      console.error('telegram webhook:', error.message);
      return json({ ok: false, error: error.message });
    }
    return json({ ok: true });
  },
};
