const botState = require('../services/botState');

async function maintenanceMiddleware(ctx, next) {
  if (botState.get() || ctx.state.isAdmin) return next();
  return undefined;
}

module.exports = maintenanceMiddleware;
