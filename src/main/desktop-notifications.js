const { Notification } = require('electron');

function createDesktopNotifications({ app, errorJournal } = {}) {
 function notify(message = {}) {
  const title = String(message.title || message.options?.title || 'FWD TradeDesk Pro').trim();
  const body = String(message.body || message.message || message.options?.message || '').trim();
  const urgency = String(message.urgency || message.priority || '').toLowerCase();
  try {
   if (Notification.isSupported()) {
    const notification = new Notification({
     title,
     body,
     silent: false,
     urgency: urgency === 'critical' || urgency === 'high' ? 'critical' : 'normal',
     icon: app ? `${app.getAppPath()}\\src\\renderer\\icons\\icon48.png` : undefined,
    });
    notification.show();
    return { ok: true, native: true };
   }
  } catch (error) {
   errorJournal?.append?.('desktop-notification', error, { title, body });
  }
  process.stdout.write('\x07');
  return { ok: true, native: false };
 }

 return { notify };
}

module.exports = { createDesktopNotifications };
