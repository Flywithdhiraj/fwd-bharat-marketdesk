globalThis.v16LiveAccountSyncEnabled = globalThis.v16LiveAccountSyncEnabled !== false;
globalThis.v16LiveOrderPreviewChartEnabled = globalThis.v16LiveOrderPreviewChartEnabled !== false;
globalThis.deltaMarketDataMode = globalThis.deltaMarketDataMode || 'auto';

const {
 sanitizeAutoTradeSettings: settingsSanitizeAutoTradeSettings,
 sanitizeDcaBotSettings: settingsSanitizeDcaBotSettings,
 sanitizeMarketDataMode: settingsSanitizeMarketDataMode,
 sanitizeMarketIndexSettings: settingsSanitizeMarketIndexSettings,
 sanitizeKeyLevelSettings: settingsSanitizeKeyLevelSettings,
 sanitizeChartDefaults: settingsSanitizeChartDefaults,
 sanitizeRiskTemplates: settingsSanitizeRiskTemplates,
 sanitizeChartCacheEnabled: settingsSanitizeChartCacheEnabled,
} = globalThis.FWDTradeDeskShared;
const fwdTradeDeskOptionsSettingsApi = globalThis.FWDTradeDeskOptions || globalThis.FWDTradeDeskOptionsShared || {};
const settingsSanitizeOptionsAutoTradeSettings = typeof fwdTradeDeskOptionsSettingsApi.sanitizeOptionsAutoTradeSettings === 'function'
 ? fwdTradeDeskOptionsSettingsApi.sanitizeOptionsAutoTradeSettings
 : (typeof fwdTradeDeskOptionsSettingsApi.sanitizeOptionsAutomationSettings === 'function'
 ? fwdTradeDeskOptionsSettingsApi.sanitizeOptionsAutomationSettings
 : (value => value || {}));

function renderRuntimeHealthLine(id, text = '') {
 const el = document.getElementById(id);
 if (el) el.textContent = text;
}

function formatRuntimeHealthAge(ts = 0) {
 const ageMs = Math.max(0, Date.now() - Number(ts || 0));
 if (!(ageMs > 0)) return 'just now';
 if (ageMs < 60000) return `${Math.round(ageMs / 1000)}s ago`;
 if (ageMs < 3600000) return `${Math.round(ageMs / 60000)}m ago`;
 return `${Math.round(ageMs / 3600000)}h ago`;
}

function refreshRuntimeHealthStatus() {
 chrome.runtime.sendMessage({ action: 'getRuntimeHealth' }, response => {
 const quota = response?.quota || null;
 const cache = response?.candleCache || null;
 const quotaText = !response?.ok
 ? 'Runtime health unavailable'
 : quota?.severity === 'critical'
 ? `Cooling down ${Math.ceil(Number(quota?.backoffRemainingMs || 0) / 1000)}s after ${Number(quota?.total429 || 0)} rate-limit hit(s)`
 : quota?.severity === 'warn'
 ? `Recent rate-limit warning (${Number(quota?.total429 || 0)} total 429s, last ${formatRuntimeHealthAge(quota?.last429At)})`
 : `Normal (${Number(quota?.totalRequests || 0)} public requests, last ok ${quota?.lastOkAt ? formatRuntimeHealthAge(quota.lastOkAt) : 'n/a'})`;
 const cacheText = !response?.ok
 ? 'Cache status unavailable'
 : !cache?.supported
 ? 'IndexedDB cache unavailable in this browser context'
 : `${Number(cache?.entries || 0)} symbol/resolution sets cached | latest sync ${cache?.latestUpdatedAt ? formatRuntimeHealthAge(cache.latestUpdatedAt) : 'never'}`;
 renderRuntimeHealthLine('sApiQuotaHealth', quotaText);
 renderRuntimeHealthLine('sCandleCacheHealth', cacheText);
 });
}

const SETTINGS_STRATEGY_PRESETS = Object.freeze({
 manual_clean: {
 label: 'Manual Clean',
 strategy: { minScore: 15, alertScore: 65, maxCoins: 500, tf1: '1d', tf2: '15m' },
 auto: { minScore: 72, paperTrackingEnabled: true, entryTriggerRequired: true, riskQualityRequired: true, setupPerformanceMinSample: 20 },
 risk: { atrStopMultiplier: 1.5, targetRR: 2 },
 chart: { defaultPreset: 'key', showOrders: false, showVwap: false },
 autoScan: false,
 autoScanInterval: 5,
 liveAutoTrade: false,
 },
 breakout_validation: {
 label: 'Breakout Validation',
 strategy: { minScore: 24, alertScore: 78, maxCoins: 350, tf1: '1d', tf2: '15m' },
 auto: { minScore: 78, paperTrackingEnabled: true, entryTriggerMode: 'balanced', entryTriggerRequired: true, riskQualityRequired: true, setupPerformanceMinSample: 30 },
 risk: { atrStopMultiplier: 1.3, targetRR: 2.5 },
 chart: { defaultPreset: 'analysis', showOrders: true, showVwap: false },
 autoScan: true,
 autoScanInterval: 5,
 liveAutoTrade: false,
 },
 trend_follow: {
 label: 'Trend Follow',
 strategy: { minScore: 20, alertScore: 72, maxCoins: 450, tf1: '1d', tf2: '1h' },
 auto: { minScore: 72, paperTrackingEnabled: true, entryTriggerMode: 'balanced', entryTriggerRequired: true, riskQualityRequired: true, setupPerformanceMinSample: 35 },
 risk: { atrStopMultiplier: 1.8, targetRR: 2.4 },
 chart: { defaultPreset: 'key', showOrders: true, showVwap: true },
 autoScan: true,
 autoScanInterval: 10,
 liveAutoTrade: false,
 },
 mean_reversion: {
 label: 'Mean Reversion',
 strategy: { minScore: 24, alertScore: 76, maxCoins: 250, tf1: '4h', tf2: '15m' },
 auto: { minScore: 76, paperTrackingEnabled: true, entryTriggerMode: 'conservative', entryTriggerRequired: true, riskQualityRequired: true, setupPerformanceMinSample: 40 },
 risk: { atrStopMultiplier: 1.1, targetRR: 1.6 },
 chart: { defaultPreset: 'analysis', showOrders: true, showVwap: true },
 autoScan: true,
 autoScanInterval: 5,
 liveAutoTrade: false,
 },
 paper_first: {
 label: 'Paper First',
 strategy: { minScore: 18, alertScore: 70, maxCoins: 500, tf1: '1d', tf2: '15m' },
 auto: { minScore: 70, paperTrackingEnabled: true, entryTriggerMode: 'balanced', entryTriggerRequired: true, riskQualityRequired: true, setupPerformanceMinSample: 20 },
 risk: { atrStopMultiplier: 1.5, targetRR: 2 },
 chart: { defaultPreset: 'key', showOrders: true, showVwap: false },
 autoScan: true,
 autoScanInterval: 5,
 liveAutoTrade: false,
 },
});

function setSettingsInputValue(id, value) {
 const el = document.getElementById(id);
 if (!el || value == null) return;
 if (el.type === 'checkbox') el.checked = !!value;
 else el.value = String(value);
}

function applySettingsStrategyPreset(presetId = '') {
 const preset = SETTINGS_STRATEGY_PRESETS[presetId];
 const status = document.getElementById('strategyProfilePresetStatus');
 if (!preset) {
 if (status) status.textContent = 'Unknown strategy preset.';
 return;
 }
 setSettingsInputValue('sMinScore', preset.strategy.minScore);
 setSettingsInputValue('sAlertScore', preset.strategy.alertScore);
 setSettingsInputValue('sMaxCoins', preset.strategy.maxCoins);
 setSettingsInputValue('sTF1', preset.strategy.tf1);
 setSettingsInputValue('sTF2', preset.strategy.tf2);
 setSettingsInputValue('sAutoScan', preset.autoScan);
 setSettingsInputValue('sAutoInterval', preset.autoScanInterval);
 setSettingsInputValue('sAutoTradeEnabled', preset.liveAutoTrade);
 setSettingsInputValue('sAutoTradeMinScore', preset.auto.minScore);
 setSettingsInputValue('sAutoTradePaperTracking', preset.auto.paperTrackingEnabled);
 setSettingsInputValue('sAutoTradeEntryTriggerMode', preset.auto.entryTriggerMode || 'balanced');
 setSettingsInputValue('sAutoTradeEntryTriggerRequired', preset.auto.entryTriggerRequired);
 setSettingsInputValue('sAutoTradeSetupPerformanceMinSample', preset.auto.setupPerformanceMinSample);
 setSettingsInputValue('sAutoTradeRiskQualityRequired', preset.auto.riskQualityRequired);
 setSettingsInputValue('sRiskTemplateAtrStopMultiplier', preset.risk.atrStopMultiplier);
 setSettingsInputValue('sRiskTemplateTargetRR', preset.risk.targetRR);
 setSettingsInputValue('sChartDefaultPreset', preset.chart.defaultPreset);
 setSettingsInputValue('sChartShowOrders', preset.chart.showOrders);
 setSettingsInputValue('sChartShowVwap', preset.chart.showVwap);
 if (status) status.textContent = `${preset.label} applied to the form. Review the fields, then Save Strategy.`;
 document.querySelectorAll('[data-settings-profile-preset]').forEach(button => {
 button.classList.toggle('active', button.dataset.settingsProfilePreset === presetId);
 });
 globalThis.v16RenderPaperModeSettingsPanel?.();
}

function loadStrategy() {
 chrome.storage.local.get(['strategy', 'autoScan', 'autoScanInterval', 'externalBackup', 'autoTrade', 'autoTradeSettings', 'autoTradeLog', 'dcaBotSettings', 'dcaBotState', 'dcaBotLog', 'optionsAutoTradeSettings'], async d => {
 const s = d.strategy || {};

 const keyLevelSettings = settingsSanitizeKeyLevelSettings(s.keyLevelSettings || {});

 const chartDefaults = settingsSanitizeChartDefaults(s.chartDefaults || {});

 const riskTemplates = settingsSanitizeRiskTemplates(s.riskTemplates || {});

 const chartCacheEnabled = settingsSanitizeChartCacheEnabled(s.chartCacheEnabled);
 const marketDataMode = settingsSanitizeMarketDataMode(s.marketDataMode);
 const tg = await loadStoredTelegramConfig();
 const ext = sanitizeExternalBackupConfig(d.externalBackup || {});
 const autoScanInterval = sanitizeAutoScanInterval(d.autoScanInterval ?? s.autoScanInterval);
 const autoScan = d.autoScan ?? s.autoScan ?? false;
 document.getElementById('sE1').value = s.ema1 ?? 9;
 document.getElementById('sE2').value = s.ema2 ?? 30;
 document.getElementById('sE3').value = s.ema3 ?? 100;
 document.getElementById('sOBV').value = s.obvPeriod ?? 50;
 document.getElementById('sTF1').value = s.tf1 ?? '1d';
 document.getElementById('sTF2').value = s.tf2 ?? '15m';
 document.getElementById('sMinScore').value = s.minScore ?? 15;
 document.getElementById('sAlertScore').value = s.alertScore ?? 65;
 document.getElementById('sMaxCoins').value = s.maxCoins ?? 500;
 document.getElementById('sMinVol').value = s.minVolume ?? 0;
 document.getElementById('sFundingMinVol').value = s.fundingMinVolume ?? 100000;
 document.getElementById('sReportDisplayCurrency').value = normalizeReportDisplayCurrency(s.reportDisplayCurrency || 'USD');
 const reportDisplayUsdInrRate = normalizeReportDisplayUsdInrRate(s.reportDisplayUsdInrRate || DEFAULT_REPORT_DISPLAY_USD_INR_RATE);
 const reportDisplayUsdInrRateInput = document.getElementById('sReportDisplayUsdInrRate');
 if (reportDisplayUsdInrRateInput) reportDisplayUsdInrRateInput.value = String(reportDisplayUsdInrRate);
 setReportDisplayCurrency(s.reportDisplayCurrency || 'USD');
 setReportDisplayUsdInrRate(reportDisplayUsdInrRate);
 const marketIndexSettings = settingsSanitizeMarketIndexSettings(s.marketIndexSettings || {});
 document.getElementById('sMarketIndexMaxConstituents').value = marketIndexSettings.maxConstituents;
 document.getElementById('sMarketIndexRebalanceDays').value = marketIndexSettings.rebalanceDays;
 document.getElementById('sMarketIndexExcludedSymbols').value = marketIndexSettings.excludedSymbols.join(', ');
 document.getElementById('sAutoInterval').value = String(autoScanInterval);
 document.getElementById('sAutoScan').checked = autoScan;
 document.getElementById('sLiveAccountSync').checked = s.liveAccountSync !== false;
 globalThis.v16LiveAccountSyncEnabled = s.liveAccountSync !== false;
 document.getElementById('sLiveOrderPreviewChart').checked = s.liveOrderPreviewChart !== false;
 globalThis.v16LiveOrderPreviewChartEnabled = s.liveOrderPreviewChart !== false;
 globalThis.v16SyncLiveAccountSyncButtons?.();
 // Auto-Trade settings
 const ats = settingsSanitizeAutoTradeSettings(d.autoTradeSettings || {});
 document.getElementById('sAutoTradeMinScore').value = ats.minScore;
 document.getElementById('sAutoTradeUSD').value = ats.autoSizeUSD;
 document.getElementById('sAutoTradeMinLiquidityUSD').value = ats.minLiquidityUSD;
 document.getElementById('sAutoTradeProbationMinLiquidityUSD').value = ats.probationMinLiquidityUSD;
 document.getElementById('sAutoTradeValidatedMaxSpreadPct').value = ats.validatedMaxSpreadPct;
 document.getElementById('sAutoTradeProbationMaxSpreadPct').value = ats.probationMaxSpreadPct;
 document.getElementById('sAutoTradeProbationSizePct').value = ats.probationSizePct;
 document.getElementById('sAutoTradeMaxPerScan').value = ats.maxPerScan;
 document.getElementById('sAutoTradeMaxPerDay').value = ats.maxPerDay;
 document.getElementById('sAutoTradeMaxConcurrent').value = ats.maxConcurrent;
 document.getElementById('sAutoTradeMaxAdverseFundingRate').value = ats.maxAdverseFundingRatePct;
 document.getElementById('sAutoTradeFundingExitMinutes').value = ats.fundingCloseMinutesBeforeSettlement;
 document.getElementById('sAutoTradeFundingMinHoldHours').value = ats.fundingMinHoldHours;
 document.getElementById('sAutoTradeFundingExitOnlyProfit').checked = ats.fundingCloseOnlyInProfit;
 document.getElementById('sAutoTradeDailyLoss').value = ats.dailyLossLimitUSD;
 document.getElementById('sAutoTradeEntryMode').value = ats.entryMode;
 document.getElementById('sAutoTradeReverseSignals').checked = ats.reverseSignals;
 document.getElementById('sAutoTradeCooldown').value = ats.cooldownSec;
 document.getElementById('sAutoTradePaperTracking').checked = ats.paperTrackingEnabled;
 document.getElementById('sAutoTradeEntryTriggerMode').value = ats.entryTriggerMode;
 document.getElementById('sAutoTradeEntryTriggerRequired').checked = ats.entryTriggerRequired;
 document.getElementById('sAutoTradeSetupPerformanceMinSample').value = ats.setupPerformanceMinSample;
 document.getElementById('sAutoTradeRiskQualityRequired').checked = ats.riskQualityRequired;
 document.getElementById('sAutoTradeRiskMinRewardRisk').value = ats.riskQualityMinRewardRisk;
 document.getElementById('sAutoTradeRiskMaxStopDistancePct').value = ats.riskQualityMaxStopDistancePct;
 document.getElementById('sAutoTradeRiskMaxEntryDistancePct').value = ats.riskQualityMaxEntryDistancePct;
 document.getElementById('sAutoTradeNotifyBrowser').checked = ats.notifyBrowser;
 document.getElementById('sAutoTradeNotifyTelegram').checked = ats.notifyTelegram;
 document.getElementById('sAutoTradeEnabled').checked = d.autoTrade ?? false;
 const dca = settingsSanitizeDcaBotSettings(d.dcaBotSettings || {});
 document.getElementById('sDcaBotEnabled').checked = dca.enabled;
 document.getElementById('sDcaBotSymbol').value = dca.symbol;
 document.getElementById('sDcaBotSide').value = dca.side;
 document.getElementById('sDcaBotOrderSizeUSD').value = dca.orderSizeUSD;
 document.getElementById('sDcaBotMaxOrders').value = dca.maxOrders;
 document.getElementById('sDcaBotMaxDailyUSD').value = dca.maxDailyUSD;
 document.getElementById('sDcaBotIntervalMinutes').value = dca.intervalMinutes;
 document.getElementById('sDcaBotPriceStepPct').value = dca.priceStepPct;
 document.getElementById('sDcaBotTakeProfitPct').value = dca.takeProfitPct;
 document.getElementById('sDcaBotStopLossPct').value = dca.stopLossPct;
 document.getElementById('sDcaBotEntryMode').value = dca.entryMode;
 document.getElementById('sDcaBotNotifyBrowser').checked = dca.notifyBrowser;
 document.getElementById('sDcaBotNotifyTelegram').checked = dca.notifyTelegram;
 const dcaState = d.dcaBotState || {};
 const dcaLog = Array.isArray(d.dcaBotLog) ? d.dcaBotLog : [];
 const dcaStatus = document.getElementById('sDcaBotStatus');
 if (dcaStatus) {
 const status = String(dcaState.status || (dca.enabled ? 'ready' : 'off'));
 const reason = String(dcaState.reason || '').trim();
 const count = Number(dcaState.orderCount || 0);
 const spent = Number(dcaState.dailySpentUSD || 0);
 dcaStatus.textContent = dca.enabled
 ? `${status} | ${count}/${dca.maxOrders} orders | $${spent.toFixed(2)} / $${Number(dca.maxDailyUSD || 0).toFixed(2)} today${reason ? ` | ${reason}` : ''}`
 : `Off | ${dcaLog.length} saved DCA log item${dcaLog.length === 1 ? '' : 's'}`;
 }
 refreshRuntimeHealthStatus();
 const oats = settingsSanitizeOptionsAutoTradeSettings(d.optionsAutoTradeSettings || {});
 document.getElementById('sOptionsAutoTradeEnabled').checked = oats.enabled;
 document.getElementById('sOptionsAutoTradeUnderlyings').value = oats.underlyings.join(', ');
 document.getElementById('sOptionsAutoTradeMinScore').value = oats.minTradeQuality;
 document.getElementById('sOptionsAutoTradeMinDte').value = oats.minDte;
 document.getElementById('sOptionsAutoTradeMaxDte').value = oats.maxDte;
 document.getElementById('sOptionsAutoTradeTargetDelta').value = oats.targetDelta;
 document.getElementById('sOptionsAutoTradeDeltaTolerance').value = oats.deltaTolerance;
 document.getElementById('sOptionsAutoTradeMinOi').value = oats.minOiContracts;
 document.getElementById('sOptionsAutoTradeMaxSpread').value = oats.maxBidAskSpreadPct;
 document.getElementById('sOptionsAutoTradeMinPremiumScore').value = oats.minPremiumScore;
 document.getElementById('sOptionsAutoTradeMaxPerDay').value = oats.maxStrategiesPerDay;
 document.getElementById('sOptionsAutoTradeMaxConcurrent').value = oats.maxConcurrentStrategies;
 document.getElementById('sOptionsAutoTradeMaxRisk').value = oats.maxRiskUSD;
 document.getElementById('sOptionsAutoTradeEntryMode').value = oats.entryMode;
 document.getElementById('sOptionsAutoTradeAllowUndefinedRisk').checked = oats.allowUndefinedRisk;
 document.getElementById('sOptionsAutoTradeNotifyBrowser').checked = oats.notifyBrowser;
 document.getElementById('sOptionsAutoTradeNotifyTelegram').checked = oats.notifyTelegram;
 document.getElementById('sStraddleEnabled').checked = oats.straddleEnabled;
 document.getElementById('sStraddleLegStopLossPct').value = oats.legStopLossPct;
 document.getElementById('sStraddleReentryThresholdPct').value = oats.reentryThresholdPct;
 document.getElementById('sStraddleMaxReentries').value = oats.maxReentries;
 document.getElementById('sStraddleUniversalProfitTarget').value = oats.universalProfitTarget;
 document.getElementById('sStraddleUniversalLossLimit').value = oats.universalLossLimit;
 document.getElementById('sStraddleCloseMinutesBeforeExpiry').value = oats.closeMinutesBeforeExpiry;
 document.getElementById('sStraddleExpiryPreference').value = oats.straddleExpiryPreference;
 document.getElementById('sStraddleReentryEnabled').checked = oats.reentryEnabled;
 document.getElementById('sNativeStraddlePreferred').checked = oats.nativeStraddlePreferred;
 document.getElementById('sStraddleMinPremiumPerContractUSD').value = oats.minPremiumPerContractUSD;
 document.getElementById('sStraddleMinThetaMarginRatioPct').value = oats.minThetaMarginRatioPct;
 document.getElementById('sStraddleSameDayMinScore').value = oats.sameDayMinScore;
 document.getElementById('sStraddleSameDayMaxSpreadPct').value = oats.sameDayMaxSpreadPct;
 document.getElementById('sStraddlePremiumCapturePct').value = oats.premiumCapturePct;
 document.getElementById('sStraddleEntryOrderMaxAgeMinutes').value = oats.entryOrderMaxAgeMinutes;
 document.getElementById('sAutoSizeEnabled').checked = oats.autoSizeEnabled;
 document.getElementById('sTargetProfitUSD').value = oats.targetProfitUSD;
 globalThis.__fwdTradeDeskOptionsAutoSettings = oats;
 document.getElementById('sKeyPivotLength').value = keyLevelSettings.pivotLength;
 document.getElementById('sKeyPivotMemory').value = keyLevelSettings.pivotMemory;
 document.getElementById('sKeyLevelCount').value = keyLevelSettings.numberOfLevels;
 document.getElementById('sKeyStrengthDisplay').value = keyLevelSettings.displayStrengthAs;
 document.getElementById('sKeyThickness').value = keyLevelSettings.thickness;
 document.getElementById('sKeyShowPivotCircles').checked = keyLevelSettings.showPivotCircles;
 document.getElementById('sKeyShowLevelGlow').checked = keyLevelSettings.showLevelGlow;
 document.getElementById('sChartDefaultPreset').value = chartDefaults.defaultPreset;
 document.getElementById('sChartShowOrders').checked = chartDefaults.showOrders;
 document.getElementById('sChartShowVwap').checked = chartDefaults.showVwap;
 document.getElementById('sChartCacheEnabled').checked = chartCacheEnabled;
 document.getElementById('sMarketDataMode').value = marketDataMode;
 globalThis.deltaMarketDataMode = marketDataMode;
 document.getElementById('sRiskTemplateAtrStopMultiplier').value = String(riskTemplates.default.atrStopMultiplier);
 document.getElementById('sRiskTemplateTargetRR').value = String(riskTemplates.default.targetRR);
 const riskOverrideSymbol = Object.keys(riskTemplates.bySymbol || {})[0] || '';
 const riskOverride = riskTemplates.bySymbol?.[riskOverrideSymbol] || {};
 document.getElementById('sRiskTemplateBySymbol').value = Object.keys(riskTemplates.bySymbol).length
 ? JSON.stringify(riskTemplates.bySymbol)
 : '';
 document.getElementById('sRiskOverrideSymbol').value = riskOverrideSymbol;
 document.getElementById('sRiskOverrideAtrStopMultiplier').value = riskOverride.atrStopMultiplier ?? '';
 document.getElementById('sRiskOverrideTargetRR').value = riskOverride.targetRR ?? '';
 document.getElementById('sNotify').checked = s.notify ?? true;
 document.getElementById('sSound').checked = s.soundAlert ?? true;
 document.getElementById('sAlertTone').value = sanitizeAlertTone(s.alertTone);
 document.getElementById('tgEnabled').checked = !!tg.enabled && !!tg.botToken && !!tg.chatId;
 document.getElementById('tgBotToken').value = tg.botToken || '';
 document.getElementById('tgChatId').value = tg.chatId || '';
 document.getElementById('tgMinScore').value = String(sanitizeTelegramMinScore(tg.minScore, 85));
 document.getElementById('tgHourlySummary').checked = !!tg.hourlySummaryEnabled;
 document.getElementById('sExtBackupEnabled').checked = !!ext.enabled;
 document.getElementById('sExtBackupAuto').checked = !!ext.autoBackup;
 document.getElementById('sExtArchiveEnabled').checked = !!ext.autoArchive;
 document.getElementById('sKeepAlerts').value = String(ext.keepAlerts || KEEP_ALERTS_DEFAULT);
 setBackupPathLabel(ext.folderName || '');

 const pickBtn = document.getElementById('btnPickBackupDir');
 const backupNowBtn = document.getElementById('btnBackupNow');
 const archiveNowBtn = document.getElementById('btnArchiveNow');
 if (!isExternalBackupSupported()) {
 if (pickBtn) pickBtn.disabled = true;
 if (backupNowBtn) backupNowBtn.disabled = true;
 if (archiveNowBtn) archiveNowBtn.disabled = true;
 setBackupStatus('External folder backup is not supported in this browser build.', '#ffc840');
 return;
 }
 idbGetBackupHandle()
 .then(handle => {
 if (!handle) return;
 backupDirHandle = handle;
 const label = ext.folderName || handle.name || '';
 if (label) setBackupPathLabel(label);
 })
 .catch(() => {});
 globalThis.v16RenderPaperModeSettingsPanel?.();
 globalThis.v16RenderSettingsRecoveryCenter?.();
 });
}

FWDTradeDeskUi.delegate('click', '[data-settings-profile-preset]', (_e, presetButton) => {
 applySettingsStrategyPreset(presetButton.dataset.settingsProfilePreset || '');
});

// Delegation: Save Settings
document.addEventListener('click', async (e) => {
 if (e.target?.id !== 'btnSave' && !e.target?.closest('#btnSave')) return;
 const fundingMinVolInput = document.getElementById('sFundingMinVol').value;
 const fundingMinVol = Number(fundingMinVolInput);
 if (!Number.isFinite(fundingMinVol) || fundingMinVol < 0) {
 alert('Funding Min Volume must be a valid number (>= 0).');
 return;
 }

 const autoScanInterval = sanitizeAutoScanInterval(document.getElementById('sAutoInterval').value);
 const autoScan = document.getElementById('sAutoScan').checked;
 const liveAccountSync = document.getElementById('sLiveAccountSync').checked;
 const liveOrderPreviewChart = document.getElementById('sLiveOrderPreviewChart').checked;
 const marketDataMode = settingsSanitizeMarketDataMode(document.getElementById('sMarketDataMode').value);
 const reportDisplayCurrency = normalizeReportDisplayCurrency(document.getElementById('sReportDisplayCurrency')?.value || 'USD');
 const reportDisplayUsdInrRate = normalizeReportDisplayUsdInrRate(document.getElementById('sReportDisplayUsdInrRate')?.value || DEFAULT_REPORT_DISPLAY_USD_INR_RATE);
 const keyLevelSettings = settingsSanitizeKeyLevelSettings({
 pivotLength: document.getElementById('sKeyPivotLength').value,
 pivotMemory: document.getElementById('sKeyPivotMemory').value,
 numberOfLevels: document.getElementById('sKeyLevelCount').value,
 displayStrengthAs: document.getElementById('sKeyStrengthDisplay').value,
 showPivotCircles: document.getElementById('sKeyShowPivotCircles').checked,
 showLevelGlow: document.getElementById('sKeyShowLevelGlow').checked,
 thickness: document.getElementById('sKeyThickness').value,
 });
 const chartDefaults = settingsSanitizeChartDefaults({
 defaultPreset: document.getElementById('sChartDefaultPreset').value,
 showOrders: document.getElementById('sChartShowOrders').checked,
 showVwap: document.getElementById('sChartShowVwap').checked,
 });
 const chartCacheEnabled = settingsSanitizeChartCacheEnabled(document.getElementById('sChartCacheEnabled').checked);
 let riskTemplateBySymbol = {};
 const riskTemplateBySymbolRaw = String(document.getElementById('sRiskTemplateBySymbol').value || '').trim();
 if (riskTemplateBySymbolRaw) {
 try {
 riskTemplateBySymbol = JSON.parse(riskTemplateBySymbolRaw);
 } catch (_) {
 alert('Per-symbol risk overrides must be valid JSON.');
 return;
 }
 }
 const riskOverrideSymbol = String(document.getElementById('sRiskOverrideSymbol')?.value || '').trim().toUpperCase();
 if (riskOverrideSymbol) {
 riskTemplateBySymbol[riskOverrideSymbol] = {
 atrStopMultiplier: document.getElementById('sRiskOverrideAtrStopMultiplier')?.value || undefined,
 targetRR: document.getElementById('sRiskOverrideTargetRR')?.value || undefined,
 };
 }
 const riskTemplates = settingsSanitizeRiskTemplates({
 default: {
 atrStopMultiplier: document.getElementById('sRiskTemplateAtrStopMultiplier').value,
 targetRR: document.getElementById('sRiskTemplateTargetRR').value,
 },
 bySymbol: riskTemplateBySymbol,
 });
 const alertTone = sanitizeAlertTone(document.getElementById('sAlertTone').value);
 const telegram = {
 enabled: document.getElementById('tgEnabled').checked,
 botToken: document.getElementById('tgBotToken').value.trim(),
 chatId: document.getElementById('tgChatId').value.trim(),
 minScore: sanitizeTelegramMinScore(document.getElementById('tgMinScore').value, 85),
 hourlySummaryEnabled: document.getElementById('tgHourlySummary').checked,
 };
 const storedSettings = await storeGet(['externalBackup', 'optionsAutoTradeSettings', 'strategy']);
 const existingExternal = sanitizeExternalBackupConfig(storedSettings.externalBackup || {});
 const existingOptionsAutoTradeSettings = settingsSanitizeOptionsAutoTradeSettings(storedSettings.optionsAutoTradeSettings || {});
 const existingMarketIndexSettings = settingsSanitizeMarketIndexSettings(storedSettings.strategy?.marketIndexSettings || {});
 const externalBackup = {
 enabled: document.getElementById('sExtBackupEnabled').checked,
 autoBackup: document.getElementById('sExtBackupAuto').checked,
 autoArchive: document.getElementById('sExtArchiveEnabled').checked,
 keepAlerts: sanitizeKeepAlerts(document.getElementById('sKeepAlerts').value),
 folderName: document.getElementById('sBackupPath')?.dataset?.folderName || '',
 totalArchived: existingExternal.totalArchived || 0,
 lastArchiveAt: existingExternal.lastArchiveAt || 0,
 lastArchiveFile: existingExternal.lastArchiveFile || '',
 updatedAt: Date.now(),
 };
 if (telegram.enabled && (!telegram.botToken || !telegram.chatId)) {
 alert('Telegram enabled requires both Bot Token and Chat ID.');
 return;
 }
 if (externalBackup.enabled && !externalBackup.folderName) {
 alert('Please choose a backup folder first.');
 return;
 }
 const strat = {
 ema1: +document.getElementById('sE1').value,
 ema2: +document.getElementById('sE2').value,
 ema3: +document.getElementById('sE3').value,
 obvPeriod: +document.getElementById('sOBV').value,
 tf1: document.getElementById('sTF1').value,
 tf2: document.getElementById('sTF2').value,
 minScore: +document.getElementById('sMinScore').value,
 alertScore: +document.getElementById('sAlertScore').value,
 maxCoins: +document.getElementById('sMaxCoins').value,
 minVolume: +document.getElementById('sMinVol').value,
 fundingMinVolume: Math.round(fundingMinVol),
 reportDisplayCurrency,
 reportDisplayUsdInrRate,
 marketIndexSettings: settingsSanitizeMarketIndexSettings({
 maxConstituents: document.getElementById('sMarketIndexMaxConstituents').value,
 rebalanceDays: document.getElementById('sMarketIndexRebalanceDays').value,
 rebuildNonce: existingMarketIndexSettings.rebuildNonce,
 excludedSymbols: document.getElementById('sMarketIndexExcludedSymbols').value,
 }),
 liveAccountSync,
 liveOrderPreviewChart,
 marketDataMode,
 keyLevelSettings,
 chartDefaults,
 riskTemplates,
 chartCacheEnabled,
 notify: document.getElementById('sNotify').checked,
 soundAlert: document.getElementById('sSound').checked,
 alertTone,
 };
 const autoTradeSettings = settingsSanitizeAutoTradeSettings({
 minScore: document.getElementById('sAutoTradeMinScore').value,
 autoSizeUSD: document.getElementById('sAutoTradeUSD').value,
 minLiquidityUSD: document.getElementById('sAutoTradeMinLiquidityUSD').value,
 probationMinLiquidityUSD: document.getElementById('sAutoTradeProbationMinLiquidityUSD').value,
 validatedMaxSpreadPct: document.getElementById('sAutoTradeValidatedMaxSpreadPct').value,
 probationMaxSpreadPct: document.getElementById('sAutoTradeProbationMaxSpreadPct').value,
 probationSizePct: document.getElementById('sAutoTradeProbationSizePct').value,
 maxPerScan: document.getElementById('sAutoTradeMaxPerScan').value,
 maxPerDay: document.getElementById('sAutoTradeMaxPerDay').value,
 maxConcurrent: document.getElementById('sAutoTradeMaxConcurrent').value,
 maxAdverseFundingRatePct: document.getElementById('sAutoTradeMaxAdverseFundingRate').value,
 fundingCloseMinutesBeforeSettlement: document.getElementById('sAutoTradeFundingExitMinutes').value,
 fundingMinHoldHours: document.getElementById('sAutoTradeFundingMinHoldHours').value,
 fundingCloseOnlyInProfit: document.getElementById('sAutoTradeFundingExitOnlyProfit').checked,
 dailyLossLimitUSD: document.getElementById('sAutoTradeDailyLoss').value,
 entryMode: document.getElementById('sAutoTradeEntryMode').value,
 reverseSignals: document.getElementById('sAutoTradeReverseSignals').checked,
 cooldownSec: document.getElementById('sAutoTradeCooldown').value,
 paperTrackingEnabled: document.getElementById('sAutoTradePaperTracking').checked,
 entryTriggerMode: document.getElementById('sAutoTradeEntryTriggerMode').value,
 entryTriggerRequired: document.getElementById('sAutoTradeEntryTriggerRequired').checked,
 setupPerformanceMinSample: document.getElementById('sAutoTradeSetupPerformanceMinSample').value,
 riskQualityRequired: document.getElementById('sAutoTradeRiskQualityRequired').checked,
 riskQualityMinRewardRisk: document.getElementById('sAutoTradeRiskMinRewardRisk').value,
 riskQualityMaxStopDistancePct: document.getElementById('sAutoTradeRiskMaxStopDistancePct').value,
 riskQualityMaxEntryDistancePct: document.getElementById('sAutoTradeRiskMaxEntryDistancePct').value,
 notifyBrowser: document.getElementById('sAutoTradeNotifyBrowser').checked,
 notifyTelegram: document.getElementById('sAutoTradeNotifyTelegram').checked,
 });

 const dcaBotSettings = settingsSanitizeDcaBotSettings({
 enabled: document.getElementById('sDcaBotEnabled').checked,
 symbol: document.getElementById('sDcaBotSymbol').value,
 side: document.getElementById('sDcaBotSide').value,
 orderSizeUSD: document.getElementById('sDcaBotOrderSizeUSD').value,
 maxOrders: document.getElementById('sDcaBotMaxOrders').value,
 maxDailyUSD: document.getElementById('sDcaBotMaxDailyUSD').value,
 intervalMinutes: document.getElementById('sDcaBotIntervalMinutes').value,
 priceStepPct: document.getElementById('sDcaBotPriceStepPct').value,
 takeProfitPct: document.getElementById('sDcaBotTakeProfitPct').value,
 stopLossPct: document.getElementById('sDcaBotStopLossPct').value,
 entryMode: document.getElementById('sDcaBotEntryMode').value,
 notifyBrowser: document.getElementById('sDcaBotNotifyBrowser').checked,
 notifyTelegram: document.getElementById('sDcaBotNotifyTelegram').checked,
 });

 const optionsAutoTradeSettings = settingsSanitizeOptionsAutoTradeSettings({
 ...existingOptionsAutoTradeSettings,
 enabled: document.getElementById('sOptionsAutoTradeEnabled').checked,
 underlyings: document.getElementById('sOptionsAutoTradeUnderlyings').value,
 minTradeQuality: document.getElementById('sOptionsAutoTradeMinScore').value,
 minDte: document.getElementById('sOptionsAutoTradeMinDte').value,
 maxDte: document.getElementById('sOptionsAutoTradeMaxDte').value,
 targetDelta: document.getElementById('sOptionsAutoTradeTargetDelta').value,
 deltaTolerance: document.getElementById('sOptionsAutoTradeDeltaTolerance').value,
 minOiContracts: document.getElementById('sOptionsAutoTradeMinOi').value,
 maxBidAskSpreadPct: document.getElementById('sOptionsAutoTradeMaxSpread').value,
 minPremiumScore: document.getElementById('sOptionsAutoTradeMinPremiumScore').value,
 maxStrategiesPerDay: document.getElementById('sOptionsAutoTradeMaxPerDay').value,
 maxConcurrentStrategies: document.getElementById('sOptionsAutoTradeMaxConcurrent').value,
 maxRiskUSD: document.getElementById('sOptionsAutoTradeMaxRisk').value,
 entryMode: document.getElementById('sOptionsAutoTradeEntryMode').value,
 allowUndefinedRisk: document.getElementById('sOptionsAutoTradeAllowUndefinedRisk').checked,
 notifyBrowser: document.getElementById('sOptionsAutoTradeNotifyBrowser').checked,
 notifyTelegram: document.getElementById('sOptionsAutoTradeNotifyTelegram').checked,
 straddleEnabled: document.getElementById('sStraddleEnabled').checked,
 legStopLossPct: document.getElementById('sStraddleLegStopLossPct').value,
 reentryThresholdPct: document.getElementById('sStraddleReentryThresholdPct').value,
 maxReentries: document.getElementById('sStraddleMaxReentries').value,
 universalProfitTarget: document.getElementById('sStraddleUniversalProfitTarget').value,
 universalLossLimit: document.getElementById('sStraddleUniversalLossLimit').value,
 closeMinutesBeforeExpiry: document.getElementById('sStraddleCloseMinutesBeforeExpiry').value,
 straddleExpiryPreference: document.getElementById('sStraddleExpiryPreference').value,
 reentryEnabled: document.getElementById('sStraddleReentryEnabled').checked,
 nativeStraddlePreferred: document.getElementById('sNativeStraddlePreferred').checked,
 minPremiumPerContractUSD: document.getElementById('sStraddleMinPremiumPerContractUSD').value,
 minThetaMarginRatioPct: document.getElementById('sStraddleMinThetaMarginRatioPct').value,
 sameDayMinScore: document.getElementById('sStraddleSameDayMinScore').value,
 sameDayMaxSpreadPct: document.getElementById('sStraddleSameDayMaxSpreadPct').value,
 premiumCapturePct: document.getElementById('sStraddlePremiumCapturePct').value,
 entryOrderMaxAgeMinutes: document.getElementById('sStraddleEntryOrderMaxAgeMinutes').value,
 autoSizeEnabled: document.getElementById('sAutoSizeEnabled').checked,
 targetProfitUSD: document.getElementById('sTargetProfitUSD').value,
 });

 const currentStates = await storeGet(['autoTrade', 'dcaBotSettings']);
 const currentAutoTradeState = !!currentStates.autoTrade;
 const requestedAutoTradeState = !!document.getElementById('sAutoTradeEnabled').checked;
 if (requestedAutoTradeState && !currentAutoTradeState) {
 const okToEnable = confirm(
 'AUTO TRADE will place REAL orders on Delta Exchange automatically when signals qualify.\n\n' +
 'Confirm only if the active profile, max order size, daily loss limit, and bracket protection are configured.\n\n' +
 'Enable futures auto-trade from Settings?'
 );
 if (!okToEnable) {
 document.getElementById('sAutoTradeEnabled').checked = false;
 }
 }
 const finalAutoTradeState = !!document.getElementById('sAutoTradeEnabled').checked;
 const currentDcaEnabled = !!settingsSanitizeDcaBotSettings(currentStates.dcaBotSettings || {}).enabled;
 if (dcaBotSettings.enabled && !currentDcaEnabled) {
 const okToEnableDca = confirm(
 'DCA BOT will place REAL Delta futures orders on a repeated time/price schedule.\n\n' +
 'Confirm only if symbol, direction, per-order size, max daily spend, and bracket protection percentages are correct.\n\n' +
 'Enable DCA bot from Settings?'
 );
 if (!okToEnableDca) {
 dcaBotSettings.enabled = false;
 document.getElementById('sDcaBotEnabled').checked = false;
 }
 }

 await Promise.all([
 storeSet({
 strategy: strat,
 autoScan,
 autoScanInterval,
 externalBackup,
 autoTradeSettings,
 autoTrade: finalAutoTradeState,
 dcaBotSettings,
 optionsAutoTradeSettings,
 }),
 saveStoredTelegramConfig(telegram),
 ]);

 await storeRemove(['dsChartCacheV17']);
 chrome.runtime.sendMessage({ action: 'toggleAutoScan', enable: autoScan, interval: autoScanInterval }, () => {
 void chrome.runtime?.lastError;
 loadAutoScanState();
 });
 chrome.runtime.sendMessage({ action: 'toggleAutoTrade', enable: finalAutoTradeState }, () => {
 void chrome.runtime?.lastError;
 if (typeof loadAutoTradeState === 'function') loadAutoTradeState();
 });
 chrome.runtime.sendMessage({ action: 'syncDcaBotAlarm' }, () => {
 void chrome.runtime?.lastError;
 });
 // Show save confirmation toast
 showSystemToast('Settings saved', 'Auto-scan ' + (autoScan ? autoScanInterval + 'm' : 'off') + ' | Mode ' + marketDataMode, 'success', 3000);
 refreshRuntimeHealthStatus();
 const ok = document.getElementById('saveOK');
 setReportDisplayCurrency(reportDisplayCurrency);
 setReportDisplayUsdInrRate(reportDisplayUsdInrRate);
 globalThis.v16LiveAccountSyncEnabled = liveAccountSync;
 globalThis.v16LiveOrderPreviewChartEnabled = liveOrderPreviewChart;
 globalThis.deltaMarketDataMode = marketDataMode;
 globalThis.__fwdTradeDeskOptionsAutoSettings = optionsAutoTradeSettings;
 globalThis.v16SyncLiveAccountSyncButtons?.();
 globalThis.renderOptionsWorkspace?.();
 if (activeWorkspaceTab === 'funding') renderFundingHeatmap?.();
 try { chrome.runtime.sendMessage({ action: 'delta:marketDataModeChanged', mode: marketDataMode }, () => void chrome.runtime?.lastError); } catch (_) {}
 if (ok) { ok.textContent = 'Saved!'; setTimeout(() => { ok.textContent = ''; }, 2500); }

});

document.addEventListener('click', async (e) => {
 if (e.target?.id !== 'sMarketIndexRebuildNow' && !e.target?.closest('#sMarketIndexRebuildNow')) return;
 const stored = await storeGet(['strategy']);
 const strategy = stored.strategy || {};
 const current = settingsSanitizeMarketIndexSettings(strategy.marketIndexSettings || {});
 const nextMarketIndexSettings = settingsSanitizeMarketIndexSettings({
 ...current,
 maxConstituents: document.getElementById('sMarketIndexMaxConstituents')?.value || current.maxConstituents,
 rebalanceDays: document.getElementById('sMarketIndexRebalanceDays')?.value || current.rebalanceDays,
 excludedSymbols: document.getElementById('sMarketIndexExcludedSymbols')?.value || current.excludedSymbols,
 rebuildNonce: Date.now(),
 });
 await storeSet({
 strategy: {
 ...strategy,
 marketIndexSettings: nextMarketIndexSettings,
 },
 });
 showSystemToast?.('FWD-10 rebuild queued', 'Next scan will rebuild the equal-weight basket.', 'success', 3000);
});

document.addEventListener('click', (e) => {
 if (e.target?.id !== 'btnClearCandleCache' && !e.target?.closest('#btnClearCandleCache')) return;
 if (!confirm('Clear the local candle cache? The next scan will re-download missing history.')) return;
 chrome.runtime.sendMessage({ action: 'clearCandleCache' }, () => {
 refreshRuntimeHealthStatus();
 });
});

document.addEventListener('click', (e) => {
 if (e.target?.id !== 'btnRefreshRuntimeHealth' && !e.target?.closest('#btnRefreshRuntimeHealth')) return;
 refreshRuntimeHealthStatus();
 updateApiUsageMeter?.(true);
});

document.addEventListener('click', async (e) => {
 if (e.target?.id !== 'btnResetDcaBotCycle' && !e.target?.closest('#btnResetDcaBotCycle')) return;
 if (!confirm('Reset the DCA cycle counters and last trigger price? Existing exchange orders are not cancelled.')) return;
 await storeSet({ dcaBotState: {} });
 chrome.runtime.sendMessage({ action: 'syncDcaBotAlarm' }, () => void chrome.runtime?.lastError);
 loadStrategy();
});

function readTelegramFromHooks(forceEnabled = null) {
 const enabledInput = !!document.getElementById('tgEnabled')?.checked;
 const minScore = sanitizeTelegramMinScore(document.getElementById('tgMinScore')?.value, 85);
 const minScoreEl = document.getElementById('tgMinScore');
 if (minScoreEl) minScoreEl.value = String(minScore);
 return {
 enabled: forceEnabled == null ? enabledInput : !!forceEnabled,
 botToken: document.getElementById('tgBotToken')?.value.trim() || '',
 chatId: document.getElementById('tgChatId')?.value.trim() || '',
 minScore,
 hourlySummaryEnabled: !!document.getElementById('tgHourlySummary')?.checked,
 };
}

async function saveTelegramFromHooks(forceEnabled = null) {
 const telegram = readTelegramFromHooks(forceEnabled);
 await saveStoredTelegramConfig(telegram);
}

// Delegation: Test Telegram
document.addEventListener('click', (e) => {
 if (e.target?.id !== 'btnTestTelegram' && !e.target?.closest('#btnTestTelegram')) return;
 const telegram = readTelegramFromHooks(true);
 const out = document.getElementById('tgSaveOK');
 if (!telegram.botToken || !telegram.chatId) {
 out.textContent = 'Enter bot token and chat ID first.';
 out.style.color = '#ff4560';
 return;
 }
 out.textContent = 'Sending test...';
 out.style.color = '#ffc840';
 chrome.runtime.sendMessage({ action: 'testTelegram', telegram }, (resp) => {
 if (resp?.ok) {
 const tgEnabledEl = document.getElementById('tgEnabled');
 if (tgEnabledEl) tgEnabledEl.checked = true;
 saveTelegramFromHooks(true).catch(() => {});
 out.textContent = 'OK Telegram test sent (saved)';
 out.style.color = '#00e5a0';
 } else {
 out.textContent = `ERROR Telegram failed: ${resp?.error || 'unknown error'}`;
 out.style.color = '#ff4560';
 }
 setTimeout(() => { out.textContent = ''; out.style.color = ''; }, 3500);
 });
});

// Delegation: tgEnabled change
document.addEventListener('change', (e) => {
 if (e.target?.id !== 'tgEnabled') return;
 saveTelegramFromHooks().catch(() => {});
});
// Delegation: tgBotToken blur
document.addEventListener('focusout', (e) => {
 if (e.target?.id !== 'tgBotToken') return;
 saveTelegramFromHooks().catch(() => {});
});
// Delegation: tgChatId blur
document.addEventListener('focusout', (e) => {
 if (e.target?.id !== 'tgChatId') return;
 saveTelegramFromHooks().catch(() => {});
});
// Delegation: tgMinScore blur
document.addEventListener('focusout', (e) => {
 if (e.target?.id !== 'tgMinScore') return;
 saveTelegramFromHooks().catch(() => {});
});
// Delegation: tgHourlySummary change
document.addEventListener('change', (e) => {
 if (e.target?.id !== 'tgHourlySummary') return;
 saveTelegramFromHooks().catch(() => {});
});

// Delegation: Pick Backup Dir
document.addEventListener('click', async (e) => {
 if (e.target?.id !== 'btnPickBackupDir' && !e.target?.closest('#btnPickBackupDir')) return;
 if (!isExternalBackupSupported()) {
 setBackupStatus('This browser does not support folder picker API.', '#ff4560');
 return;
 }
 try {
 const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
 const allowed = await ensureBackupFolderPermission(handle, true);
 if (!allowed) {
 setBackupStatus('Folder permission was not granted.', '#ff4560');
 return;
 }
 backupDirHandle = handle;
 await idbSetBackupHandle(handle);
 const folderName = handle.name || '';
 setBackupPathLabel(folderName);
 document.getElementById('sExtBackupEnabled').checked = true;
 const d = await storeGet(['externalBackup']);
 const prev = sanitizeExternalBackupConfig(d.externalBackup || {});
 await chrome.storage.local.set({
 externalBackup: {
 ...prev,
 enabled: true,
 folderName,
 updatedAt: Date.now(),
 },
 });
 setBackupStatus('OK Backup folder selected.', '#00e5a0');
 } catch (e) {
 if (e?.name === 'AbortError') {
 setBackupStatus('Folder selection cancelled.', '#ffc840');
 } else {
 setBackupStatus(`Folder selection failed: ${e.message || 'unknown error'}`, '#ff4560');
 }
 }
});

// Delegation: Backup Now
document.addEventListener('click', async (e) => {
 if (e.target?.id !== 'btnBackupNow' && !e.target?.closest('#btnBackupNow')) return;
 if (isDesktopMode && window.fwdDesktopNative?.sendNativeMessage) {
 await exportFullAppBackup('manual');
 return;
 }
 await writeLocalBackup('manual');
});

// Delegation: Full app backup download
document.addEventListener('click', async (e) => {
 if (e.target?.id !== 'btnFullBackupDownload' && !e.target?.closest('#btnFullBackupDownload')) return;
 await exportFullAppBackup('manual_full');
});

// Delegation: Full app backup restore
document.addEventListener('click', async (e) => {
 if (e.target?.id !== 'btnFullBackupRestore' && !e.target?.closest('#btnFullBackupRestore')) return;
 const ok = window.confirm('Restore backup data into this app? Candle history will be merged and settings from the backup will be imported. Restart the app after restore.');
 if (!ok) return;
 await importFullAppBackup();
});

document.addEventListener('click', async (e) => {
 if (e.target?.id !== 'btnCandleHistoryStart' && !e.target?.closest('#btnCandleHistoryStart')) return;
 await startCandleHistoryBackfill();
});

document.addEventListener('click', async (e) => {
 if (e.target?.id !== 'btnCandleHistoryPause' && !e.target?.closest('#btnCandleHistoryPause')) return;
 await pauseCandleHistoryBackfill();
});

document.addEventListener('click', async (e) => {
 if (e.target?.id !== 'btnCandleHistoryRefresh' && !e.target?.closest('#btnCandleHistoryRefresh')) return;
 await refreshCandleHistoryStatus();
});

// Delegation: Archive Now
document.addEventListener('click', async (e) => {
 if (e.target?.id !== 'btnArchiveNow' && !e.target?.closest('#btnArchiveNow')) return;
 await archiveOldAlertsToLocal('manual_archive');
});

// Delegation: sKeepAlerts blur
document.addEventListener('focusout', (e) => {
 if (e.target?.id !== 'sKeepAlerts') return;
 const safe = sanitizeKeepAlerts(e.target?.value);
 e.target.value = String(safe);
});


// ==================================================================
// DEBUG TAB
// ==================================================================
// Delegation: Refresh Debug
document.addEventListener('click', (e) => {
 if (e.target?.id !== 'btnRefreshDebug' && !e.target?.closest('#btnRefreshDebug')) return;
 renderDebug();
});
// Delegation: Download Debug
document.addEventListener('click', (e) => {
 if (e.target?.id !== 'btnDownloadDebug' && !e.target?.closest('#btnDownloadDebug')) return;
 chrome.runtime.sendMessage({ action: 'getDebug' }, logs => {
 if (!logs?.length) { alert('No debug logs to download.'); return; }
 const text = logs.join('\n');
 const blob = new Blob([text], { type: 'text/plain' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `fwd-tradedesk-pro-debug-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.txt`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
 });
});
// Delegation: Clear Debug
document.addEventListener('click', (e) => {
 if (e.target?.id !== 'btnClearDebug' && !e.target?.closest('#btnClearDebug')) return;
 chrome.storage.local.set({ debugLog: [] });
 document.getElementById('debugOutput').textContent = 'Cleared.';
});

document.addEventListener('click', async (e) => {
 if (e.target?.id !== 'btnExportReleaseDiagnostics' && !e.target?.closest('#btnExportReleaseDiagnostics')) return;
 const button = e.target.closest('#btnExportReleaseDiagnostics');
 if (button) {
  button.disabled = true;
  button.textContent = 'Exporting...';
 }
 const response = await exportReleaseDiagnostics('manual_debug_tab');
 if (button) {
  button.disabled = false;
  button.textContent = 'Export Diagnostics';
 }
 if (!response?.ok) {
  const debugOutput = document.getElementById('debugOutput');
  if (debugOutput) debugOutput.textContent = `Diagnostics export failed: ${response?.error || 'unknown error'}`;
 }
});

function renderDebug() {
 chrome.runtime.sendMessage({ action: 'getDebug' }, logs => {
 const debugOutput = document.getElementById('debugOutput');
 if (!logs?.length) { debugOutput.textContent = 'No logs yet. Run a scan first.'; return; }
 const frag = document.createDocumentFragment();
 logs.slice().reverse().forEach((l, idx, arr) => {
 const color = l.includes('OK') ? '#00e5a0' : l.includes('X') || l.includes('Error') ? '#ff4560'
 : l.includes('SCAN') || l.includes('Market Index') ? '#ffc840' : '#dde4f0';
 const span = document.createElement('span');
 span.style.color = color;
 span.textContent = l;
 frag.appendChild(span);
 if (idx < arr.length - 1) frag.appendChild(document.createTextNode('\n'));
 });
 debugOutput.replaceChildren(frag);
 });
}


// ==================================================================
// WEBHOOK MANAGEMENT - NEW v14
// ==================================================================
let editingWebhookId = null;

function getWebhookFormEls() {

 return {

 form: document.getElementById('webhookForm'),

 name: document.getElementById('whName'),

 url: document.getElementById('whUrl'),

 format: document.getElementById('whFormat'),

 evtSignal: document.getElementById('whEvtSignal'),

 evtScan: document.getElementById('whEvtScan'),

 evtFunding: document.getElementById('whEvtFunding'),

 authHeader: document.getElementById('whAuthHeader'),

 };

}



function showWebhookForm(hook = null) {

 const els = getWebhookFormEls();

 if (!els.form || !els.name || !els.url || !els.format || !els.evtSignal || !els.evtScan || !els.evtFunding || !els.authHeader) return;



 editingWebhookId = hook?.id || null;

 els.name.value = hook?.name || '';

 els.url.value = hook?.url || '';

 els.format.value = hook?.format || 'json';

 els.evtSignal.checked = hook ? !!hook.events?.includes('signal_alert') : true;

 els.evtScan.checked = hook ? !!hook.events?.includes('scan_complete') : true;

 els.evtFunding.checked = hook ? !!hook.events?.includes('funding_extreme') : false;

 els.authHeader.value = hook?.headers?.Authorization || '';

 els.form.style.display = 'block';

 els.form.hidden = false;



 requestAnimationFrame(() => {

 els.form.scrollIntoView({ behavior: 'smooth', block: 'start' });

 els.name.focus({ preventScroll: true });

 });

}



function hideWebhookForm() {

 const form = document.getElementById('webhookForm');

 if (form) {

 form.style.display = 'none';

 form.hidden = true;

 }

 editingWebhookId = null;

}

function renderWebhooks() {
 chrome.runtime.sendMessage({ action: 'getWebhooks' }, resp => {
 const hooks = resp?.webhooks || [];
 const list = document.getElementById('webhookList');
 if (!list) return;

 if (!hooks.length) {
 list.innerHTML = `
 <div class="empty">
 <div class="ei">Link</div>
 <div class="eh">No webhooks configured</div>
 <div class="es">Add a webhook to send signals to Voicenotes, Discord, Slack, Notion, etc.</div>
 </div>`;
 return;
 }

 list.innerHTML = hooks.map(h => {
 const coolingDown = Number(h.cooldownUntil || 0) > Date.now();
 const statusIcon = coolingDown ? '' : h.lastStatus === 'ok' ? 'Green' : h.lastStatus === 'error' ? 'Red' : 'Idle';
 const lastTime = h.lastFired ? timeAgo(h.lastFired) : 'never';
 const events = h.events?.join(', ') || '-';
 const cooldownMeta = coolingDown ? `<span>Loading Until: ${esc(new Date(h.cooldownUntil).toLocaleTimeString())}</span>` : '';
 return `
 <div class="wh-card ${h.enabled ? '' : 'disabled'}">
 <div class="wh-card-top">
 <div class="wh-card-name">${statusIcon} ${esc(h.name)}</div>
 <div class="wh-card-actions">
 <button class="bsm" onclick="toggleWebhookEnabled('${h.id}')">${h.enabled ? 'Pause Pause' : 'Enable Enable'}</button>
 <button class="bsm" onclick="editWebhook('${h.id}')">Edit</button>
 <button class="bsm red" onclick="deleteWebhook('${h.id}')">Delete</button>
 </div>
 </div>
 <div class="wh-card-url">${esc(h.url.slice(0, 50))}${h.url.length > 50 ? '...' : ''}</div>
 <div class="wh-card-meta">
 <span>Signal ${esc(events)}</span>
 <span> Last: ${lastTime}</span>
 <span>Format ${h.format || 'json'}</span>
 ${cooldownMeta}
 ${h.lastError ? `<span class="wh-err" title="${esc(h.lastError)}">Warning ${esc(h.lastError.slice(0, 30))}</span>` : ''}
 </div>
 </div>`;
 }).join('');

 bindWebhookListActions(list);
 });
}

// Escape HTML
function esc(s) {
 return String(s == null ? '' : s)
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .replace(/"/g, '&quot;')
 .replace(/'/g, '&#39;');
}

function getWebhookOriginPattern(url) {
 const parsed = new URL(String(url || '').trim());
 return `${parsed.protocol}//${parsed.host}/*`;
}

function isDeltaWebhookUrl(url) {
 try {
 const host = new URL(String(url || '').trim()).hostname.toLowerCase();
 return ['api.delta.exchange', 'api.india.delta.exchange', 'www.delta.exchange', 'india.delta.exchange', 'delta.exchange'].includes(host);
 } catch (_) {
 return false;
 }
}

function ensureWebhookPermission(url) {
 if (isDeltaWebhookUrl(url)) return Promise.resolve(true);
 const origin = getWebhookOriginPattern(url);
 return new Promise(resolve => {
 chrome.permissions.contains({ origins: [origin] }, hasPermission => {
 if (hasPermission) {
 resolve(true);
 return;
 }
 chrome.permissions.request({ origins: [origin] }, granted => resolve(!!granted));
 });
 });
}

function bindWebhookListActions(list) {
 if (!list) return;
 list.querySelectorAll('button[onclick]').forEach(button => {
 const onclick = String(button.getAttribute('onclick') || '');
 const idMatch = onclick.match(/'(.*?)'/);
 const id = String(idMatch?.[1] || '').trim();
 if (!id) return;
 if (onclick.includes('toggleWebhookEnabled')) button.dataset.whAction = 'toggle';
 else if (onclick.includes('deleteWebhook')) button.dataset.whAction = 'delete';
 else if (onclick.includes('editWebhook')) button.dataset.whAction = 'edit';
 button.dataset.whId = id;
 button.removeAttribute('onclick');
 });
 if (list.dataset.actionsBound === 'true') return;
 list.dataset.actionsBound = 'true';
 list.addEventListener('click', event => {
 const button = event.target?.closest?.('button[data-wh-action]');
 if (!button) return;
 const id = String(button.dataset.whId || '').trim();
 if (!id) return;
 if (button.dataset.whAction === 'delete') {
 window.deleteWebhook(id);
 return;
 }
 if (button.dataset.whAction === 'toggle') {
 window.toggleWebhookEnabled(id);
 return;
 }
 window.editWebhook(id);
 });
}

// Delegation: Add Webhook
document.addEventListener('click', (e) => {
 if (e.target?.id !== 'btnAddWebhook' && !e.target?.closest('#btnAddWebhook')) return;
 editingWebhookId = null;
 document.getElementById('whName').value = '';
 document.getElementById('whUrl').value = '';
 document.getElementById('whFormat').value = 'json';
 document.getElementById('whEvtSignal').checked = true;
 document.getElementById('whEvtScan').checked = true;
 document.getElementById('whEvtFunding').checked = false;
 document.getElementById('whAuthHeader').value = '';
 showWebhookForm();
});

// Delegation: Cancel Webhook
document.addEventListener('click', (e) => {
 if (e.target?.id !== 'btnCancelWebhook' && !e.target?.closest('#btnCancelWebhook')) return;
 hideWebhookForm();
 editingWebhookId = null;
});

// Delegation: Save Webhook
document.addEventListener('click', async (e) => {
 if (e.target?.id !== 'btnSaveWebhook' && !e.target?.closest('#btnSaveWebhook')) return;
 const name = document.getElementById('whName').value.trim();
 const url = document.getElementById('whUrl').value.trim();
 if (!name || !url) { alert('Name and URL are required'); return; }
 try {
 const u = new URL(url);
 if (u.protocol !== 'https:') throw new Error('bad protocol');
 } catch (_) {
 alert('Enter a valid HTTPS URL.');
 return;
 }

 const allowed = await ensureWebhookPermission(url);

 if (!allowed) {

 alert('Permission is required to reach that webhook domain.');

 return;

 }

 const events = [];
 if (document.getElementById('whEvtSignal').checked) events.push('signal_alert');
 if (document.getElementById('whEvtScan').checked) events.push('scan_complete');
 if (document.getElementById('whEvtFunding').checked) events.push('funding_extreme');

 const authHeader = document.getElementById('whAuthHeader').value.trim();
 const headers = {};
 if (authHeader) headers['Authorization'] = authHeader;

 const webhook = {
 id: editingWebhookId || 'wh_' + Date.now(),
 name,
 url,
 format: document.getElementById('whFormat').value,
 events,
 headers: Object.keys(headers).length ? headers : null,
 enabled: true,
 lastStatus: null,
 lastFired: null,
 };

 chrome.runtime.sendMessage({ action: 'saveWebhook', webhook }, resp => {
 if (resp?.ok) {
 hideWebhookForm();
 editingWebhookId = null;
 const ok = document.getElementById('whSaveOK');
 if (ok) { ok.textContent = 'Saved!'; setTimeout(() => { ok.textContent = ''; }, 2500); }

 renderWebhooks();
 } else {
 alert(resp?.error || 'Webhook save failed.');
 }
 });
});

// Delegation: Test Webhook
document.addEventListener('click', async (e) => {
 if (e.target?.id !== 'btnTestWebhook' && !e.target?.closest('#btnTestWebhook')) return;
 const name = document.getElementById('whName').value.trim() || 'Test';
 const url = document.getElementById('whUrl').value.trim();
 if (!url) { alert('Enter a URL first'); return; }
 try {
 const u = new URL(url);
 if (u.protocol !== 'https:') throw new Error('bad protocol');
 } catch (_) {
 alert('Enter a valid HTTPS URL.');
 return;
 }

 const authHeader = document.getElementById('whAuthHeader').value.trim();
 const headers = {};
 if (authHeader) headers['Authorization'] = authHeader;

 chrome.runtime.sendMessage({
 action: 'testWebhook',
 webhook: {
 id: 'test', name, url,
 format: document.getElementById('whFormat').value,
 events: ['test'], headers: Object.keys(headers).length ? headers : null,
 enabled: true,
 }
 }, (resp) => {
 const ok = document.getElementById('whSaveOK');
 if (resp?.ok) {
 ok.textContent = 'Test Test sent! Check your app.';
 ok.style.color = '#ffc840';
 } else {
 ok.textContent = `ERROR ${resp?.error || 'Test failed.'}`;
 ok.style.color = '#ff4560';
 }
 setTimeout(() => { ok.textContent = ''; ok.style.color = ''; }, 3000);
 });
});

window.editWebhook = function(id) {
 chrome.runtime.sendMessage({ action: 'getWebhooks' }, resp => {
 const hook = (resp?.webhooks || []).find(h => h.id === id);
 if (!hook) return;
 editingWebhookId = id;
 document.getElementById('whName').value = hook.name;
 document.getElementById('whUrl').value = hook.url;
 document.getElementById('whFormat').value = hook.format || 'json';
 document.getElementById('whEvtSignal').checked = hook.events?.includes('signal_alert');
 document.getElementById('whEvtScan').checked = hook.events?.includes('scan_complete');
 document.getElementById('whEvtFunding').checked = hook.events?.includes('funding_extreme');
 document.getElementById('whAuthHeader').value = hook.headers?.Authorization || '';
 showWebhookForm(hook);
 });
};

window.toggleWebhookEnabled = function(id) {
 chrome.runtime.sendMessage({ action: 'getWebhooks' }, resp => {
 const hook = (resp?.webhooks || []).find(h => h.id === id);
 if (!hook) return;
 hook.enabled = !hook.enabled;
 if (hook.enabled) {
 hook.cooldownUntil = 0;
 hook.consecutiveFailures = 0;
 hook.lastError = null;
 hook.lastStatus = null;
 }
 chrome.runtime.sendMessage({ action: 'saveWebhook', webhook: hook }, () => renderWebhooks());
 });
};

window.deleteWebhook = function(id) {
 if (!confirmDestructiveAction('Delete this webhook?', { title: 'Delete webhook?' })) return;
 chrome.runtime.sendMessage({ action: 'deleteWebhook', id }, () => renderWebhooks());
};


// ==================================================================
// DESKTOP APP MODE - NEW v14
// ==================================================================
// Delegation: Desktop App button
document.addEventListener('click', (e) => {
 if (e.target?.id !== 'btnDesktopApp' && !e.target?.closest('#btnDesktopApp')) return;
 chrome.runtime.sendMessage({
 action: 'openDesktopApp',
 width: Math.min(screen.availWidth - 100, 1400),
 height: Math.min(screen.availHeight - 50, 950),
 });
});


// ==================================================================
// SOUND ALERT
// ==================================================================
let audioCtx = null;
function playAlert(tone = 'classic') {
 try {
 if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
 const t = sanitizeAlertTone(tone);
 const profiles = {
 classic: [[880, 0.05], [1100, 0.15], [880, 0.3], [1320, 0.45]],
 beacon: [[660, 0.02], [820, 0.12], [980, 0.24], [1240, 0.38]],
 pulse: [[520, 0.02], [520, 0.14], [760, 0.26], [760, 0.38]],
 chime: [[740, 0.02], [988, 0.18], [1480, 0.36]],
 siren: [[580, 0.02], [700, 0.14], [580, 0.26], [700, 0.38], [860, 0.5]],
 };
 const notes = profiles[t] || profiles.classic;
 notes.forEach(([freq, when]) => {
 const o = audioCtx.createOscillator();
 const g = audioCtx.createGain();
 o.connect(g); g.connect(audioCtx.destination);
 o.frequency.value = freq; o.type = t === 'siren' ? 'sawtooth' : t === 'pulse' ? 'square' : 'sine';
 g.gain.setValueAtTime(0.28, audioCtx.currentTime + when);
 g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + when + 0.22);
 o.start(audioCtx.currentTime + when);
 o.stop(audioCtx.currentTime + when + 0.24);
 });
 } catch (_) {}
}


// ==================================================================
// HELPERS
// ==================================================================
function fmtPrice(p) {
 if (!p || !isFinite(p)) return '-';
 if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 1 });
 if (p >= 1) return p.toFixed(4);
 if (p >= 0.01) return p.toFixed(6);
 if (p >= 0.0001) return p.toFixed(8);
 if (p >= 0.000001) return p.toFixed(10);
 return p.toPrecision(6);
}

function fmtLarge(n) {
 if (!n) return '-';
 if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
 if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
 if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
 return n.toFixed(0);
}

function timeAgo(ts) {
 const d = Date.now() - ts;
 if (d < 60000) return 'just now';
 if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
 if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
 return Math.floor(d / 86400000) + 'd ago';
}
