const _Q = require('queue-promise');
const Queue = _Q.default ?? _Q;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const tgQueue = new Queue({
  concurrent: 1,
  // Keep Telegram sends under ~30 messages/second on the shared queue.
  interval: 34,
  start: true,
});

tgQueue.on('reject', (err) => console.error('[queue] telegram queue error:', err));

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    tgQueue.enqueue(async () => {
      try {
        return resolve(await fn());
      } catch (err) {
        reject(err);
        throw err;
      }
    });
  });
}

async function withRetry(fn, maxRetries = 5) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (err) {
      const retryAfter = err?.response?.parameters?.retry_after;
      if (err?.response?.error_code === 429 && retryAfter) {
        await sleep(retryAfter * 1000);
        retries += 1;
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Max retries (${maxRetries}) exceeded`);
}

function isSkippableTelegramError(err) {
  const description = String(err?.description || err?.response?.description || err?.message || '').toLowerCase();
  return (
    description.includes('bot was blocked by the user') ||
    description.includes('user is deactivated') ||
    description.includes('chat not found') ||
    description.includes('forbidden: bot was blocked') ||
    description.includes('have no rights to send a message')
  );
}

module.exports = { enqueue, withRetry, isSkippableTelegramError };
