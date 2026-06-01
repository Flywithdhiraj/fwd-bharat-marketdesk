const { Notification } = require('electron');

function compactNotificationText(value = '', maxLength = 120) {
 const text = String(value || '')
  .replace(/\s*\n+\s*/g, ' | ')
  .replace(/\s{2,}/g, ' ')
  .trim();
 if (text.length <= maxLength) return text;
 return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function normalizeDesktopNotification(message = {}) {
 const rawTitle = message.title || message.options?.title || 'FWD Bharat MarketDesk';
 const rawBody = message.body || message.message || message.options?.message || '';
 const title = compactNotificationText(rawTitle, 72)
  .replace(/^\[Current\]\s*/i, '')
  .replace(/^FWD Bharat MarketDesk(?: \(NSE\/BSE\))?\s*[-:|]\s*/i, '');
 const body = compactNotificationText(rawBody, 132);
 const urgency = String(message.urgency || message.priority || '').toLowerCase();
 return {
  title: title || 'FWD Bharat MarketDesk',
  body,
  urgency: urgency === 'critical' || urgency === 'high' ? 'critical' : 'normal',
 };
}

function createDesktopNotifications({ app, errorJournal } = {}) {
 function notify(message = {}) {
  const { title, body, urgency } = normalizeDesktopNotification(message);
  try {
   if (Notification.isSupported()) {
    const notification = new Notification({
     title,
     body,
     silent: false,
     urgency,
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
