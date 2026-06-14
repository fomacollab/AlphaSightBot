/**
 * Minimal structured logger wrapper. The goal is not to be fancy, but to keep
 * log lines consistent across boot, handlers, scheduling, and external calls.
 */
function info(scope, message, meta) {
  if (meta === undefined) console.log(`[${scope}] ${message}`);
  else console.log(`[${scope}] ${message}`, meta);
}

function warn(scope, message, meta) {
  if (meta === undefined) console.warn(`[${scope}] ${message}`);
  else console.warn(`[${scope}] ${message}`, meta);
}

function error(scope, message, meta) {
  if (meta === undefined) console.error(`[${scope}] ${message}`);
  else console.error(`[${scope}] ${message}`, meta);
}

module.exports = { info, warn, error };
