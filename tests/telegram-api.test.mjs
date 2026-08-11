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

test('parses project commands without conversational state', () => {
  assert.deepEqual(parseCommand('/add Сайт | Лендинг | https://site.test | https://site.test/cover.jpg | 7'), {
    action: 'add',
    title: 'Сайт',
    category: 'Лендинг',
    liveUrl: 'https://site.test/',
    imageUrl: 'https://site.test/cover.jpg',
    sortOrder: 7,
  });
  assert.deepEqual(parseCommand('/publish 12'), { action: 'publish', id: 12 });
  assert.deepEqual(parseCommand('/hide 12'), { action: 'hide', id: 12 });
  assert.deepEqual(parseCommand('/delete 12 CONFIRM'), { action: 'delete', id: 12 });
  assert.deepEqual(parseCommand('/delete 12'), { action: 'help' });
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

test('reports which server variables are configured without exposing values', async () => {
  Object.assign(process.env, {
    TELEGRAM_BOT_TOKEN: 'bot-token',
    TELEGRAM_ADMIN_ID: '42',
    TELEGRAM_WEBHOOK_SECRET: 'secret',
    SUPABASE_URL: 'https://demo.supabase.co',
  });
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const response = await telegramApi.fetch(new Request('https://site.test/api/telegram'));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      ok: false,
      configured: {
        token: true,
        adminId: true,
        webhookSecret: true,
        supabaseUrl: true,
        serviceKey: false,
      },
    });
  } finally { restore(); }
});

test('returns 502 when Telegram rejects the reply instead of hiding the failure', async () => {
  Object.assign(process.env, {
    TELEGRAM_BOT_TOKEN: 'bot-token',
    TELEGRAM_ADMIN_ID: '42',
    TELEGRAM_WEBHOOK_SECRET: 'secret',
    SUPABASE_URL: 'https://demo.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  });
  globalThis.fetch = async () => Response.json({ ok: false, description: 'Unauthorized' }, { status: 401 });
  try {
    const response = await telegramApi.fetch(new Request('https://site.test/api/telegram', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'secret',
      },
      body: JSON.stringify({ message: { chat: { id: 42 }, from: { id: 42 }, text: '/start' } }),
    }));
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /Telegram: 401/);
  } finally { restore(); }
});

test('supports a current Supabase secret key without sending it as a bearer JWT', async () => {
  Object.assign(process.env, {
    TELEGRAM_BOT_TOKEN: 'bot-token',
    TELEGRAM_ADMIN_ID: '42',
    TELEGRAM_WEBHOOK_SECRET: 'secret',
    SUPABASE_URL: 'https://demo.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_test',
  });
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/rest/v1/projects')) return Response.json([]);
    return Response.json({ ok: true });
  };
  try {
    const response = await telegramApi.fetch(new Request('https://site.test/api/telegram', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'secret',
      },
      body: JSON.stringify({ message: { chat: { id: 42 }, from: { id: 42 }, text: '/list' } }),
    }));
    assert.equal(response.status, 200);
    assert.equal(calls[0].options.headers.apikey, 'sb_secret_test');
    assert.equal(calls[0].options.headers.Authorization, undefined);
  } finally { restore(); }
});

test('lists projects for configured admin and replies through Telegram', async () => {
  Object.assign(process.env, {
    TELEGRAM_BOT_TOKEN: 'bot-token',
    TELEGRAM_ADMIN_ID: '42',
    TELEGRAM_WEBHOOK_SECRET: 'secret',
    SUPABASE_URL: 'https://demo.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  });
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/rest/v1/projects')) {
      return Response.json([{ id: 3, title: 'Работа', published: true, sort_order: 1 }]);
    }
    return Response.json({ ok: true });
  };

  try {
    const response = await telegramApi.fetch(new Request('https://site.test/api/telegram', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'secret',
      },
      body: JSON.stringify({ message: { chat: { id: 42 }, from: { id: 42 }, text: '/list' } }),
    }));
    assert.equal(response.status, 200);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer service-key');
    assert.match(JSON.parse(calls[1].options.body).text, /3 · опубликован · Работа/);
  } finally { restore(); }
});
