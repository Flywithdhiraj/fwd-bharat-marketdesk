(function initFwdAppLock() {
 'use strict';

 const native = globalThis.fwdDesktopNative;
 const state = {
 configured: false,
 unlocked: false,
 totpEnabled: false,
 setupResult: null,
 };

 function $(id) {
 return document.getElementById(id);
 }

 function send(type, payload = {}) {
 if (!native?.sendNativeMessage) {
 return Promise.resolve({ ok: true, configured: false, unlocked: true, totpEnabled: false });
 }
 return native.sendNativeMessage({ type, ...payload });
 }

 function setMessage(message = '', tone = '') {
 const el = $('appLockMessage');
 if (!el) return;
 el.textContent = message;
 el.className = `app-lock-message ${tone || ''}`.trim();
 }

 function setMode(mode) {
 document.body.dataset.appLockMode = mode;
 const setup = $('appLockSetup');
 const login = $('appLockLogin');
 const recovery = $('appLockRecovery');
 const unlocked = $('appLockUnlocked');
 if (setup) setup.hidden = mode !== 'setup';
 if (login) login.hidden = mode !== 'login';
 if (recovery) recovery.hidden = mode !== 'recovery';
 if (unlocked) unlocked.hidden = mode !== 'unlocked';
 const title = $('appLockFormTitle');
 const copy = $('appLockFormCopy');
 const content = {
 setup: ['Set up secure access', 'Create a local password before opening private trading data and order controls.'],
 login: ['Unlock Desk', 'Use one password. Open the desk only when the setup, risk, and action are clear.'],
 recovery: ['Reset access', 'Enter your recovery code and create a new password for this device.'],
 unlocked: ['Security details', 'Save these details now. They are shown only after setup or reset.'],
 }[mode] || ['Unlock Desk', 'Use one password. Open the desk only when the setup, risk, and action are clear.'];
 if (title) title.textContent = content[0];
 if (copy) copy.textContent = content[1];
 }

 function showOverlay(show) {
 const overlay = $('appLockOverlay');
 if (!overlay) return;
 overlay.hidden = !show;
 document.body.classList.toggle('app-is-locked', show);
 }

 function renderStatus() {
 const button = $('btnAppLogout');
 if (button) {
 button.hidden = !state.configured || !state.unlocked;
 if (button.parentElement) button.parentElement.hidden = button.hidden;
 button.textContent = 'Logout';
 button.title = 'Lock FWD Bharat MarketDesk';
 }
 if (!native?.sendNativeMessage) {
 showOverlay(false);
 setMode('unlocked');
 globalThis.FWDDesktopRuntime?.start?.();
 return;
 }
 if (!state.configured) {
 showOverlay(true);
 setMode('setup');
 setMessage('Create a local password before using this workspace.', '');
 return;
 }
 if (!state.unlocked) {
  showOverlay(true);
  setMode('login');
 const codeField = $('appLockLoginCodeWrap');
 if (codeField) codeField.hidden = !state.totpEnabled;
 setMessage(state.totpEnabled
 ? 'Enter your password and Microsoft Authenticator code.'
 : 'Enter your password to continue.', '');
 return;
 }
 showOverlay(false);
 setMode('unlocked');
 }

 function applyStatus(result = {}) {
 state.configured = !!result.configured;
 state.unlocked = !!result.unlocked;
 state.totpEnabled = !!result.totpEnabled;
 if (!state.configured || state.unlocked) {
  globalThis.FWDDesktopRuntime?.start?.();
 } else {
  globalThis.FWDDesktopRuntime?.stop?.();
 }
 renderStatus();
 }

 function renderQr(dataUrl) {
 const mount = $('appLockQr');
 if (!mount || !dataUrl) return;
 mount.replaceChildren();
 const img = document.createElement('img');
 img.src = String(dataUrl || '');
 img.alt = 'Microsoft Authenticator setup QR';
 mount.appendChild(img);
 mount.hidden = false;
 }

 function clearSetupSecrets() {
 state.setupResult = null;
 const manualKey = $('appLockManualKey');
 const recovery = $('appLockRecoveryDisplay');
 const qr = $('appLockQr');
 if (manualKey) manualKey.textContent = '';
 if (recovery) recovery.textContent = '';
 if (qr) {
 qr.replaceChildren();
 qr.hidden = true;
 }
 }

 function installLogoutButton() {
 const launchGroup = document.querySelector('.size-controls');
 if (!launchGroup || $('btnAppLogout')) return;
 const button = document.createElement('button');
 button.className = 'sz-btn app-lock-logout-btn';
 button.id = 'btnAppLogout';
 button.type = 'button';
 button.hidden = true;
 button.addEventListener('click', async () => {
 const result = await send('auth_logout');
 applyStatus(result);
 });
 launchGroup.appendChild(button);
 }

 async function setupAppLock(event) {
 event?.preventDefault();
 const password = $('appLockSetupPassword')?.value || '';
 const confirm = $('appLockSetupConfirm')?.value || '';
 const totpEnabled = !!$('appLockSetupTotp')?.checked;
 if (password.length < 8) {
 setMessage('Use at least 8 characters for the app password.', 'bad');
 return;
 }
 if (password !== confirm) {
 setMessage('Password and confirm password do not match.', 'bad');
 return;
 }
 const result = await send('auth_setup', { password, totpEnabled });
 if (!result.ok) {
 setMessage(result.error || 'Could not set app lock.', 'bad');
 return;
 }
 state.setupResult = result;
 applyStatus(result);
 if (result.totpEnabled) {
 showOverlay(true);
 setMode('unlocked');
 const manualKey = $('appLockManualKey');
 const recovery = $('appLockRecoveryDisplay');
 if (manualKey) manualKey.textContent = result.manualKey || '';
 // SEC-05: otpauthUrl is no longer sent from main process; URI field removed
 if (recovery) recovery.textContent = result.recoveryCode || '';
 if (result.qrDataUrl) renderQr(result.qrDataUrl);
 setTimeout(clearSetupSecrets, 120000);
 setMessage('Microsoft Authenticator is enabled. Add this setup key now and keep it private.', 'good');
 } else {
 const recovery = $('appLockRecoveryDisplay');
 const manualKey = $('appLockManualKey');
 const qr = $('appLockQr');
 if (manualKey) manualKey.textContent = 'Not enabled';
 if (qr) qr.hidden = true;
 if (recovery) recovery.textContent = result.recoveryCode || '';
 setTimeout(clearSetupSecrets, 120000);
 showOverlay(true);
 setMode('unlocked');
 setMessage('App lock is enabled.', 'good');
 }
 }

 async function loginAppLock(event) {
 event?.preventDefault();
 const result = await send('auth_login', {
 password: $('appLockLoginPassword')?.value || '',
 totpCode: $('appLockLoginCode')?.value || '',
 });
 if (!result.ok) {
 setMessage(result.error || 'Login failed.', 'bad');
 return;
 }
 $('appLockLoginPassword').value = '';
 const code = $('appLockLoginCode');
 if (code) code.value = '';
 applyStatus(result);
 }

 async function resetPassword(event) {
 event?.preventDefault();
 const nextPassword = $('appLockRecoveryPassword')?.value || '';
 const confirm = $('appLockRecoveryConfirm')?.value || '';
 if (nextPassword.length < 8) {
 setMessage('Use at least 8 characters for the new password.', 'bad');
 return;
 }
 if (nextPassword !== confirm) {
 setMessage('New password and confirm password do not match.', 'bad');
 return;
 }
 const result = await send('auth_reset_password', {
 recoveryCode: $('appLockRecoveryCode')?.value || '',
 newPassword: nextPassword,
 });
 if (!result.ok) {
 setMessage(result.error || 'Password reset failed.', 'bad');
 return;
 }
 const recovery = $('appLockRecoveryDisplay');
 const manualKey = $('appLockManualKey');
 const qr = $('appLockQr');
 if (manualKey) manualKey.textContent = 'Existing Authenticator setup is unchanged';
 if (qr) qr.hidden = true;
 if (recovery) recovery.textContent = result.recoveryCode || '';
 setTimeout(clearSetupSecrets, 120000);
 applyStatus(result);
 showOverlay(true);
 setMode('unlocked');
 setMessage('Password reset. Save the new recovery code now.', 'good');
 }

 function bind() {
 installLogoutButton();
 $('appLockSetup')?.addEventListener('submit', setupAppLock);
 $('appLockLogin')?.addEventListener('submit', loginAppLock);
 $('appLockRecovery')?.addEventListener('submit', resetPassword);
 document.querySelector('.app-lock-nav-login')?.addEventListener('click', () => {
 $('appLockLoginPassword')?.focus();
 });
 $('appLockShowRecovery')?.addEventListener('click', () => {
 setMode('recovery');
 setMessage('Use your recovery code to set a new app password.', '');
 });
 $('appLockBackToLogin')?.addEventListener('click', () => {
 setMode('login');
 setMessage('Enter your password to unlock the workspace.', '');
 });
 $('appLockContinue')?.addEventListener('click', () => {
 clearSetupSecrets();
 showOverlay(false);
 setMode('unlocked');
 });
 $('appLockCopyKey')?.addEventListener('click', async () => {
 const text = $('appLockManualKey')?.textContent || '';
 if (!text) return;
 await navigator.clipboard?.writeText(text).catch(() => {});
 setMessage('Setup key copied.', 'good');
 });
 $('appLockCopyRecovery')?.addEventListener('click', async () => {
 const text = $('appLockRecoveryDisplay')?.textContent || '';
 if (!text) return;
 await navigator.clipboard?.writeText(text).catch(() => {});
 setMessage('Recovery code copied.', 'good');
 });
 }

 document.addEventListener('DOMContentLoaded', async () => {
 bind();
 const result = await send('auth_status');
 applyStatus(result);
 });

 globalThis.FWDAppLock = Object.freeze({
 getStatus: () => ({ ...state }),
 refresh: async () => {
 const result = await send('auth_status');
 applyStatus(result);
 return result;
 },
  updateSecurity: async (payload = {}) => {
  const result = await send('auth_update_security', payload);
  if (result?.ok) applyStatus(result);
  return result;
  },
 clearSetupSecrets,
 });
}());
