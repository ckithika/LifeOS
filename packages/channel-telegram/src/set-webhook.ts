/**
 * One-time webhook registration script
 *
 * Usage: npx tsx src/set-webhook.ts
 * Or:    npm run set-webhook -w packages/channel-telegram
 */

import 'dotenv/config';

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is required');
    process.exit(1);
  }
  if (!webhookUrl) {
    console.error('TELEGRAM_WEBHOOK_URL is required (e.g., https://lifeos-channel-telegram-xxx.run.app/webhook)');
    process.exit(1);
  }

  const body: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
  };
  if (secret) body.secret_token = secret;

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  console.log('Webhook set:', JSON.stringify(result, null, 2));

  // Verify
  const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const infoResult = await info.json();
  console.log('Webhook info:', JSON.stringify(infoResult, null, 2));
}

main().catch(console.error);
