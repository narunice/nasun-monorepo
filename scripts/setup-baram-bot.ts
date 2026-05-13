#!/usr/bin/env tsx
// Setup script for the Baram (@nasun_ai_bot) Telegram bot.
//
// Registers the webhook URL with Telegram and sets the bot command list.
// Run once per environment change (new domain, new secret, etc.).
//
// Usage:
//   BARAM_TG_BOT_TOKEN=<token> BARAM_TG_WEBHOOK_SECRET=<secret> \
//   tsx scripts/setup-baram-bot.ts
//
// Or dry-run (print only, no API calls):
//   DRY_RUN=true tsx scripts/setup-baram-bot.ts

const DRY_RUN = process.env.DRY_RUN === 'true';

const BOT_TOKEN = process.env.BARAM_TG_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.BARAM_TG_WEBHOOK_SECRET;
// Webhook URL — default to nasun.io production endpoint.
const WEBHOOK_URL =
  process.env.BARAM_WEBHOOK_URL ?? 'https://nasun.io/api/baram/telegram/webhook';

if (!BOT_TOKEN) {
  console.error('Error: BARAM_TG_BOT_TOKEN is required.');
  process.exit(1);
}

function tgUrl(method: string): string {
  return `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
}

async function callApi(method: string, body: Record<string, unknown>): Promise<unknown> {
  console.log(`\n[${method}]`);
  console.log('  Request:', JSON.stringify(body, null, 2));

  if (DRY_RUN) {
    console.log('  (dry-run: skipping actual API call)');
    return { ok: true };
  }

  const res = await fetch(tgUrl(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  console.log('  Response:', JSON.stringify(json, null, 2));
  if (!(json as Record<string, unknown>).ok) {
    throw new Error(`${method} failed: ${JSON.stringify(json)}`);
  }
  return json;
}

async function main(): Promise<void> {
  console.log('Baram Bot Setup');
  console.log('===============');
  console.log(`Webhook URL : ${WEBHOOK_URL}`);
  console.log(`Secret      : ${WEBHOOK_SECRET ? '*** (set)' : '(not set — webhook will be open)'}`);
  console.log(`Dry-run     : ${DRY_RUN}`);

  // 1. Set webhook
  const webhookBody: Record<string, unknown> = {
    url: WEBHOOK_URL,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  };
  if (WEBHOOK_SECRET) {
    webhookBody.secret_token = WEBHOOK_SECRET;
  }
  await callApi('setWebhook', webhookBody);

  // 2. Set bot commands
  await callApi('setMyCommands', {
    commands: [
      { command: 'start', description: 'Link your Nasun AI agent' },
      { command: 'status', description: 'Check your agent status' },
      { command: 'help', description: 'Show available commands' },
    ],
    scope: { type: 'all_private_chats' },
  });

  // 3. Verify webhook info
  await callApi('getWebhookInfo', {});

  console.log('\nSetup complete.');
  if (!WEBHOOK_SECRET) {
    console.warn(
      'Warning: BARAM_TG_WEBHOOK_SECRET is not set. ' +
      'Set it in chat-server .env (BARAM_TG_WEBHOOK_SECRET) ' +
      'and re-run this script with the same value to secure the webhook.',
    );
  }
}

main().catch((err: Error) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
