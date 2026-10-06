import assert from 'node:assert/strict';
import test from 'node:test';
import telegramApi, { parseCommand } from '../api/telegram.mjs';

const original = {
  fetch: globalThis.fetch,
  token: process.env.TELEGRAM_BOT_TOKEN,
  admin: process.env.TELEGRAM_ADMIN_ID,
  secret: process.env.TELEGRAM_WEBHOOK_SECRET,
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  secretKey: process.env.SUPABASE_SECRET_KEY,
};

const restore = () => {
  globalThis.fetch = original.fetch;
  for (const [name, value] of Object.entries({
    TELEGRAM_BOT_TOKEN: original.token,
    TELEGRAM_ADMIN_ID: original.admin,
    TELEGRAM_WEBHOOK_SECRET: original.secret,
    SUPABASE_URL: original.url,
    SUPABASE_SERVICE_ROLE_KEY: original.key,
    SUPABASE_SECRET_KEY: original.secretKey,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
};

const configure = (extra = {}) => Object.assign(process.env, {
  TELEGRAM_BOT_TOKEN: 'bot-token',
  TELEGRAM_ADMIN_ID: '42',
  TELEGRAM_WEBHOOK_SECRET: 'secret',
  SUPABASE_URL: 'https://demo.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  ...extra,
});

const webhook = (message, updateId) => telegramApi.fetch(new Request('https://site.test/api/telegram', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'secret' },
  body: JSON.stringify({ ...(updateId ? { update_id: updateId } : {}), message }),
}));

test('parses project commands without conversational state', () => {
  assert.deepEqual(parseCommand('/add Сайт | Лендинг | https://site.test | https://site.test/cover.jpg | 7'), {
    action: 'add',
    title: 'Сайт',
    category: 'Лендинг',
    liveUrl: 'https://site.test/',
    imageUrl: 'https://site.test/cover.jpg',
    sortOrder: 7,
  });
  assert.deepEqual(parseCommand('/add Сайт | Лендинг | https://site.test'), {
    action: 'add', title: 'Сайт', category: 'Лендинг', liveUrl: 'https://site.test/', imageUrl: '', sortOrder: 0,
  });
  assert.deepEqual(parseCommand('/publish 12'), { action: 'publish', id: 12 });
  assert.deepEqual(parseCommand('/hide 12'), { action: 'hide', id: 12 });
  assert.deepEqual(parseCommand('/delete 12 CONFIRM'), { action: 'delete', id: 12 });
  assert.deepEqual(parseCommand('/image 12'), { action: 'image', id: 12 });
  assert.deepEqual(parseCommand('/delete 12'), { action: 'help' });
});

test('stores a Telegram photo in public Supabase storage and updates the project image', async () => {
  configure();
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ url: href, options });
    if (href.includes('/getFile?file_id=large-photo')) return Response.json({ ok: true, result: { file_path: 'photos/cover.jpg' } });
    if (href.includes('/file/botbot-token/photos/cover.jpg')) {
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'application/octet-stream' } });
    }
    if (href.endsWith('/storage/v1/bucket/portfolio')) return Response.json({ id: 'portfolio', public: true });
    if (href.includes('/storage/v1/object/portfolio/projects/3-88-unique-photo.jpg')) return Response.json({ Key: 'ok' });
    if (href.includes('/rest/v1/projects?id=eq.3')) return Response.json([{ id: 3, title: 'Работа' }]);
    return Response.json({ ok: true });
  };

  try {
    const response = await webhook({
      chat: { id: 42, type: 'private' },
      from: { id: 42 },
      caption: '/image 3',
      photo: [
        { file_id: 'small-photo', file_unique_id: 'small-unique', width: 90, height: 90 },
        { file_id: 'large-photo', file_unique_id: 'unique-photo', width: 1280, height: 720 },
      ],
    }, 88);
    assert.equal(response.status, 200);
    const upload = calls.find((call) => call.url.includes('/storage/v1/object/portfolio/'));
    assert.equal(upload.options.method, 'POST');
    assert.equal(upload.options.headers['x-upsert'], 'true');
    assert.equal(upload.options.headers['Content-Type'], 'image/jpeg');
    const update = calls.find((call) => call.url.includes('/rest/v1/projects?id=eq.3'));
    assert.deepEqual(JSON.parse(update.options.body), {
      image_url: 'https://demo.supabase.co/storage/v1/object/public/portfolio/projects/3-88-unique-photo.jpg',
    });
    assert.equal(JSON.parse(calls.at(-1).options.body).text, 'Обложка ID 3 обновлена.');
  } finally { restore(); }
});

test('rejects webhook requests with wrong secret', async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = 'expected';
  try {
    const response = await telegramApi.fetch(new Request('https://site.test/api/telegram', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'wrong' },
      body: '{}',
    }));
    assert.equal(response.status, 401);
  } finally { restore(); }
});

test('reports configuration, token and webhook problems without exposing values', async () => {
  configure({ TELEGRAM_ADMIN_ID: '@spartlak' });
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/getMe')) return Response.json({ ok: true, result: { username: 'demo_bot' } });
    if (String(url).endsWith('/getWebhookInfo')) return Response.json({ ok: true, result: { url: '', pending_update_count: 0 } });
    return Response.json({ ok: true });
  };
  try {
    const response = await telegramApi.fetch(new Request('https://site.test/api/telegram'));
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.deepEqual(body.configured, { token: true, adminId: true, webhookSecret: true, supabaseUrl: true, serviceKey: false });
    assert.equal(body.bot, '@demo_bot');
    assert.ok(body.problems.some((problem) => /TELEGRAM_ADMIN_ID должен быть числом/.test(problem)));
    assert.ok(body.problems.some((problem) => /Webhook не зарегистрирован/.test(problem)));
    assert.equal(JSON.stringify(body).includes('bot-token'), false);
  } finally { restore(); }
});

test('registers the webhook only with the correct secret', async () => {
  configure();
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/getMe')) return Response.json({ ok: true, result: { username: 'demo_bot' } });
    if (String(url).endsWith('/getWebhookInfo')) return Response.json({ ok: true, result: { url: 'https://site.test/api/telegram' } });
    return Response.json({ ok: true });
  };
  try {
    assert.equal((await telegramApi.fetch(new Request('https://site.test/api/telegram?setup=wrong'))).status, 401);
    const response = await telegramApi.fetch(new Request('https://site.test/api/telegram?setup=secret'));
    assert.equal(response.status, 200);
    const setWebhook = calls.find((call) => call.url.endsWith('/setWebhook'));
    assert.deepEqual(JSON.parse(setWebhook.options.body).url, 'https://site.test/api/telegram');
    assert.equal(JSON.parse(setWebhook.options.body).secret_token, 'secret');
  } finally { restore(); }
});

test('tells a non-admin user their numeric id instead of staying silent', async () => {
  configure();
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return Response.json({ ok: true });
  };
  try {
    const response = await webhook({ chat: { id: 7, type: 'private' }, from: { id: 7 }, text: '/list' });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.match(JSON.parse(calls[0].options.body).text, /Ваш Telegram ID: 7/);
  } finally { restore(); }
});

test('does not make Telegram retry forever when the reply fails', async () => {
  configure({ SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
  globalThis.fetch = async () => Response.json({ ok: false, description: 'Unauthorized' }, { status: 401 });
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await webhook({ chat: { id: 42 }, from: { id: 42 }, text: '/start' });
    assert.equal(response.status, 200);
    assert.match((await response.json()).error, /Telegram: 401/);
  } finally { console.error = originalError; restore(); }
});

test('supports a current Supabase secret key without sending it as a bearer JWT', async () => {
  configure();
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/rest/v1/projects')) return Response.json([]);
    return Response.json({ ok: true });
  };
  try {
    const response = await webhook({ chat: { id: 42 }, from: { id: 42 }, text: '/list' });
    assert.equal(response.status, 200);
    assert.equal(calls[0].options.headers.apikey, 'sb_secret_test');
    assert.equal(calls[0].options.headers.Authorization, undefined);
  } finally { restore(); }
});

test('explains how to fix a missing Supabase projects table', async () => {
  configure();
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/rest/v1/projects')) {
      return Response.json({ code: 'PGRST205', message: "Could not find the table 'public.projects'" }, { status: 404 });
    }
    return Response.json({ ok: true });
  };
  try {
    const response = await webhook({ chat: { id: 42 }, from: { id: 42 }, text: '/list' });
    assert.equal(response.status, 200);
    assert.equal(
      JSON.parse(calls[1].options.body).text,
      'Ошибка: Supabase: таблица projects не найдена. Выполните supabase/schema.sql в Supabase SQL Editor.',
    );
  } finally { restore(); }
});

test('lists projects for configured admin and replies through Telegram', async () => {
  configure({ SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/rest/v1/projects')) return Response.json([{ id: 3, title: 'Работа', published: true, sort_order: 1 }]);
    return Response.json({ ok: true });
  };
  try {
    const response = await webhook({ chat: { id: 42 }, from: { id: 42 }, text: '/list' });
    assert.equal(response.status, 200);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer service-key');
    assert.match(JSON.parse(calls[1].options.body).text, /3 · опубликован · Работа/);
  } finally { restore(); }
});

for (const scenario of [
  { name: 'accepts an image sent as a document', document: { file_id: 'file', file_unique_id: 'unique', mime_type: 'image/png', file_name: 'cover.png', file_size: 1024 }, expected: /Обложка ID 3 обновлена/, upload: true },
  { name: 'explains a private storage bucket without saving a broken URL', privateBucket: true, expected: /portfolio.*публичн/, upload: false },
  { name: 'keeps the previous image when upload fails', uploadFailure: true, expected: /Storage upload: 500/, upload: true },
  { name: 'explains the caption for a photo without a command', noCaption: true, expected: /\/image ID/, upload: false },
  { name: 'rejects oversized files before downloading', document: { file_id: 'file', mime_type: 'image/png', file_size: 11 * 1024 * 1024 }, expected: /10 МБ/, upload: false },
]) {
  test(scenario.name, async () => {
    configure();
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).includes('/getFile?')) return Response.json({ ok: true, result: { file_path: scenario.document ? 'documents/cover.png' : 'photos/cover.jpg' } });
      if (String(url).includes('/file/bot')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': scenario.document ? 'image/png' : 'image/jpeg' } });
      if (String(url).endsWith('/bucket/portfolio')) return Response.json({ id: 'portfolio', public: !scenario.privateBucket });
      if (String(url).includes('/object/portfolio/')) return Response.json({}, { status: scenario.uploadFailure ? 500 : 200 });
      if (String(url).includes('/rest/v1/projects')) return Response.json([{ id: 3 }]);
      return Response.json({ ok: true });
    };
    try {
      const response = await webhook({
        chat: { id: 42 },
        from: { id: 42 },
        ...(scenario.noCaption ? {} : { caption: '/image 3' }),
        ...(scenario.document ? { document: scenario.document } : { photo: [{ file_id: 'file', file_unique_id: 'unique' }] }),
      }, 123);
      assert.equal(response.status, 200);
      const reply = calls.findLast((call) => call.url.endsWith('/sendMessage'));
      assert.ok(reply, 'The bot must explain the result');
      assert.match(JSON.parse(reply.options.body).text, scenario.expected);
      const upload = calls.find((call) => call.url.includes('/object/portfolio/'));
      assert.equal(Boolean(upload), scenario.upload);
      const update = calls.find((call) => call.options.method === 'PATCH');
      if (scenario.document && scenario.upload) {
        assert.equal(upload.options.headers['Content-Type'], 'image/png');
        assert.match(JSON.parse(update.options.body).image_url, /\/public\/portfolio\/projects\/3-123-unique\.png$/);
      } else assert.equal(update, undefined, 'A failed upload must preserve the current cover');
    } finally { restore(); }
  });
}
