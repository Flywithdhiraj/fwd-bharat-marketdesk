const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

exports.default = async function afterPackBranding(context) {
  if (context.electronPlatformName !== 'win32') return;

  const productName = 'FWD TradeDesk Pro';
  const version = context.packager.appInfo.version || '0.1.0';
  const exePath = path.join(context.appOutDir, `${productName}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'src', 'renderer', 'icons', 'fwd-tradedesk-pro.ico');
  const rceditPath = path.join(context.packager.projectDir, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');
  const localesDir = path.join(context.appOutDir, 'locales');

  if (fs.existsSync(localesDir)) {
    for (const name of fs.readdirSync(localesDir)) {
      if (name.toLowerCase() !== 'en-us.pak') {
        fs.rmSync(path.join(localesDir, name), { force: true });
      }
    }
  }

  execFileSync(rceditPath, [
    exePath,
    '--set-icon', iconPath,
    '--set-file-version', version,
    '--set-product-version', version,
    '--set-version-string', 'CompanyName', productName,
    '--set-version-string', 'FileDescription', productName,
    '--set-version-string', 'InternalName', productName,
    '--set-version-string', 'OriginalFilename', `${productName}.exe`,
    '--set-version-string', 'ProductName', productName,
    '--set-version-string', 'LegalCopyright', `Copyright (c) 2026 ${productName}`,
    '--set-version-string', 'LegalTrademarks', productName,
  ], { stdio: 'inherit' });
};
