// Pane HTML templates - lazy-injected on first tab visit
// Extracted from popup.html. Edit this file, not the pane shells in popup.html.

const PANE_TEMPLATES = {
 'home': ` <div class="command-center" id="commandCenter">
 <div class="command-center-head">
 <div>
 <div class="command-eyebrow">Daily operating dashboard</div>
 <h2>Command Center</h2>
 <p>Loading today's risk, execution state, scan health, and next actions.</p>
 </div>
 </div>
 <div class="command-metric-grid">
 <div class="command-metric-card"><span>Today Open Risk</span><strong>--</strong><small>Waiting for workspace data</small></div>
 <div class="command-metric-card"><span>Active Positions</span><strong>--</strong><small>Waiting for account state</small></div>
 <div class="command-metric-card"><span>Pending Orders</span><strong>--</strong><small>Waiting for order state</small></div>
 <div class="command-metric-card"><span>Kill Switch</span><strong>--</strong><small>Waiting for safety state</small></div>
 <div class="command-metric-card"><span>API State</span><strong>--</strong><small>Waiting for profile state</small></div>
 <div class="command-metric-card"><span>Scan Health</span><strong>--</strong><small>Waiting for scan state</small></div>
 </div>
 </div>
`,

 'scanner': ` <div class="frow">
 <input class="fi" type="text" id="fSearch" placeholder="Search..." aria-label="Search scanner symbols"/>
 <select class="fi" id="fDir">
 <option value="">All Directions</option>
 <option value="long">Long</option>
 <option value="short">Short</option>
 <option value="watch_long">Watch Long</option>
 <option value="watch_short">Watch Short</option>
 </select>
 <select class="fi" id="fMTF">
 <option value="">All</option>
 <option value="confirmed">MTF Only</option>
 <option value="partial">Partial</option>
 </select>
 <select class="fi" id="fSort">
 <option value="score">Best score first</option>
 <option value="tq">Trade quality first</option>
 <option value="change">Largest 24h move</option>
 <option value="volume">Highest volume</option>
 <option value="fr">Funding Rate</option>
 <option value="alpha">A-Z</option>
 </select>
 <select class="fi" id="fSetup">
 <option value="">All Setups</option>
 <option value="Mean Reversion">Mean Reversion</option>
 <option value="Reclaim">Reclaim</option>
 <option value="Fade Extreme">Fade Extreme</option>
 <option value="Trend">Trend</option>
 <option value="Breakout">Breakout</option>
 <option value="Mixed">Mixed</option>
 </select>
 <select class="fi" id="fSector">
 <option value="">All Sectors</option>
 <option value="Layer 1">Layer 1</option>
 <option value="Layer 2">Layer 2</option>
 <option value="DeFi">DeFi</option>
 <option value="AI / Data">AI / Data</option>
 <option value="Meme">Meme</option>
 <option value="Gaming">Gaming</option>
 <option value="Infra">Infra</option>
 <option value="Exchange">Exchange</option>
 <option value="Privacy">Privacy</option>
 <option value="Commodity">Commodity</option>
 <option value="Stock">Stock</option>
 <option value="New">New</option>
 <option value="Other">Other</option>
 </select>
 </div>
 <div class="preset-row" id="scannerPresets">
 <button class="preset-btn active" data-preset="">All Flow</button>
 <button class="preset-btn" data-preset="trend">Trend</button>
 <button class="preset-btn" data-preset="reversal">Reversal</button>
 <button class="preset-btn" data-preset="crowding">Crowding</button>
 <button class="preset-btn" data-preset="tracked">Tracked</button>
 <button class="preset-btn scanner-view-toggle" id="btnScannerView" data-view="cards" title="Scanner view: Cards" style="margin-left:auto">Cards</button>
 </div>
 <div class="preset-row" id="scannerSessions">
 <button class="preset-btn active" data-session="">All Sessions</button>
 <button class="preset-btn" data-session="asia">Asia</button>
 <button class="preset-btn" data-session="london">London</button>
 <button class="preset-btn" data-session="newyork">New York</button>
 <button class="preset-btn" data-session="closed">Late</button>
 </div>
 <div class="scanner-insights-shell" id="scannerInsightsRail"></div>
 <div class="market-feed-strip" id="scannerFeedStatus"></div>
 <div class="trade-tape" id="tradeTape"></div>
 <div class="scanner-spotlight" id="scannerSpotlight"></div>
 <div class="strip" id="strip" style="display:none">
 <div class="st-item"><span id="ssLong">0</span><b class="tip" data-tip="Count of current long-direction signals">LONG</b></div>
 <div class="st-div"></div>
 <div class="st-item"><span id="ssShort">0</span><b class="tip" data-tip="Count of current short-direction signals">SHORT</b></div>
 <div class="st-div"></div>
 <div class="st-item"><span id="ssMTF">0</span><b class="tip" data-tip="Signals confirmed by both 1D and 15m timeframes">MTF OK</b></div>
 <div class="st-div"></div>
 <div class="st-item"><span id="ssWatch">0</span><b class="tip" data-tip="Watchlist-quality setups, not full execute signals">WATCH</b></div>
 <div class="st-div"></div>
 <div class="st-item"><span id="ssFire">0</span><b class="tip" data-tip="High-confidence signals with score above 80">>=80</b></div>
 <div class="st-div"></div>
 <div class="st-item"><span id="ssSpike">0</span><b class="tip" data-tip="Signals with abnormal volume spike confirmation">SPIKE</b></div>
 </div>
 <div class="clist" id="cardList">
 <div class="empty">
 <div class="ei">--</div>
 <div class="eh">No signals yet</div>
 <div class="es">Click <b>Scan Now</b> to scan all perpetual coins<br/>
 EMA 9/30/100 + OBV + RSI + MACD + VWAP + Volume Profile<br/>
 Multi-timeframe | AI-enhanced scoring | Tiered alerts
 </div>
 </div>
 </div>
`,

 'strategies': ` <div class="strategy-lab-shell" id="strategyLabRoot">
 <div class="chart-pane-loading">
 <div class="chart-pane-loading-title">Strategy Lab</div>
 <div class="chart-pane-loading-copy">Loading strategy framework...</div>
 </div>
 </div>
`,

 'alerts': ` <div class="phdr">
 <div class="research-pane-copy">
 <span>Signal Alerts</span>
 <small class="phdr-sub">Execute (75+) | Setup (60+) | Watch (45+)</small>
 </div>
 <input class="fi alert-search" type="text" id="alertSearch" placeholder="Filter by symbol..."/>
 <input class="fi alert-score" type="number" id="alertMinScore" min="0" max="100" placeholder="Score >="/>
 <div class="phdr-btns">
 <button class="bsm" id="btnTestSound">Test</button>
 <button class="bsm red" id="btnClearAlerts">Clear All</button>
 </div>
 </div>
 <div class="alert-filter-row">
 <div class="alert-tier-filters" id="alertTierFilters">
 <button class="bsm active" data-tier="">All</button>
 <button class="bsm" data-tier="execute">Execute</button>
 <button class="bsm" data-tier="setup">Setup</button>
 <button class="bsm" data-tier="watch">Watch</button>
 </div>
 <div class="alert-sort-row" id="alertSortRow">
 <button class="bsm active" data-alert-sort="portfolio">Portfolio First</button>
 <button class="bsm" data-alert-sort="score">Highest Score</button>
 <button class="bsm" data-alert-sort="newest">Newest</button>
 </div>
 </div>
 <div class="alert-queue" id="alertQueue"></div>
 <div class="clist" id="alertList">
 <div class="empty">
 <div class="ei">--</div>
 <div class="eh">No alerts yet</div>
 <div class="es">Alerts fire when Score = 75 AND MTF confirmed.<br/>Click any alert card for full details.</div>
 </div>
 </div>
`,

 'watchlist': ` <div class="phdr">
 <div>
 <span>My Watchlist</span>
 <small class="phdr-sub">Pinned coins always appear at top of scanner</small>
 </div>
 <div class="phdr-btns">
 <button class="bsm" id="btnNewCustomAlert" style="background:var(--accent-2,#19c7b2);color:#000;font-weight:700">+ Alert</button>
 <button class="bsm" id="btnRefreshWatchlist">Refresh Coin</button>
 <button class="bsm red" id="btnClearWatchlist">Clear All</button>
 </div>
 </div>
 <div class="wl-tip">Star any coin in the Scanner tab to pin it here.</div>
 <div class="custom-alerts-section" id="customAlertsSection" style="display:none">
 <div style="padding:8px 14px 4px;font-size:9px;font-weight:700;color:var(--accent-2,#19c7b2);text-transform:uppercase;letter-spacing:.08em">Custom Price Alerts</div>
 <div class="custom-alerts-list" id="customAlertsList"></div>
 </div>
 <div class="clist" id="watchlistCards">
 <div class="empty">
 <div class="ei">+</div>
 <div class="eh">No coins pinned yet</div>
 <div class="es">Go to Scanner - click + on any card to add it here</div>
 </div>
 </div>
`,

 'liveanalytics': ` <div class="phdr positions-pane-header analytics-pane-header">
 <div>
 <span>Live Trading Analytics</span>
 <small class="phdr-sub">Account performance, paper validation, setup edge, and background reliability stored locally in this workspace.</small>
 </div>
 <div class="phdr-btns">
 <button class="bsm" type="button" data-live-analytics-auto-refresh-toggle>Analytics Auto Off</button>
 <button class="bsm" id="btnExportSetupReport">Export Report</button>
 <button class="bsm" id="btnLiveAnalyticsRefresh">Refresh</button>
 <button class="bsm" id="btnLiveAnalyticsOpenPositions">Open Positions Desk</button>
 </div>
 </div>
 <div class="live-positions-shell live-analytics-shell">
 <div class="reports-health-strip" id="reportsHealthStrip">
 <div class="reports-health-item is-waiting"><span>Data</span><strong>Loading</strong><small>Waiting for analytics</small></div>
 <div class="reports-health-item is-waiting"><span>Mode</span><strong>Loading</strong><small>Waiting for profile</small></div>
 <div class="reports-health-item is-waiting"><span>Range</span><strong>7D</strong><small>Default report view</small></div>
 <div class="reports-health-item is-waiting"><span>Closed</span><strong>0</strong><small>Waiting for trades</small></div>
 <div class="reports-health-item is-waiting"><span>Export</span><strong>Ready</strong><small>CSV/report actions</small></div>
 </div>
 <div class="live-account-status" id="liveAnalyticsStatus">Load a Trade Enabled or Read Only profile with session secrets to fetch private Delta account analytics.</div>
 <div class="live-analytics-toolbar" id="liveAnalyticsToolbar">
 <div class="live-analytics-filter-group">
 <span class="live-analytics-filter-label">Range</span>
 <div class="live-analytics-range-row" id="liveAnalyticsRangeChips">
 <div class="live-analytics-chip-row">
 <button class="live-analytics-chip active" data-analytics-range-days="7">7d</button>
 <button class="live-analytics-chip" data-analytics-range-days="30">30d</button>
 <button class="live-analytics-chip" data-analytics-range-days="365">365d</button>
 </div>
 <label class="live-analytics-range-custom">
 <input type="number" min="1" max="365" step="1" value="7" id="liveAnalyticsRangeDaysInput" />
 <span>days</span>
 </label>
 </div>
 </div>
 <div class="live-analytics-filter-group">
 <span class="live-analytics-filter-label">Instrument</span>
 <div class="live-analytics-chip-row" id="liveAnalyticsInstrumentChips">
 <button class="live-analytics-chip active" data-analytics-instrument="all">All</button>
 <button class="live-analytics-chip" data-analytics-instrument="futures">Futures</button>
 <button class="live-analytics-chip" data-analytics-instrument="options">Options</button>
 </div>
 </div>
 <div class="live-analytics-filter-group live-analytics-legend-group">
 <span class="live-analytics-filter-label">Overlay</span>
 <div class="live-analytics-legend" id="liveAnalyticsLegend">
 <button class="live-analytics-legend-item active" data-analytics-legend="deposits"><span class="swatch deposits"></span>Deposit</button>
 <button class="live-analytics-legend-item active" data-analytics-legend="withdrawals"><span class="swatch withdrawals"></span>Withdrawal</button>
 <button class="live-analytics-legend-item active" data-analytics-legend="liquidationFees"><span class="swatch liquidation"></span>Liquidation Fees</button>
 </div>
 </div>
 </div>
 <div class="live-analytics-kpi-grid" id="liveAnalyticsKpis">
 <div class="live-analytics-kpi-card">
 <span>REALIZED P&amp;L</span>
 <strong>$0.00</strong>
 <small>Closed live trades in the selected range.</small>
 </div>
 </div>
 <div id="liveAnalyticsReliabilityPanel"></div>
 <div id="liveAnalyticsDailyControlPanel"></div>
 <div id="liveAnalyticsSetupBreakdown"></div>
 <div id="liveAnalyticsPaperLedger"></div>
 <div id="liveAnalyticsRDistribution"></div>
 <div class="live-analytics-main-grid">
 <article class="live-equity-card live-analytics-equity-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">ACCOUNT CURVE</div>
 <div class="live-card-title">Trading Equity</div>
 </div>
 <div class="live-card-meta" id="liveAnalyticsEquityMeta">Trading equity, deposits, withdrawals, and liquidation fees.</div>
 </div>
 <div class="live-equity-chart live-analytics-chart" id="liveAnalyticsEquityChart">
 <div class="empty">
 <div class="ei">--</div>
 <div class="eh">No analytics history yet</div>
 <div class="es">Refresh live data to build the selected range.</div>
 </div>
 </div>
 </article>
 </div>
 <div class="live-analytics-secondary-grid">
 <article class="live-analytics-metric-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">REALIZED P&amp;L</div>
 <div class="live-card-title">Daily Closed P&amp;L</div>
 </div>
 <div class="live-card-meta" id="liveAnalyticsRealizedMeta">Waiting for closed trades.</div>
 </div>
 <div class="live-analytics-mini-chart" id="liveAnalyticsRealizedChart"></div>
 </article>
 <article class="live-analytics-metric-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">VOLUME</div>
 <div class="live-card-title">Volume Traded</div>
 </div>
 <div class="live-card-meta" id="liveAnalyticsVolumeMeta">Waiting for fills.</div>
 </div>
 <div class="live-analytics-mini-chart" id="liveAnalyticsVolumeChart"></div>
 </article>
 <article class="live-analytics-metric-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">COSTS</div>
 <div class="live-card-title">Fees Paid</div>
 </div>
 <div class="live-card-meta" id="liveAnalyticsFeesMeta">Waiting for fee data.</div>
 </div>
 <div class="live-analytics-mini-chart" id="liveAnalyticsFeesChart"></div>
 </article>
 <article class="live-analytics-metric-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">FUNDING</div>
 <div class="live-card-title">Funding</div>
 </div>
 <div class="live-card-meta" id="liveAnalyticsFundingMeta">Waiting for funding entries.</div>
 </div>
 <div class="live-analytics-mini-chart" id="liveAnalyticsFundingChart"></div>
 </article>
 </div>
 </div>`,

 'funds': ` <div class="phdr positions-pane-header funds-pane-header">
 <div class="research-pane-copy">
 <span>Fund Details</span>
 <small class="phdr-sub">Wallet, margin, exposure, cash movement, and withdrawable balance in one desk.</small>
 </div>
 <div class="phdr-btns research-pane-actions">
 <button class="bsm" type="button" data-live-account-sync-toggle>Auto Sync On</button>
 <button class="bsm" id="btnLiveFundsRefresh">Refresh</button>
 <button class="bsm" id="btnLiveFundsOpenPositions">Positions</button>
 </div>
 </div>
 <div class="live-funds-shell">
 <div class="live-account-status" id="liveFundsStatus">Load a Trade Enabled or Read Only profile with session secrets to fetch private Delta fund data.</div>
 <div class="trading-ui-toolbar">
 <div class="trading-toolbar-copy"><strong>Wallet command view</strong><span>Primary balance, margin capacity, and cash movement only.</span></div>
 <div class="trading-toolbar-actions">
 <label class="trading-toggle"><input type="checkbox" id="liveFundsShowZero"/> Show zero balances</label>
 <select class="trading-select" id="liveFundsLedgerFilter">
 <option value="all">All cash movement</option>
 <option value="funding">Funding</option>
 <option value="fee">Fees</option>
 <option value="realized">Realized</option>
 <option value="transfer">Deposits / Withdrawals</option>
 </select>
 <button class="bsm trading-density-toggle" type="button" data-trading-density-toggle>Compact density</button>
 </div>
 </div>
 <div class="funds-hero-grid" id="liveFundsHero">
 <div class="funds-hero-card"><span>Total Wallet</span><strong>$0.00</strong><small>Waiting for Delta balance.</small></div>
 <div class="funds-hero-card"><span>Available</span><strong>$0.00</strong><small>Withdrawable / free margin estimate.</small></div>
 <div class="funds-hero-card"><span>Margin Used</span><strong>$0.00</strong><small>Open position margin.</small></div>
 <div class="funds-hero-card"><span>Net Today</span><strong>$0.00</strong><small>Realized, fees, funding, and UPNL.</small></div>
 </div>
 <div class="funds-layout">
 <article class="funds-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">FUNDS</div>
 <div class="live-card-title">Balance Breakdown</div>
 </div>
 <div class="live-card-meta" id="liveFundsBalanceMeta">Waiting for wallet balances.</div>
 </div>
 <div class="funds-balance-grid" id="liveFundsBalanceGrid"></div>
 </article>
 <article class="funds-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">CAPACITY</div>
 <div class="live-card-title">Margin &amp; Exposure</div>
 </div>
 <div class="live-card-meta" id="liveFundsCapacityMeta">Waiting for open exposure.</div>
 </div>
 <div class="funds-capacity-meter" id="liveFundsCapacityMeter"></div>
 <div class="funds-reconcile-line" id="liveFundsReconcileLine"></div>
 <div class="funds-capacity-grid" id="liveFundsCapacityGrid"></div>
 </article>
 <article class="funds-card funds-card-wide">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">LEDGER</div>
 <div class="live-card-title">Recent Cash Movement</div>
 </div>
 <div class="live-card-meta" id="liveFundsLedgerMeta">Waiting for wallet transactions.</div>
 </div>
 <div class="funds-ledger-list" id="liveFundsLedgerList">
 <div class="empty"><div class="ei">--</div><div class="eh">No fund ledger loaded</div><div class="es">Refresh after adding Delta API credentials.</div></div>
 </div>
 </article>
 </div>
 </div>`,

 'positions': ` <div class="phdr positions-pane-header">
 <div>
 <span>Live Delta Positions</span>
 <small class="phdr-sub">Real account exposure, live P&amp;L, and the post-trade journal loop.</small>
 </div>
 <div class="phdr-btns">
 <button class="bsm" type="button" data-live-account-sync-toggle>Auto Sync On</button>
 <button class="bsm" id="btnLivePositionsRefresh">Refresh</button>
 <button class="bsm" id="btnOpenOrdersDesk">Orders Desk</button>
 <button class="bsm" type="button" id="btnLivePositionsPanic" style="background:#ff3344;color:white;border-color:#ff3344;font-weight:700;">FLATTEN ALL</button>
 <button class="bsm" id="btnLivePositionsToTrade">Trade from Scanner</button>
 </div>
 </div>
 <div class="live-positions-shell">
 <div class="live-account-status" id="liveAccountStatus">Load a Trade Enabled or Read Only profile with session secrets to fetch private Delta account data.</div>
 <div class="trading-ui-toolbar">
 <div class="trading-toolbar-copy"><strong>Position command view</strong><span>Risk first, exposure second, journal after action.</span></div>
 <div class="trading-toolbar-actions">
 <button class="bsm trading-density-toggle" type="button" data-trading-density-toggle>Compact density</button>
 <button class="bsm" type="button" data-equity-density-toggle>Compact curve</button>
 </div>
 </div>
 <div class="live-order-audit-rows live-system-health-strip" id="livePositionsHealthBar">
 <div class="empty"><div class="ei">+</div><div class="eh">System health will appear here</div><div class="es">Refresh live data to review engine, profile, kill switch, slots, daily loss, funding feed, and sync status.</div></div>
 </div>
 <div class="live-session-grid" id="liveSessionGrid">
 <div class="live-session-card">
 <span>TODAY P&amp;L</span>
 <strong>$0.00</strong>
 <small>Realized + unrealized will appear here.</small>
 </div>
 <button class="live-session-card" data-live-journal-filter="all">
 <span>WINS / LOSSES</span>
 <strong>0 / 0</strong>
 <small>Click to inspect closed trades.</small>
 </button>
 <div class="live-session-card">
 <span>CURRENT STREAK</span>
 <strong>Flat</strong>
 <small>Built from today&apos;s closed trades.</small>
 </div>
 <div class="live-session-card">
 <span>EXPECTANCY</span>
 <strong>$0.00</strong>
 <small>Average per closed trade today.</small>
 </div>
 </div>
 <div class="live-positions-summary-bar" id="livePositionsSummaryBar">
 <span id="liveSummaryUpnl" class="live-summary-upnl">UPNL -</span>
 <span id="liveSummaryCount" class="live-summary-stat">- positions</span>
 <span id="liveSummarySlots" class="live-summary-stat live-summary-chip">Slots -</span>
 <span id="liveSummaryFunding" class="live-summary-stat live-summary-chip">Funding -</span>
 <span id="liveSummaryMargin" class="live-summary-stat">Margin: -</span>
 <span id="liveSummaryNet" class="live-summary-stat">Net: -</span>
 </div>
 <div class="live-positions-layout positions-only">
 <section class="live-positions-main">
 <article class="live-equity-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">SESSION CURVE</div>
 <div class="live-card-title">Equity Curve</div>
 </div>
 <div class="live-card-meta" id="liveEquityMeta">Dots mark trade open/close events.</div>
 </div>
 <div class="live-equity-chart" id="liveEquityChart">
 <div class="empty">
 <div class="ei">--</div>
 <div class="eh">No session history yet</div>
 <div class="es">Refresh live data to build today&apos;s curve and journal markers.</div>
 </div>
 </div>
 </article>

 <article class="live-positions-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">OPEN POSITIONS</div>
 <div class="live-card-title">Current Exposure</div>
 </div>
 <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
 <div class="live-card-meta" id="livePositionsMeta">Waiting for private account data.</div>
 <button class="bsm live-view-toggle" data-positions-view="cards" title="Card View">Cards</button>
 <button class="bsm live-view-toggle active" data-positions-view="table" title="Table View">Table</button>
 </div>
 </div>
 <div class="live-positions-controls" id="livePositionsControls">
 <div class="pos-filter-pills">
 <button class="bsm pos-filter active" data-positions-filter="all">All</button>
 <button class="bsm pos-filter" data-positions-filter="long">Long</button>
 <button class="bsm pos-filter" data-positions-filter="short">Short</button>
 <button class="bsm pos-filter" data-positions-filter="straddles">Straddles</button>
 </div>
 <input class="si pos-search-input" id="positionsSearchInput" type="text" placeholder="Search coin..."/>
 <select class="pos-sort-select" id="positionsSortSelect">
 <option value="default">Sort: Default</option>
 <option value="upnl_desc">UPNL &#9660;</option>
 <option value="upnl_asc">UPNL &#9650;</option>
 <option value="size_desc">Size &#9660;</option>
 <option value="symbol_asc">Symbol A&#8211;Z</option>
 </select>
 <div class="pos-bulk-actions" id="livePositionsBulkActions"></div>
 <div class="pos-risk-context" id="livePositionsRiskContext"></div>
 </div>
 <div class="live-positions-rows" id="livePositionsRows">
 <div class="empty">
 <div class="ei">--</div>
 <div class="eh">No open positions loaded</div>
 <div class="es">Add your Delta API key and secret in Settings, then refresh this desk.</div>
 </div>
 </div>
 </article>

 <div class="analytics-live-review-grid positions-live-review-grid" id="positionsLiveReview">
 <article class="live-journal-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">REVIEW LOOP</div>
 <div class="live-card-title">Trade Journal</div>
 </div>
 <div class="live-card-meta" id="liveJournalMeta">Closed live trades will appear here.</div>
 <button class="bsm" id="btnExportJournalCSV" style="margin:4px 0 0 0;font-size:10px;padding:3px 10px;" title="Download trade journal as CSV">CSV</button>
 </div>
 <div class="live-journal-replay-panel" id="liveJournalReplayPanel">
 <div class="empty">
 <div class="ei">--</div>
 <div class="eh">Replay workflow waiting</div>
 <div class="es">Closed trades will show a timeline, entry reason, exit reason, mistake tags, and setup performance.</div>
 </div>
 </div>
 <div class="live-journal-rows" id="liveJournalRows">
 <div class="empty">
 <div class="ei">--</div>
 <div class="eh">No journal trades yet</div>
 <div class="es">Closed positions detected from Delta history will appear here.</div>
 </div>
 </div>
 </article>
 </div>
 </section>
 </div></div>
 </div>`,

 'orders': ` <div class="phdr positions-pane-header orders-pane-header">
 <div class="research-pane-copy">
 <span>Delta Orders Desk</span>
 <small class="phdr-sub">Working orders, protection controls, and live exchange order activity.</small>
 </div>
 <div class="phdr-btns research-pane-actions">
 <button class="bsm" type="button" data-live-account-sync-toggle>Auto Sync On</button>
 <button class="bsm" id="btnLiveOrdersRefresh">Refresh</button>
 <button class="bsm" id="btnLiveOrdersOpenPositions">Positions</button>
 <button class="bsm" id="btnLiveOrdersToTrade">Trade from Scanner</button>
 </div>
 </div>
 <div class="live-orders-shell">
 <div class="live-account-status" id="liveOrdersStatus">Load a Trade Enabled or Read Only profile with session secrets to fetch private Delta account data.</div>
 <div class="trading-ui-toolbar">
 <div class="trading-toolbar-copy"><strong>Order management desk</strong><span>Pending entries, stops, targets, and attention items grouped by purpose.</span></div>
 <div class="trading-toolbar-actions">
 <button class="bsm trading-density-toggle" type="button" data-trading-density-toggle>Compact density</button>
 </div>
 </div>
 <div class="live-order-audit-rows live-system-health-strip" id="liveOrdersHealthBar">
 <div class="empty"><div class="ei">+</div><div class="eh">System health will appear here</div><div class="es">Refresh live data to review engine, profile, kill switch, slots, daily loss, funding feed, and sync status.</div></div>
 </div>
 <div class="orders-subtab-nav" id="ordersSubtabNav">
 <button class="orders-subtab-btn active" data-order-subtab="open-orders">Open Orders</button>
 <button class="orders-subtab-btn" data-order-subtab="stop-target">Stop &amp; Target</button>
 <button class="orders-subtab-btn" data-order-subtab="audit-recon">Audit &amp; Recon</button>
 <button class="orders-subtab-btn" data-order-subtab="notifications">Notifications</button>
 </div>
 <div class="orders-status-rail" id="liveOrdersStatusRail"></div>
 <div class="live-orders-layout">

 <section class="orders-subtab-panel active" data-order-subtab-panel="open-orders">
 <article class="live-open-orders-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">WORKING ORDERS</div>
 <div class="live-card-title">Open Orders</div>
 </div>
 <div class="live-card-head-actions">
 <select class="si live-open-orders-symbol" id="liveOpenOrdersSymbolSelect">
 <option value="">All symbols</option>
 </select>
 <button class="bsm" id="btnLiveCancelSymbolOrders" disabled>Cancel All for Symbol</button>
 <div class="live-card-meta" id="liveOpenOrdersMeta">Waiting for open orders.</div>
 </div>
 </div>
 <div class="live-open-orders-rows" id="liveOpenOrdersRows">
 <div class="empty"><div class="ei">--</div><div class="eh">No open orders loaded</div><div class="es">Refresh live data to inspect, edit, or cancel live Delta orders.</div></div>
 </div>
 </article>

 <article class="live-order-lineage-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">FAMILY VIEW</div>
 <div class="live-card-title">Entry to Protection Lineage</div>
 </div>
 <div class="live-card-meta" id="liveOrderLineageMeta">Waiting for working-order lineage.</div>
 </div>
 <div class="live-order-lineage-rows" id="liveOrderLineageRows">
 <div class="empty"><div class="ei">--</div><div class="eh">No order families loaded</div><div class="es">Refresh live data to tie entries, positions, and linked stop/target orders together.</div></div>
 </div>
 </article>

 <article class="live-trade-history-card" id="liveTradeHistorySection">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">EXCHANGE FEED</div>
 <div class="live-card-title">Trade History</div>
 </div>
 <div class="live-card-meta" id="liveTradeHistoryMeta">Waiting for Delta order history.</div>
 </div>
 <div class="live-trade-history-rows" id="liveTradeHistoryRows">
 <div class="empty"><div class="ei">--</div><div class="eh">No trade activity loaded</div><div class="es">Refresh live data to load fills and order history from Delta Exchange.</div></div>
 </div>
 </article>
 </section>

 <section class="orders-subtab-panel" data-order-subtab-panel="stop-target">
 <article class="live-positions-card live-position-control-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">PROTECTION DESK</div>
 <div class="live-card-title">Targets, Stops &amp; Linked Orders</div>
 </div>
 <div class="live-card-meta" id="livePositionProtectionMeta">Waiting for live protection controls.</div>
 </div>
 <div class="live-positions-rows live-position-control-rows" id="livePositionProtectionRows">
 <div class="empty"><div class="ei">--</div><div class="eh">No protection controls loaded</div><div class="es">Refresh live data to manage stops, targets, and linked Delta orders.</div></div>
 </div>
 </article>
 </section>

 <section class="orders-subtab-panel" data-order-subtab-panel="audit-recon">
 <article class="live-order-audit-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">DECISION TRAIL</div>
 <div class="live-card-title">Auto-Trade Audit</div>
 </div>
 <div class="live-card-meta" id="liveOrderAuditMeta">Waiting for the last engine decision.</div>
 </div>
 <div class="live-order-audit-rows" id="liveOrderAuditRows">
 <div class="empty"><div class="ei">--</div><div class="eh">No decision audit yet</div><div class="es">Run the scanner with auto-trade enabled to capture the latest allow or block reason.</div></div>
 </div>
 </article>

 <article class="live-order-audit-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">RECONCILIATION</div>
 <div class="live-card-title">Exchange vs Tracker</div>
 </div>
 <div class="live-card-meta" id="liveReconciliationMeta">Waiting for reconciliation data.</div>
 </div>
 <div class="live-order-audit-rows" id="liveReconciliationRows">
 <div class="empty"><div class="ei">--</div><div class="eh">No reconciliation yet</div><div class="es">Refresh live data to compare exchange positions, queued entries, protection, and tracked auto-trade records.</div></div>
 </div>
 </article>
 </section>

 <section class="orders-subtab-panel" data-order-subtab-panel="notifications">
 <article class="live-order-audit-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">NOTIFICATION CENTER</div>
 <div class="live-card-title">What Happened and Why</div>
 </div>
 <div class="live-card-meta" id="liveNotificationMeta">Waiting for system notifications.</div>
 </div>
 <div class="live-order-audit-rows" id="liveNotificationRows">
 <div class="empty"><div class="ei">--</div><div class="eh">No notifications yet</div><div class="es">Auto-trade lifecycle updates and recent signal alerts will explain what happened, why, and what comes next.</div></div>
 </div>
 </article>
 </section>
`,

 'funding': ` <div class="phdr research-pane-head research-pane-head--funding" style="padding-bottom: 6px;">
 <div class="research-pane-copy" style="flex: 1;">
 <div style="display:flex; align-items:center; gap:12px; margin-bottom:4px;">
 <span style="font-size:14px;">Funding Map</span>
 <div class="fund-view-toggle research-pane-actions" style="width:auto;">
 <button class="fv-btn active" data-view="heatmap" style="padding:4px 10px;">HEATMAP</button>
 <button class="fv-btn" data-view="arbitrage" style="padding:4px 10px;">ARBITRAGE</button>
 </div>
 </div>
 <small class="phdr-sub">Red (+FR) = longs crowded. Green (-FR) = shorts crowded. Annual view is a stress run-rate, not fixed interest.</small>
 </div>
 <div class="funding-toolbar">
 <input class="si funding-search-input" type="search" id="fundingSearchInput" placeholder="Search funding..." aria-label="Search funding coins"/>
 <button class="bsm funding-annual-toggle" type="button" id="fundingAnnualToggle" aria-pressed="false">8h Rate</button>
 </div>
 </div>
 <div class="funding-command-strip" id="fundingCommandStrip">
 <div class="funding-command-card is-waiting"><span>Extreme Longs</span><strong>-</strong><small>Short squeeze risk read</small></div>
 <div class="funding-command-card is-waiting"><span>Extreme Shorts</span><strong>-</strong><small>Long squeeze risk read</small></div>
 <div class="funding-command-card is-waiting"><span>Market Bias</span><strong>Loading</strong><small>Waiting for funding scan</small></div>
 <div class="funding-command-card is-waiting"><span>Best Short Watch</span><strong>-</strong><small>Highest positive funding</small></div>
 <div class="funding-command-card is-waiting"><span>Best Long Watch</span><strong>-</strong><small>Lowest negative funding</small></div>
 </div>

 <!-- Heatmap View -->
 <div id="fundingHeatmapView" class="funding-view funding-view-heatmap">
 <div class="fr-stats-compact" style="display:flex; gap:12px; padding:6px 14px; background:rgba(255,255,255,.02); border-bottom:1px solid var(--border); align-items:center;">
 <div class="fr-stat-mini" style="display:flex; gap:6px; align-items:baseline;"><span class="fr-sl" style="font-size:9px;color:#ff1a40;">EXT+</span><strong class="fr-sv red" id="frExPos" style="font-size:13px;font-weight:800;color:#ff1a40;">-</strong></div>
 <div class="fr-stat-mini" style="display:flex; gap:6px; align-items:baseline;"><span class="fr-sl" style="font-size:9px;color:#00e5a0;">EXT-</span><strong class="fr-sv green" id="frExNeg" style="font-size:13px;font-weight:800;color:#00e5a0;">-</strong></div>
 <div class="fr-stat-mini" style="display:flex; gap:6px; align-items:baseline;"><span class="fr-sl" style="font-size:9px;color:#ffc840;">HIGH</span><strong class="fr-sv warn" id="frHigh" style="font-size:13px;font-weight:800;color:#ffc840;">-</strong></div>
 <div class="fr-stat-mini" style="display:flex; gap:6px; align-items:baseline;"><span class="fr-sl" style="font-size:9px;color:#7a8ab0;">AVG</span><strong class="fr-sv" id="frAvg" style="font-size:13px;font-weight:800;color:#f4f8ff;">-</strong></div>
 <div class="fr-stat-mini" style="display:flex; gap:6px; align-items:baseline; border-left:1px solid var(--border); padding-left:12px;"><span class="fr-sl" style="font-size:9px;color:#7a8ab0;">TOTAL</span><strong class="fr-sv" id="frTotal" style="font-size:12px;font-weight:700;color:#f4f8ff;">-</strong></div>
 <div class="fr-dominance" id="frDominance" style="flex:1; text-align:right; font-size:10px; border:none; padding:0; background:none; font-weight:700; color:#00e5a0;"></div>
 </div>
 
 <div class="fr-controls-row" style="display:flex; padding:6px 14px; background:rgba(10,18,30,.96); border-bottom:1px solid var(--border); align-items:center;">
 <div class="fr-sector-filter" id="frSectorFilter" style="display:none; border:none; padding:0; background:none; overflow-x:auto;">
 <button class="fr-sec-btn active" data-sector="">ALL</button>
 </div>
 <div class="funding-quick-filters" id="fundingQuickFilters">
 <button class="fr-sec-btn active" data-funding-filter="all">All</button>
 <button class="fr-sec-btn" data-funding-filter="longs">Long crowd</button>
 <button class="fr-sec-btn" data-funding-filter="shorts">Short crowd</button>
 <button class="fr-sec-btn" data-funding-filter="extreme">Extreme</button>
 <button class="fr-sec-btn" data-funding-filter="liquid">Liquid</button>
 </div>
 <div class="fr-legend-mini" style="display:flex; gap:8px; margin-left:auto; font-size:9px; color:#5a6a8a; align-items:center; flex-shrink:0;">
 <div class="fr-leg-item" style="display:flex; gap:4px; align-items:center;"><div class="fr-dot fh-extreme-pos"></div><span title=">0.1%">Ext+</span></div>
 <div class="fr-leg-item" style="display:flex; gap:4px; align-items:center;"><div class="fr-dot fh-high-pos"></div><span title=">0.05%">High+</span></div>
 <div class="fr-leg-item" style="display:flex; gap:4px; align-items:center;"><div class="fr-dot fh-med-pos"></div><span title=">0.01%">Mod+</span></div>
 <div class="fr-leg-item" style="display:flex; gap:4px; align-items:center;"><div class="fr-dot fh-med-neg"></div><span title="< -0.01%">Mod-</span></div>
 <div class="fr-leg-item" style="display:flex; gap:4px; align-items:center;"><div class="fr-dot fh-high-neg"></div><span title="< -0.05%">High-</span></div>
 <div class="fr-leg-item" style="display:flex; gap:4px; align-items:center;"><div class="fr-dot fh-extreme-neg"></div><span title="< -0.1%">Ext-</span></div>
 </div>
 </div>
 
 <div class="empty" id="fundingNoData" style="display:flex">
 <div class="ei">--</div>
 <div class="eh">No funding data yet</div>
 <div class="es">Run a scan first</div>
 </div>
 <div class="funding-workbench">
 <section class="funding-grid-panel">
 <div class="funding-grid" id="fundingGrid" style="display:none; flex:1; overflow-y:auto; padding:10px;"></div>
 </section>
 <aside class="funding-detail-rail">
 <div class="funding-detail-card" id="fundingSelectedPanel">
 <div class="research-detail-empty">Select a funding tile to inspect the setup.</div>
 </div>
 <div class="funding-detail-card" id="fundingOpportunityRail">
 <div class="research-detail-empty">Top crowding names will appear after scan.</div>
 </div>
 </aside>
 </div>
 </div>

 <!-- Arbitrage View -->
 <div id="fundingArbView" class="funding-view funding-view-arb" hidden>
 <div class="arb-sections">
 <div class="arb-section">
 <div class="arb-section-title red">LONGS PAYING (Contrarian Short Opportunity)</div>
 <div id="arbLongsPaying" class="arb-list">No data - run a scan first</div>
 </div>
 <div class="arb-section">
 <div class="arb-section-title green">SHORTS PAYING (Contrarian Long Opportunity)</div>
 <div id="arbShortsPaying" class="arb-list">No data - run a scan first</div>
 </div>
 </div>
 <div class="arb-guide">
 <b>Guide:</b> +FR = crowded longs, -FR = crowded shorts, filtered by minimum USD volume.
 </div>
 </div>
`,

 'corr': ` <div class="phdr research-pane-head research-pane-head--corr">
 <div class="research-pane-copy">
 <span>Correlation Matrix</span>
 <div class="research-pane-pills">
 <span class="research-pane-pill">Cluster risk</span>
 <span class="research-pane-pill">Inverse hedge</span>
 <span class="research-pane-pill">Click symbol to inspect peers</span>
 </div>
 <small class="phdr-sub">Top 20 names, last 100 candles. Use before stacking highly related positions.</small>
 </div>
 <div class="phdr-btns">
 <input class="fi corr-search" type="text" id="corrSearch" placeholder="Search symbol"/>
 <button class="bsm" id="btnRefreshCorr">Rebuild</button>
 </div>
 </div>
 <div class="research-pane-strip">
 <div class="research-pane-strip-item"><span>Purpose</span><strong>Spot crowded baskets before adding risk</strong></div>
 <div class="research-pane-strip-item"><span>Read</span><strong>High positive names behave like one trade</strong></div>
 <div class="research-pane-strip-item"><span>Use</span><strong>Pair it with Funding and VAR before scaling in</strong></div>
 </div>
 <div class="corr-wrap" id="corrWrap">
 <div class="corr-risk-drawer" id="corrRiskDrawer">
 <div class="research-detail-kicker">Basket Risk Detail</div>
 <div class="research-detail-title">Select a symbol</div>
 <div class="research-detail-line">Click a matrix row or cell to inspect close peers, inverse hedges, and position-stacking risk.</div>
 </div>
 <div class="empty">
 <div class="ei">--</div>
 <div class="eh">No matrix yet</div>
 <div class="es">Run a scan or click Rebuild to generate correlations.</div>
 </div>
 </div>
`,

 'backtest': ` <div class="bt-top bt-top-stage research-pane-head research-pane-head--backtest">
 <div class="bt-launcher">
 <div class="bt-launch-copy">
 <div class="research-detail-kicker">Backtest Launcher</div>
 <strong>Replay a setup before promoting it</strong>
 <small>Run scanner-style backtests with score, lookback, fees, slippage, direction, and strategy context.</small>
 </div>
 <div class="bt-row bt-control-row">
 <label class="bt-field"><span>Symbol</span><input type="text" class="fi" id="btSymbol" placeholder="BTCUSD" value="BTCUSD"/></label>
 <label class="bt-field"><span>Strategy</span><select class="fi" id="btStrategyPreset"><option value="scanner">Current scanner setup</option><option value="funding">Funding contrarian</option><option value="breakout">Breakout validation</option><option value="mean_reversion">Mean reversion</option></select></label>
 <label class="bt-field"><span>Direction</span><select class="fi" id="btDirection"><option value="both">Both</option><option value="long">Long only</option><option value="short">Short only</option></select></label>
 <label class="bt-field"><span>Lookback</span><input type="number" class="fi" id="btLookbackDays" min="100" max="500" step="10" value="500"/></label>
 <label class="bt-field"><span>Min Score</span><input type="number" class="fi" id="btMinScore" min="0" max="100" step="1" placeholder="Auto"/></label>
 <label class="bt-field"><span>Fees %</span><input type="number" class="fi" id="btFeesPct" min="0" max="2" step="0.001" value="0.059"/></label>
 <label class="bt-field"><span>Slippage %</span><input type="number" class="fi" id="btSlippagePct" min="0" max="5" step="0.01" value="0.10"/></label>
 <div class="bt-launch-actions">
 <button class="btn-bt" id="btnRunBT">RUN TEST</button>
 <button class="bsm" id="btnExportBT">DOWNLOAD CSV</button>
 </div>
 </div>
 <div class="bt-preset-row">
 <button class="bt-preset active" type="button" data-bt-preset="scanner">Scanner setup</button>
 <button class="bt-preset" type="button" data-bt-preset="funding">Funding contrarian</button>
 <button class="bt-preset" type="button" data-bt-preset="breakout">Breakout validation</button>
 <button class="bt-preset" type="button" data-bt-preset="mean_reversion">Mean reversion</button>
 </div>
 </div>
 </div>
 <div id="btResult" class="bt-result">
 <div class="bt-empty-launch">
 <div>
 <span>Ready</span>
 <strong>No backtest yet</strong>
 <small>Choose a symbol and preset. The result will show verdict, equity curve, drawdown, trade log, stop sweep, and setup/regime audit.</small>
 </div>
 <div class="bt-empty-grid">
 <div><span>Verdict</span><strong>Waiting</strong></div>
 <div><span>Charts</span><strong>Equity + DD</strong></div>
 <div><span>Replay</span><strong>Trade rows</strong></div>
 </div>
 </div>
 </div>
`,

 'riskcalc': ` <div class="rc-wrap risk-cockpit">
 <div class="risk-cockpit-head">
 <div>
 <div class="risk-cockpit-kicker">Risk &amp; Automation</div>
 <div class="rc-title">Sizing, Guards &amp; Value at Risk</div>
 <div class="rc-sub">One place for live risk state, API safety, automation rules, position sizing, slot capacity, and sector exposure.</div>
 </div>
 <div class="risk-cockpit-actions">
 <button class="bsm" type="button" data-settings-tab="strategy" data-settings-target-jump="api-keys">API Safety</button>
 <button class="bsm" type="button" data-settings-tab="strategy" data-settings-target-jump="futures-auto">Automation Rules</button>
 <button class="bsm" type="button" data-settings-tab="strategy" data-settings-target-jump="risk">Risk Settings</button>
 </div>
 </div>
 <div class="risk-auto-strip" id="riskAutomationStrip">
 <div class="risk-auto-status is-waiting"><span>Profile</span><strong>Loading</strong><small>Waiting for account profile</small></div>
 <div class="risk-auto-status is-waiting"><span>API</span><strong>Loading</strong><small>Waiting for credential state</small></div>
 <div class="risk-auto-status is-waiting"><span>Risk</span><strong>Loading</strong><small>Waiting for VAR state</small></div>
 <div class="risk-auto-status is-waiting"><span>Automation</span><strong>Loading</strong><small>Waiting for rules</small></div>
 <div class="risk-auto-status is-waiting"><span>Kill Switch</span><strong>Loading</strong><small>Waiting for guard state</small></div>
 </div>
 <div class="risk-auto-tabs" role="tablist" aria-label="Risk and automation cockpit modes">
 <button class="risk-auto-tab active" type="button" data-risk-auto-tab="cockpit" role="tab" aria-selected="true">Risk Cockpit</button>
 <button class="risk-auto-tab" type="button" data-risk-auto-tab="api" role="tab" aria-selected="false">API &amp; Safety Integration</button>
 <button class="risk-auto-tab" type="button" data-risk-auto-tab="automation" role="tab" aria-selected="false">Automation Rules</button>
 </div>
 <div class="risk-bridge-banner" id="riskBridgeBanner" hidden></div>
 <div class="risk-manage-board" id="riskManageBoard"></div>
 <section class="risk-auto-panel active" data-risk-auto-panel="cockpit">
 <div class="risk-auto-decision" id="riskAutomationDecision">
 <div class="risk-auto-decision-main">
 <span>Decision Engine</span>
 <strong>Loading current gate result</strong>
 <small>The cockpit checks profile, API, kill switch, daily loss, slots, symbol blocks, and automation mode before allowing live action.</small>
 </div>
 <div class="risk-auto-checks" id="riskAutomationChecks"></div>
 </div>
 <div class="risk-cockpit-grid">
 <section class="risk-cockpit-panel risk-cockpit-panel--sizing">
 <div class="risk-cockpit-panel-head">
 <span>Position Sizer</span>
 <small>Contracts, margin, leverage, and target ladder.</small>
 </div>
 <div class="rc-workspace">
 <div class="rc-form-shell">
 <div class="rc-panel-head">
 <div class="rc-panel-title">Trade Inputs</div>
 <div class="rc-panel-copy">Balance syncs from the active live wallet when available. You can still override it manually.</div>
 </div>
 <div class="rc-form">
 <div class="rc-group">
 <div class="rc-label-row">
 <div class="rc-label">Account Balance</div>
 <div class="rc-label-note" id="rcBalanceMeta">Waiting for wallet sync</div>
 </div>
 <input type="number" class="rc-input" id="rcBalance" placeholder="Auto-syncs from wallet" step="any"/>
 </div>
 <div class="rc-group">
 <div class="rc-label">Risk per Trade (%)</div>
 <div class="rc-presets">
 <button class="rc-pre" data-val="0.5">0.5%</button>
 <button class="rc-pre" data-val="1">1%</button>
 <button class="rc-pre" data-val="2">2%</button>
 <button class="rc-pre" data-val="3">3%</button>
 </div>
 <input type="number" class="rc-input" id="rcRisk" placeholder="e.g. 1" step="0.1" value="1" min="0.1" max="100"/>
 </div>
 <div class="rc-group">
 <div class="rc-label">Entry Price</div>
 <input type="number" class="rc-input" id="rcEntry" placeholder="e.g. 95000" step="any"/>
 </div>
 <div class="rc-group">
 <div class="rc-label">Stop Loss Price</div>
 <input type="number" class="rc-input" id="rcSL" placeholder="e.g. 93500" step="any"/>
 </div>
 <div class="rc-group">
 <div class="rc-label">Max Leverage</div>
 <input type="number" class="rc-input" id="rcLev" placeholder="e.g. 5" step="1" value="5" min="1" max="100"/>
 </div>
 <button class="btn-scan" id="btnCalc" style="width:100%;margin-top:4px">CALCULATE</button>
 </div>
 </div>
 <div class="rc-result-shell">
 <div class="rc-panel-head">
 <div class="rc-panel-title">Sizing Output</div>
 <div class="rc-panel-copy">Contracts, leverage, margin, and profit targets update from your current risk plan.</div>
 </div>
 <div class="rc-empty-state" id="rcEmptyState">
 <div class="rc-empty-kicker">Risk Plan</div>
 <strong>Ready to size the trade</strong>
 <span>Send any scanner setup to Risk or enter balance, entry, and stop values to calculate contracts, margin, and target ladder.</span>
 </div>
 <div id="rcResult" style="display:none">
 <div class="rc-divider"></div>
 <div class="rc-main-result">
 <div class="rc-mr-label">Position Size</div>
 <div class="rc-mr-value" id="rcContracts">-</div>
 <div class="rc-mr-sub" id="rcContractsSub">contracts</div>
 </div>
 <div class="rc-grid">
 <div class="rc-cell"><div class="rc-cl">$ at Risk</div><div class="rc-cv red" id="rcDollarRisk">-</div></div>
 <div class="rc-cell"><div class="rc-cl">Position Value</div><div class="rc-cv" id="rcPosValue">-</div></div>
 <div class="rc-cell"><div class="rc-cl">Required Margin</div><div class="rc-cv" id="rcMargin">-</div></div>
 <div class="rc-cell"><div class="rc-cl">SL Distance</div><div class="rc-cv" id="rcSlDist">-</div></div>
 <div class="rc-cell"><div class="rc-cl">Lev Needed</div><div class="rc-cv" id="rcLevNeeded">-</div></div>
 <div class="rc-cell"><div class="rc-cl">Max Lev Warning</div><div class="rc-cv" id="rcLevWarn">-</div></div>
 </div>
 <div class="rc-tp-section">
 <div class="rc-tp-title">Take Profit Levels (based on R:R)</div>
 <div class="rc-tp-row">
 <div class="rc-tp-item"><div class="rc-tp-l">TP1 (1:2)</div><div class="rc-tp-v green" id="rcTP1">-</div></div>
 <div class="rc-tp-item"><div class="rc-tp-l">TP2 (1:3)</div><div class="rc-tp-v green" id="rcTP2">-</div></div>
 <div class="rc-tp-item"><div class="rc-tp-l">TP3 (1:5)</div><div class="rc-tp-v green" id="rcTP3">-</div></div>
 </div>
 </div>
 <div class="rc-advice" id="rcAdvice"></div>
 </div>
 </div>
 </div>
 </section>
 <section class="risk-cockpit-panel risk-cockpit-panel--var">
 <div class="risk-cockpit-panel-head">
 <span>Capital VAR</span>
 <small>Cycle drawdown, directional allocation, and sector limits.</small>
 </div>
 <div class="var-dashboard">
 <div class="var-summary-grid" id="varSummaryGrid">
 <div class="var-card">
 <div class="var-card-label">Total Capital</div>
 <div class="var-card-value" id="varTotalCapital">-</div>
 </div>
 <div class="var-card">
 <div class="var-card-label">Max Drawdown</div>
 <div class="var-card-value" id="varMaxDD">-</div>
 <div class="var-card-sub" id="varMaxDDPct"></div>
 </div>
 <div class="var-card">
 <div class="var-card-label">Per Cycle Budget</div>
 <div class="var-card-value" id="varCycleBudget">-</div>
 <div class="var-card-sub" id="varCycleLabel"></div>
 </div>
 <div class="var-card">
 <div class="var-card-label">Per Lot Loss Cap</div>
 <div class="var-card-value" id="varPerLotLoss">-</div>
 </div>
 </div>
 <div class="var-section">
 <div class="var-section-head">Cycle Progress</div>
 <div class="var-cycle-track" id="varCycleTrack"></div>
 <div class="var-cycle-bar-wrap">
 <div class="var-cycle-bar" id="varCycleBar">
 <div class="var-cycle-fill" id="varCycleFill"></div>
 </div>
 <div class="var-cycle-stats" id="varCycleStats"></div>
 </div>
 </div>
 <div class="var-section">
 <div class="var-section-head">Directional Allocation</div>
 <div class="var-subtitle" id="varBiasNote">Bias-aware 70/30 split from total VAR capacity.</div>
 <div class="var-alloc-grid" id="varAllocGrid">
 <div class="var-alloc-col long">
 <div class="var-alloc-title">LONG</div>
 <div class="var-alloc-budget" id="varLongBudget">-</div>
 <div class="var-alloc-bar"><div class="var-alloc-fill" id="varLongFill"></div></div>
 <div class="var-alloc-positions" id="varLongPositions">0 / - positions</div>
 </div>
 <div class="var-alloc-col short">
 <div class="var-alloc-title">SHORT</div>
 <div class="var-alloc-budget" id="varShortBudget">-</div>
 <div class="var-alloc-bar"><div class="var-alloc-fill" id="varShortFill"></div></div>
 <div class="var-alloc-positions" id="varShortPositions">0 / - positions</div>
 </div>
 </div>
 </div>
 <div class="var-section">
 <div class="var-section-head">Sector Exposure</div>
 <div class="var-sector-grid" id="varSectorGrid"></div>
 </div>
 <div class="var-status" id="varStatus"></div>
 </div>
 </section>
 </div>
 </section>
 <section class="risk-auto-panel" data-risk-auto-panel="api">
 <div class="risk-auto-surface" id="riskApiSafetySurface">
 <div class="risk-auto-surface-head">
 <div>
 <span>API &amp; Safety Integration</span>
 <strong>Private account readiness</strong>
 </div>
 <button class="bsm" type="button" data-settings-tab="strategy" data-settings-target-jump="api-keys">Open API Keys</button>
 </div>
 <div class="risk-auto-grid" id="riskApiSafetyGrid"></div>
 <div class="risk-auto-note" id="riskApiSafetyNote">API safety status will update from the active profile, credential state, runtime quota, live sync, and kill switch.</div>
 </div>
 </section>
 <section class="risk-auto-panel" data-risk-auto-panel="automation">
 <div class="risk-auto-surface" id="riskAutomationRulesSurface">
 <div class="risk-auto-surface-head">
 <div>
 <span>Automation Rules</span>
 <strong>What the engine can do before any order</strong>
 </div>
 <button class="bsm" type="button" data-settings-tab="strategy" data-settings-target-jump="futures-auto">Open Futures Gates</button>
 </div>
 <div class="risk-auto-rule-preview" id="riskAutomationRulePreview"></div>
 <div class="risk-auto-grid" id="riskAutomationRulesGrid"></div>
 <div class="risk-auto-note" id="riskAutomationRulesNote">Live automation remains blocked unless profile capability, API credentials, kill switch, daily loss, trade slots, and signal gates all pass.</div>
 </div>
 </section>
 </div>
`,

 'strategy': ` <section class="account-profiles-panel">
 <div class="account-profiles-layout">
 <div class="account-profile-sidebar">
 <nav class="settings-left-rail" aria-label="Settings sections">
 <div class="settings-rail-group">
 <div class="settings-rail-group-title">Basic scanner settings</div>
 <button class="settings-rail-item active" type="button" data-settings-target="display"><span>Display &amp; Currency</span><small>Report currency and symbols</small></button>
 <button class="settings-rail-item" type="button" data-settings-target="scanner-rules"><span>Scanner Rules</span><small>Signals, filters, and FWD-10</small></button>
 <button class="settings-rail-item" type="button" data-settings-target="strategy-profiles"><span>Strategy Profiles</span><small>Presets for risk and scanning</small></button>
 <button class="settings-rail-item" type="button" data-settings-target="charts"><span>Charts &amp; Key Levels</span><small>Default chart view and levels</small></button>
 </div>
 <div class="settings-rail-group">
 <div class="settings-rail-group-title">Live trading profile</div>
 <button class="settings-rail-item" type="button" data-settings-target="profile"><span>Profile</span><small>User, venue, and mode</small></button>
 <button class="settings-rail-item" type="button" data-settings-target="paper-mode"><span>Paper Trading</span><small>Forward test without live orders</small></button>
 <button class="settings-rail-item" type="button" data-settings-target="api-keys"><span>API Keys</span><small>Credentials and kill switch</small></button>
 <button class="settings-rail-item" type="button" data-settings-target="connection"><span>Connection Check</span><small>Market-data readiness</small></button>
 <button class="settings-rail-item" type="button" data-settings-target="security"><span>Login Security</span><small>Password and Authenticator</small></button>
 </div>
 <div class="settings-rail-group">
 <div class="settings-rail-group-title">Risk rules</div>
 <button class="settings-rail-item" type="button" data-settings-target="risk"><span>Risk Defaults</span><small>Balance and day loss</small></button>
 <button class="settings-rail-item" type="button" data-settings-target="guards"><span>Live Guards</span><small>Order size and blocks</small></button>
 <button class="settings-rail-item" type="button" data-settings-target="var"><span>VaR Planning</span><small>Slots and drawdown cycle</small></button>
 <button class="settings-rail-item" type="button" data-settings-target="risk-templates"><span>Scanner Risk Templates</span><small>ATR stop and target R:R</small></button>
 <button class="settings-rail-item" type="button" data-settings-target="futures-auto"><span>Futures Gates</span><small>Risk quality and auto-trade</small></button>
 </div>
 <div class="settings-rail-group">
 <div class="settings-rail-group-title">Integrations</div>
 <button class="settings-rail-item" type="button" data-settings-tab="webhooks"><span>Telegram &amp; Webhooks</span><small>External alerts and POSTs</small></button>
 <button class="settings-rail-item" type="button" data-settings-target="backup"><span>Notifications &amp; Backup</span><small>Browser alerts and archive</small></button>
 </div>
 <div class="settings-rail-group">
 <div class="settings-rail-group-title">Developer/debug</div>
 <button class="settings-rail-item" type="button" data-settings-target="recovery"><span>Recovery Center</span><small>Fix blocked runtime state</small></button>
 <button class="settings-rail-item" type="button" data-settings-target="api"><span>API Health</span><small>Quota and candle cache</small></button>
 <button class="settings-rail-item" type="button" data-settings-tab="debug"><span>Debug Log</span><small>Raw scan diagnostics</small></button>
 </div>
 <details class="settings-rail-more">
 <summary>Advanced automation</summary>
 <button class="settings-rail-item" type="button" data-settings-target="dca"><span>DCA Bot</span><small>Live order schedule</small></button>
 <button class="settings-rail-item" type="button" data-settings-target="options-auto"><span>Options Auto-Trade</span><small>Theta desk rules</small></button>
 <button class="settings-rail-item" type="button" data-settings-target="straddle-auto"><span>Short Straddle</span><small>Expiry and re-entry</small></button>
 </details>
 </nav>
 </div>
 <div class="account-profile-editor">
 <input type="hidden" id="accountProfileId"/>
 <input type="hidden" id="accountProfileCapability" value="Public"/>
 <section class="settings-health-card settings-panel-card" data-settings-panel="display">
 <div class="settings-health-head">
 <strong>Display &amp; Currency</strong>
 <span>Choose how report amounts are shown across the desk.</span>
 </div>
 <div class="account-editor-grid">
 <label class="account-field">
 <span>Report Currency</span>
 <select class="si" id="sReportDisplayCurrency">
 <option value="USD">US Dollar ($)</option>
 <option value="INR">Rupees (Rs)</option>
 </select>
 </label>
 <label class="account-field">
 <span>USD to INR Rate</span>
 <input class="si" id="sReportDisplayUsdInrRate" type="number" min="1" max="1000" step="0.0001" value="85"/>
 <small class="account-inline-note">Used only for display conversion in reports and desk summaries.</small>
 </label>
 </div>
 </section>
 <section class="settings-health-card settings-panel-card" data-settings-panel="paper-mode">
 <div class="settings-health-head">
 <strong>Paper Trading</strong>
 <span>Run the scanner and shadow ledger while live futures auto-trade stays off.</span>
 </div>
 <div class="settings-health-grid" id="paperModeStatusGrid">
 <div class="settings-health-item"><span>Paper Tracking</span><strong>Loading</strong></div>
 <div class="settings-health-item"><span>Live Auto-Trade</span><strong>Loading</strong></div>
 <div class="settings-health-item"><span>Paper Open</span><strong>-</strong></div>
 <div class="settings-health-item"><span>Paper Closed</span><strong>-</strong></div>
 <div class="settings-health-item"><span>Last Update</span><strong>-</strong></div>
 <div class="settings-health-item"><span>Auto Scan</span><strong>-</strong></div>
 </div>
 <div class="account-editor-actions settings-health-actions">
 <button class="bsm green" type="button" id="btnEnablePaperMode">Enable Paper Mode</button>
 <button class="bsm" type="button" data-v16-open-tab="analytics">Open Paper Ledger</button>
 <button class="btn secondary" type="button" id="btnResetPaperLedger">Reset Paper Ledger</button>
 </div>
 <div class="account-inline-note" id="paperModeStatusText">Paper mode uses the existing shadow ledger. It does not send live orders.</div>
 </section>

 <section class="settings-health-card settings-panel-card" data-settings-panel="connection">
 <div class="settings-health-head">
 <strong>Connection Check</strong>
 <span>Public Delta market-data checks for scanner readiness. Trading API keys are not required.</span>
 </div>
 <div class="settings-health-grid">
 <div class="settings-health-item"><span>API Region</span><strong id="settingsApiRegion">Not checked</strong></div>
 <div class="settings-health-item"><span>Tickers</span><strong id="settingsApiTickers">-</strong></div>
 <div class="settings-health-item"><span>Products</span><strong id="settingsApiProducts">-</strong></div>
 <div class="settings-health-item"><span>BTC Candles</span><strong id="settingsApiCandles">-</strong></div>
 <div class="settings-health-item"><span>Last Scan</span><strong id="settingsApiLastScan">Not run</strong></div>
 <div class="settings-health-item"><span>Stored Signals</span><strong id="settingsApiSignalCount">0</strong></div>
 </div>
 <div class="account-editor-actions settings-health-actions">
 <button class="bsm" type="button" id="btnRunApiCheck">Check Market Data</button>
 <button class="bsm" type="button" id="btnRunApiScan">Run Scan Test</button>
 </div>
 <div class="account-inline-note" id="settingsApiCheckStatus">Run the market-data check first, then run a scan test to verify the scanner end to end.</div>
 </section>
 <div class="account-editor-section" data-settings-panel="profile">
 <div class="account-editor-section-head">
 <strong>Profile</strong>
 <span>User name, desk label, venue, and operating mode.</span>
 </div>
 <div class="account-editor-grid">
 <label class="account-field"><span>User Name</span><input type="text" class="si" id="accountUsername" placeholder="Dhiraj"/></label>
 <label class="account-field"><span>Profile Name</span><input type="text" class="si" id="accountProfileName" placeholder="Public Desk"/></label>
 <label class="account-field"><span>Desk Label</span><input type="text" class="si" id="accountProfileDesk" placeholder="Trade Desk"/></label>
 <label class="account-field"><span>Venue</span><input type="text" class="si" id="accountProfileVenue" placeholder="Delta Exchange"/></label>
 <div class="account-field">
 <span>Mode</span>
 <div class="account-inline-note">Choose what the desk can read or execute.</div>
 </div>
 </div>
 <div class="account-capability-choices">
 <button class="account-capability-choice active" type="button" data-account-capability-choice="Public">Public</button>
 <button class="account-capability-choice" type="button" data-account-capability-choice="ReadOnly">Read Only</button>
 <button class="account-capability-choice" type="button" data-account-capability-choice="TradeEnabled">Trade Enabled</button>
 </div>
 </div>

 <div class="account-editor-section" data-settings-panel="guards">
 <div class="account-editor-section-head">
 <strong>Live Guards</strong>
 <span>Limits for new futures entries and blocked symbols.</span>
 </div>
 <div class="account-editor-grid">
 <label class="account-field"><span>Max Order Size (USD)</span><input type="number" class="si" id="accountMaxOrderSize" min="1" max="100000" step="1" placeholder="60" title="Hard cap on USD notional for new trade entries. Orders above this value will be blocked."/></label>
 <div class="account-field">
 <span>Coverage</span>
 <div class="account-inline-note">Exit orders are not blocked by these entry limits.</div>
 </div>
 </div>
 <label class="account-field account-field-full"><span>Blocked Symbols</span><input type="text" class="si" id="accountBlockedSymbols" placeholder="Comma-separated symbols like MEMEUSD, MONUSD"/></label>
 </div>

 <div class="account-editor-section" data-settings-panel="api">
 <div class="account-editor-section-head">
 <strong>API Health</strong>
 <span>Request quota, cooldown, and candle-cache status.</span>
 </div>
 <div class="account-editor-grid">
 <div class="account-field">
 <span>API Quota Health</span>
 <div class="account-inline-note" id="sApiQuotaHealth">Loading runtime health...</div>
 </div>
 <div class="account-field">
 <span>Candle Cache Health</span>
 <div class="account-inline-note" id="sCandleCacheHealth">Loading cache status...</div>
 </div>
 </div>
 <div class="account-editor-actions">
 <button class="bsm" type="button" id="btnRefreshRuntimeHealth">Refresh Runtime Health</button>
 <button class="btn secondary" type="button" id="btnClearCandleCache">Clear Candle Cache</button>
 </div>
 <div class="account-inline-note">When Delta rate-limits requests, the app pauses extra refreshes and uses cached data where available.</div>
 </div>

 <div class="account-editor-section" data-settings-panel="dca">
 <div class="account-editor-section-head">
 <strong>DCA Bot (Live Orders)</strong>
 <span>Repeated futures entries controlled by schedule, price step, profile caps, and kill switch.</span>
 </div>
 <div class="account-editor-grid">
 <label class="account-field account-field-full"><span>Enable</span><span class="scheck"><label><input type="checkbox" id="sDcaBotEnabled"/> Enable DCA bot <span style="color:#ff8080;font-weight:700;">(places real orders!)</span></label></span></label>
 <label class="account-field"><span>Symbol</span><input type="text" class="si" id="sDcaBotSymbol" value="BTCUSD" placeholder="BTCUSD"/></label>
 <label class="account-field"><span>Direction</span><select class="si" id="sDcaBotSide"><option value="long">Long accumulation</option><option value="short">Short accumulation</option></select></label>
 <label class="account-field"><span>Order Size (USD)</span><input type="number" class="si" id="sDcaBotOrderSizeUSD" value="5" min="1" max="100000" step="1"/></label>
 <label class="account-field"><span>Max Orders / Cycle</span><input type="number" class="si" id="sDcaBotMaxOrders" value="5" min="1" max="100" step="1"/></label>
 <label class="account-field"><span>Max Daily DCA Spend (USD)</span><input type="number" class="si" id="sDcaBotMaxDailyUSD" value="25" min="1" max="1000000" step="1"/></label>
 <label class="account-field"><span>Minimum Interval (minutes)</span><input type="number" class="si" id="sDcaBotIntervalMinutes" value="60" min="1" max="10080" step="1"/></label>
 <label class="account-field"><span>Price Step Against Position (%)</span><input type="number" class="si" id="sDcaBotPriceStepPct" value="1.5" min="0" max="100" step="0.1" title="After the first order, long DCA waits for price to fall by this amount. Short DCA waits for price to rise by this amount. Set 0 for time-only DCA."/></label>
 <label class="account-field"><span>Take Profit per Order (%)</span><input type="number" class="si" id="sDcaBotTakeProfitPct" value="1.2" min="0.1" max="100" step="0.1"/></label>
 <label class="account-field"><span>Stop Loss per Order (%)</span><input type="number" class="si" id="sDcaBotStopLossPct" value="8" min="0.1" max="100" step="0.1"/></label>
 <label class="account-field"><span>Entry Mode</span><select class="si" id="sDcaBotEntryMode"><option value="maker_only">Maker Only (Zero Fee)</option><option value="maker_preferred">Maker Preferred (fallback to limit)</option><option value="limit">Limit</option><option value="market">Market</option></select></label>
 <label class="account-field account-field-full"><span>Notifications</span><span class="scheck"><label><input type="checkbox" id="sDcaBotNotifyBrowser" checked/> Notify browser on DCA orders</label></span><span class="scheck"><label><input type="checkbox" id="sDcaBotNotifyTelegram" checked/> Notify Telegram on DCA orders</label></span></label>
 <div class="account-field account-field-full"><span>DCA Status</span><div class="account-inline-note" id="sDcaBotStatus">DCA bot is not loaded yet.</div></div>
 </div>
 <div class="account-editor-actions">
 <button class="btn secondary" type="button" id="btnResetDcaBotCycle">Reset DCA Cycle</button>
 </div>
 </div>

 <div class="account-editor-section" data-settings-panel="risk">
 <div class="account-editor-section-head">
 <strong>Reference Risk</strong>
 <span>Balance and risk assumptions for analytics and calculators.</span>
 </div>
 <div class="account-editor-grid">
 <label class="account-field"><span>Base Balance</span><input type="number" class="si" id="accountBaseBalance" min="0" step="any" placeholder="1000"/></label>
 <label class="account-field"><span>Session Start Balance</span><input type="number" class="si" id="accountSessionBalance" min="0" step="any" placeholder="1000"/></label>
 <label class="account-field"><span>Risk Per Trade %</span><input type="number" class="si" id="accountRiskPerTrade" min="0.1" max="25" step="0.1" placeholder="1"/></label>
 <label class="account-field"><span>Daily Loss Limit %</span><input type="number" class="si" id="accountDailyLoss" min="0.1" max="50" step="0.1" placeholder="3"/></label>
 </div>
 </div>

 <div class="account-editor-section" data-settings-panel="var">
 <div class="account-editor-section-head">
 <strong>VaR Dashboard</strong>
 <span>Drawdown, cycle, sector, and slot-cap planning.</span>
 </div>
 <div class="account-editor-grid">
 <label class="account-field"><span>Max Drawdown %</span><input type="number" class="si" id="accountVarMaxDD" min="1" max="100" step="1" placeholder="40" title="Maximum total drawdown as % of Total Capital before kill switch triggers."/></label>
 <label class="account-field"><span>Cycle Count</span><input type="number" class="si" id="accountVarCycles" min="1" max="20" step="1" placeholder="4" title="Divide max drawdown into N cycles. Each cycle gets equal capital variance budget."/></label>
 <label class="account-field"><span>Max Loss per Trade (USD)</span><input type="number" class="si" id="accountVarMaxLossTrade" min="0" max="1000000" step="1" placeholder="20" title="Fixed dollar cap on loss for any single trade entry."/></label>
 <label class="account-field"><span>Max Trades per Sector</span><input type="number" class="si" id="accountVarMaxPerSector" min="1" max="20" step="1" placeholder="2" title="Maximum simultaneous open positions in any one sector."/></label>
 </div>
 <div class="account-editor-grid" style="margin-top:6px">
 <label class="account-field"><span>Max Open Positions</span><input type="number" class="si" id="accountVarMaxPositions" min="1" max="50" step="1" placeholder="10" title="Total VAR slot capacity. The extension auto-splits this 70/30 by regime bias."/></label>
 <div class="account-field">
 <span>Bias Split</span>
 <div class="account-inline-note">Auto 70/30 split by market bias.</div>
 </div>
 </div>
 <div style="padding:8px 0 0;font-size:9px;color:var(--text-soft,#7a8ab0);line-height:1.5">
 Cycle budget = Max Drawdown / Cycle Count. Directional budgets auto-derive from the active market bias.
 </div>
 </div>

 <div class="account-editor-section" data-settings-panel="security">
 <div class="account-editor-section-head">
 <strong>Login Security</strong>
 <span>Change the app password and enable or disable Microsoft Authenticator for this local Windows app.</span>
 </div>
 <div class="account-editor-grid">
 <label class="account-field"><span>Current Password</span><input type="password" class="si" id="accountSecurityCurrentPassword" autocomplete="current-password" placeholder="Required to change security"/></label>
 <label class="account-field"><span>New Password</span><input type="password" class="si" id="accountSecurityNewPassword" autocomplete="new-password" placeholder="Leave blank to keep current"/></label>
 <label class="account-field"><span>Confirm New Password</span><input type="password" class="si" id="accountSecurityConfirmPassword" autocomplete="new-password" placeholder="Repeat new password"/></label>
 <label class="account-field">
 <span>Microsoft Authenticator</span>
 <select class="si" id="accountSecurityTotpAction">
 <option value="keep">Keep current setting</option>
 <option value="enable">Enable / reset setup key</option>
 <option value="disable">Disable authenticator</option>
 </select>
 </label>
 </div>
 <div class="account-editor-actions">
 <button class="bsm" type="button" id="btnAccountSecuritySave">Save Security</button>
 </div>
 <div class="account-inline-note" id="accountSecurityStatus">Security status will appear here.</div>
 <div class="account-security-setup" id="accountSecuritySetup" hidden></div>
 </div>

 <section class="settings-health-card settings-panel-card" data-settings-panel="recovery">
 <div class="settings-health-head">
 <strong>Recovery Center</strong>
 <span>One place to inspect blocked setup, stale runtime state, and common recovery actions.</span>
 </div>
 <div class="settings-recovery-grid" id="settingsRecoveryGrid">
 <div class="settings-recovery-item"><strong>Loading checks</strong><span>Recovery state will appear here.</span></div>
 </div>
 <div class="account-editor-actions settings-health-actions">
 <button class="bsm" type="button" data-settings-recovery-action="connection">Run Connection Check</button>
 <button class="bsm" type="button" data-settings-recovery-action="api">Open API Keys</button>
 <button class="bsm" type="button" data-settings-recovery-action="security">Open Login Security</button>
 <button class="btn secondary" type="button" data-settings-recovery-action="runtime">Refresh Runtime Health</button>
 </div>
 <div class="account-inline-note" id="settingsRecoveryStatus">Use this when scanner, live data, or execution readiness looks blocked.</div>
 </section>

 <details class="account-advanced-panel settings-panel-card" data-settings-panel="api-keys" open>
 <summary>API Keys</summary>
 <div class="account-advanced-content">
 <label class="account-field account-field-full"><span>Notes</span><textarea class="si account-notes" id="accountProfileNotes" placeholder="Desk notes, routing assumptions, or analyst context."></textarea></label>
 <div class="account-secret-box">
 <div class="account-secret-head">
 <strong>API Keys</strong>
 <span>Add your Delta Exchange API key and secret to enable live positions and account data.</span>
 </div>
 <div class="account-editor-grid">
 <label class="account-field"><span>Secret Label</span><input type="text" class="si" id="accountSecretLabel" placeholder="Optional key name"/></label>
 <label class="account-field"><span>Trading Key</span><input type="password" class="si" id="accountTradingKey" placeholder="Required for live account data" autocomplete="off"/></label>
 <label class="account-field account-field-full"><span>Trading Secret</span><input type="password" class="si" id="accountTradingSecret" placeholder="Required for live account data" autocomplete="off"/></label>
 </div>
 <div class="account-inline-note" id="accountCredentialModeNote">Checking secure credential storage...</div>
 </div>
 <div class="account-kill-switch-box">
 <div class="account-secret-head">
 <strong>Kill Switch</strong>
 <span>Global execution guard for TradeEnabled preview state.</span>
 </div>
 <div class="account-kill-switch-row">
 <input type="text" class="si" id="accountKillSwitchReason" placeholder="Reason for locking execution"/>
 <button class="bsm red" type="button" id="btnAccountKillSwitchToggle">Toggle Kill Switch</button>
 </div>
 <div class="account-inline-note" id="accountKillSwitchStatus"></div>
 </div>
 <div class="account-editor-actions">
 <button class="bsm" type="button" id="btnTestPrivateApi">Test API Key</button>
 </div>
 <div class="account-inline-note" id="accountApiTestResult"></div>
 </div>
 </details>

 <div class="account-editor-actions" data-settings-panel="profile">
 <button class="bsm" type="button" id="btnAccountProfileSave">Save Profile</button>
 <button class="btn-save" type="button" id="btnAccountProfileSetActive">Save User Profile</button>
 </div>
 <div class="save-ok" id="accountProfileSaveOK" data-settings-panel="profile"></div>
 </div>
 </div>
 </section>
 <section class="settings-stage settings-stage-core settings-library">
 <div class="settings-stage-head">
 <div class="settings-stage-kicker">SCANNER RULES</div>
 <div class="settings-stage-title">Scanner Rules</div>
 <div class="settings-stage-copy">Signal filters, automation defaults, chart settings, and backup controls.</div>
 </div>
 <div class="sform">
 <div class="settings-stage-divider" data-settings-panel="scanner-rules">
 <span>Scanner &amp; Market Data</span>
 <small>Signal logic, timeframe behavior, market-data mode, and baseline scanner preferences.</small>
 </div>
 <div class="sg sg-core" data-settings-panel="scanner-rules">
 <div class="sgt">EMA Periods</div>
 <div class="srow"><label>EMA Fast</label><input type="number" class="si" id="sE1" value="9" min="1" max="200"/></div>
 <div class="srow"><label>EMA Mid</label><input type="number" class="si" id="sE2" value="30" min="1" max="200"/></div>
 <div class="srow"><label>EMA Slow</label><input type="number" class="si" id="sE3" value="100" min="1" max="200"/></div>
 </div>
 <div class="sg sg-core" data-settings-panel="scanner-rules">
 <div class="sgt">OBV + Timeframes</div>
 <div class="srow"><label>OBV SMA Period</label><input type="number" class="si" id="sOBV" value="50"/></div>
 <div class="srow"><label>Primary TF</label>
 <select class="si" id="sTF1">
 <option value="1d" selected>1 Day</option>
 <option value="1h">1 Hour</option>
 </select>
 </div>
 <div class="srow"><label>Confirm TF</label>
 <select class="si" id="sTF2">
 <option value="15m" selected>15 Min</option>
 <option value="5m">5 Min</option>
 <option value="1h">1 Hour</option>
 </select>
 </div>
 </div>
 <div class="sg sg-core" data-settings-panel="scanner-rules">
 <div class="sgt">Scan Filters</div>
 <div class="srow"><label>Min Display Score</label><input type="number" class="si" id="sMinScore" value="15" min="0" max="100"/></div>
 <div class="srow"><label>Alert Threshold</label><input type="number" class="si" id="sAlertScore" value="65" min="0" max="100"/></div>
 <div class="srow"><label>Max Coins to Scan</label><input type="number" class="si" id="sMaxCoins" value="500" min="5" max="999"/></div>
 <div class="srow"><label>Min Volume Filter ($)</label><input type="number" class="si" id="sMinVol" value="0" min="0"/></div>
 <div class="srow"><label>Funding Min Volume ($)</label><input type="number" class="si" id="sFundingMinVol" value="100000" min="0" step="1000"/></div>
 </div>
 <div class="sg sg-core" data-settings-panel="scanner-rules">
 <div class="sgt">Auto-Scan</div>
 <div class="srow">
 <label>Auto-scan interval (min)</label>
 <select class="si" id="sAutoInterval">
 <option value="1">1</option>
 <option value="2">2</option>
 <option value="3">3</option>
 <option value="5">5</option>
 <option value="15" selected>15</option>
 </select>
 </div>
 <div class="scheck"><label><input type="checkbox" id="sAutoScan"/> Enable auto-scan on startup</label></div>
 <div class="scheck"><label><input type="checkbox" id="sLiveAccountSync" checked/> Enable live Delta account sync for Positions and Analytics auto-refresh</label></div>
 <div class="scheck"><label><input type="checkbox" id="sLiveOrderPreviewChart" checked/> Enable chart in live order preview</label></div>
 <div class="srow">
 <label>Market Data Mode</label>
 <select class="si" id="sMarketDataMode">
 <option value="auto" selected>Auto (Recommended)</option>
 <option value="polling">Polling Only</option>
 <option value="websocket">WebSocket Preferred</option>
 </select>
 </div>
 </div>
 <div class="sg sg-core" data-settings-panel="scanner-rules">
 <div class="sgt">FWD-10 Basket</div>
<div class="srow"><label>Index Max Coins</label><input type="number" class="si" id="sMarketIndexMaxConstituents" value="10" min="3" max="100" step="1" title="House FWD-10 uses the top liquid names up to this count."/></div>
 <div class="srow"><label>Exclude Coins</label><input type="text" class="si" id="sMarketIndexExcludedSymbols" value="" placeholder="BTCUSD, ETHUSD" title="Comma-separated symbols to remove from the FWD-10 basket."/></div>
 <div class="account-inline-note">The house FWD-10 basket uses equal weight across the selected liquid names. Benchmarks stay separate for comparison.</div>
 </div>
 <div class="settings-stage-divider settings-stage-divider-danger" data-settings-panel="futures-auto">
 <span>Live Automation Controls</span>
 <small>These sections can place real orders. Keep them visually separate from advisory scanner preferences.</small>
 </div>
 <div class="sg sg-danger" data-settings-panel="futures-auto">
 <div class="sgt">Coin Futures Auto-Trade (Live Orders)</div>
 <div class="srow" style="margin-bottom:6px;padding:6px 8px;background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.25);border-radius:4px;font-size:10px;color:#ff8080;">
 &#9888; Futures auto-trade places REAL Delta Exchange orders. Keep this separate from options automation and only enable after profile, bracket, and risk checks are verified.
 </div>
 <div class="srow"><label>Min Trade Quality</label><input type="number" class="si" id="sAutoTradeMinScore" value="75" min="75" max="100" step="1" title="Only scanner TRADE NOW setups at or above this trade-quality score will auto-trade"/></div>
 <div class="srow"><label>Size per Trade (USD)</label><input type="number" class="si" id="sAutoTradeUSD" value="5" min="1" max="60" step="1" title="USD notional per auto-trade order"/></div>
 <div class="srow"><label>Min Liquidity ($)</label><input type="number" class="si" id="sAutoTradeMinLiquidityUSD" value="750000" min="0" step="1000" title="Skip live auto-trades when 24h liquidity is below this amount. Keep 750000 to preserve current behavior."/></div>
 <div class="srow"><label>Probation Min Liquidity ($)</label><input type="number" class="si" id="sAutoTradeProbationMinLiquidityUSD" value="1500000" min="0" step="1000" title="Probation symbols need more liquidity than validated symbols before live auto-trade is allowed."/></div>
 <div class="srow"><label>Validated Max Spread %</label><input type="number" class="si" id="sAutoTradeValidatedMaxSpreadPct" value="0.28" min="0.01" max="5" step="0.01" title="Block auto-trade when estimated spread is wider than this even for validated symbols."/></div>
 <div class="srow"><label>Probation Max Spread %</label><input type="number" class="si" id="sAutoTradeProbationMaxSpreadPct" value="0.18" min="0.01" max="5" step="0.01" title="Use a tighter spread ceiling for probation symbols."/></div>
<div class="srow"><label>Probation Size (%)</label><input type="number" class="si" id="sAutoTradeProbationSizePct" value="90" min="85" max="100" step="1" title="Probation symbols use this % of your normal order size before they fully validate."/></div>
<div class="account-inline-note">Low-history symbols are split into new, probation, and validated. New symbols can trade if they pass the live checks. Probation symbols use this size haircut and still respect your profile max-order cap.</div>
 <div class="srow"><label>Max Trades per Scan</label><input type="number" class="si" id="sAutoTradeMaxPerScan" value="2" min="1" max="5" step="1"/></div>
 <div class="srow"><label>Max Trades per Day (successful)</label><input type="number" class="si" id="sAutoTradeMaxPerDay" value="6" min="1" max="50" step="1"/></div>
 <div class="srow"><label>Max Concurrent Trades (current open exposure)</label><input type="number" class="si" id="sAutoTradeMaxConcurrent" value="5" min="1" max="5" step="1" title="Counts live positions plus pending/open entry orders on Delta. Reduce-only TP/SL exit orders do not count."/></div>
 <div class="account-inline-note">Current open exposure counts live positions plus pending/open entry orders. Reduce-only exit orders such as stop-loss and take-profit do not use this slot.</div>
 <div class="srow"><label>Adverse Funding Block (% / 8h)</label><input type="number" class="si" id="sAutoTradeMaxAdverseFundingRate" value="0.05" min="0" max="5" step="0.01" title="Skip new entries when funding strongly works against the trade side. Set 0 to disable."/></div>
 <div class="account-inline-note">Longs are blocked when funding is above this threshold. Shorts are blocked when funding is below the negative of this threshold. Set 0 to disable.</div>
 <div class="srow"><label>Close Before Adverse Funding (min)</label><input type="number" class="si" id="sAutoTradeFundingExitMinutes" value="0" min="0" max="120" step="5" title="For live auto-trades only: close before the next adverse funding settlement when the trade has been open long enough. Set 0 to disable."/></div>
 <div class="srow"><label>Min Hold Before Funding Exit (hours)</label><input type="number" class="si" id="sAutoTradeFundingMinHoldHours" value="12" min="0" max="168" step="1" title="Funding exit only applies after the position has been open at least this long."/></div>
 <div class="scheck"><label><input type="checkbox" id="sAutoTradeFundingExitOnlyProfit" checked/> Only auto-close before funding when the position is profitable</label></div>
 <div class="srow"><label>Daily Loss Limit (USD)</label><input type="number" class="si" id="sAutoTradeDailyLoss" value="8" min="1" max="10000" step="1" title="Auto-trade disables itself if daily loss exceeds this amount"/></div>
 <div class="srow">
 <label>Entry Mode</label>
 <select class="si" id="sAutoTradeEntryMode">
 <option value="maker_only">Maker Only (Zero Fee)</option>
 <option value="maker_preferred">Maker Preferred (fallback to limit)</option>
 <option value="limit">Limit</option>
 <option value="market">Market</option>
 </select>
 </div>
 <div class="scheck"><label><input type="checkbox" id="sAutoTradeReverseSignals"/> Reverse live execution side (buy signal sells, sell signal buys)</label></div>
 <div class="srow"><label>Symbol Cooldown (sec)</label><input type="number" class="si" id="sAutoTradeCooldown" value="90" min="30" max="600" step="10" title="Seconds before same symbol can be auto-traded again"/></div>
 <div class="account-inline-note">Scanner and signal qualification stay unchanged. Reverse mode only flips the live order side and mirrors the same stop-loss and target distances.</div>
 <div class="scheck"><label><input type="checkbox" id="sAutoTradePaperTracking" checked/> Track qualified paper/shadow trades</label></div>
 <div class="srow">
 <label>Entry Trigger</label>
 <select class="si" id="sAutoTradeEntryTriggerMode">
 <option value="balanced_confirm">Balanced Confirm</option>
 <option value="strict_retest">Strict Retest</option>
 <option value="loose_confirm">Loose Confirm</option>
 <option value="off">Off</option>
 </select>
 </div>
 <div class="scheck"><label><input type="checkbox" id="sAutoTradeEntryTriggerRequired" checked/> Require entry trigger before paper/live entry</label></div>
 <div class="srow"><label>Setup Edge Sample</label><input type="number" class="si" id="sAutoTradeSetupPerformanceMinSample" value="20" min="1" max="500" step="1" title="Minimum paper/live closed trades before a setup family is labelled Positive Edge or Weak Edge."/></div>
 <div class="scheck"><label><input type="checkbox" id="sAutoTradeRiskQualityRequired" checked/> Require risk quality before paper/live entry</label></div>
 <div class="srow"><label>Min Reward:Risk</label><input type="number" class="si" id="sAutoTradeRiskMinRewardRisk" value="1.15" min="0.2" max="10" step="0.05" title="Skip entries whose first target does not pay enough compared with stop distance."/></div>
 <div class="srow"><label>Max Stop Distance %</label><input type="number" class="si" id="sAutoTradeRiskMaxStopDistancePct" value="3.5" min="0.05" max="50" step="0.05" title="Skip entries where the stop is too far from entry."/></div>
 <div class="srow"><label>Max Entry Drift %</label><input type="number" class="si" id="sAutoTradeRiskMaxEntryDistancePct" value="1.8" min="0.05" max="50" step="0.05" title="Skip entries where current price has drifted too far from the planned entry."/></div>
 <div class="account-inline-note">Paper tracking never places orders. It records qualified forward signals after entry trigger and risk quality checks; setup performance stays advisory until you choose to use it manually.</div>
 <div class="srow"><label>Backtest Signal Min Score</label><input type="number" class="si" id="sAutoTradeBacktestSignalMinScore" value="75" min="0" max="100" step="1" title="Manual backtest and auto-trade gate both use this signal-score floor. Keep it aligned with your trade style."/></div>
 <div class="account-inline-note">Backtest remains manual/advisory here. Futures auto-trade no longer waits for a backtest pass before placing a live entry.</div>
 <div class="srow"><label>Backtest Lookback Days</label><input type="number" class="si" id="sAutoTradeBacktestLookbackDays" value="500" min="100" max="500" step="10" title="How many closed daily candles to replay in backtest. Higher means more history; lower makes it more recent."/></div>
 <div class="srow"><label>Backtest Min Trades</label><input type="number" class="si" id="sAutoTradeBacktestMinTrades" value="6" min="1" max="100" step="1" title="Require at least this many backtest trades before auto-trade is allowed."/></div>
 <div class="srow"><label>Backtest Min PF</label><input type="number" class="si" id="sAutoTradeBacktestMinProfitFactor" value="1.1" min="0.1" max="10" step="0.1" title="Require backtest profit factor at or above this level."/></div>
 <div class="srow"><label>Backtest Min Expectancy</label><input type="number" class="si" id="sAutoTradeBacktestMinExpectancy" value="0.05" min="-100" max="100" step="0.01" title="Require backtest expectancy at or above this level."/></div>
 <div class="srow"><label>Backtest Max DD (%)</label><input type="number" class="si" id="sAutoTradeBacktestMaxDrawdownPct" value="12" min="0.1" max="100" step="0.1" title="Block auto-trade if backtest drawdown exceeds this level."/></div>
 <div class="srow"><label>Backtest Cache (hours)</label><input type="number" class="si" id="sAutoTradeBacktestCacheHours" value="6" min="1" max="72" step="1" title="Reuse recent backtest results for this many hours before refreshing."/></div>
 <div class="settings-structured-card">
 <div class="settings-structured-title">Setup family gate override</div>
 <div class="account-editor-grid">
 <label class="account-field"><span>Setup Family</span>
 <select class="si" id="sAutoTradeSetupFamilyKey">
 <option value="">Use global thresholds</option>
 <option value="continuation">Continuation</option>
 <option value="pullback">Pullback</option>
 <option value="breakout_retest">Breakout Retest</option>
 <option value="reclaim">Reclaim</option>
 <option value="mean_reversion">Mean Reversion</option>
 </select>
 </label>
 <label class="account-field"><span>Min Trades</span><input type="number" class="si" id="sAutoTradeSetupFamilyMinTrades" min="1" max="100" step="1" placeholder="8"/></label>
 <label class="account-field"><span>Min Profit Factor</span><input type="number" class="si" id="sAutoTradeSetupFamilyMinProfitFactor" min="0.1" max="10" step="0.1" placeholder="1.2"/></label>
 <label class="account-field"><span>Min Expectancy</span><input type="number" class="si" id="sAutoTradeSetupFamilyMinExpectancy" min="-100" max="100" step="0.01" placeholder="0.10"/></label>
 <label class="account-field"><span>Max Drawdown %</span><input type="number" class="si" id="sAutoTradeSetupFamilyMaxDrawdownPct" min="0.1" max="100" step="0.1" placeholder="10"/></label>
 </div>
 <div class="account-inline-note">Pick one family to override. Existing extra family overrides are preserved when you save.</div>
 <input type="hidden" id="sAutoTradeSetupFamilyOverrides"/>
 </div>
 <div class="scheck"><label><input type="checkbox" id="sAutoTradeNotifyBrowser" checked/> Notify browser on futures auto-trade events</label></div>
 <div class="scheck"><label><input type="checkbox" id="sAutoTradeNotifyTelegram" checked/> Notify Telegram on futures auto-trade events</label></div>
 <div class="scheck"><label><input type="checkbox" id="sAutoTradeEnabled"/> Enable futures auto-trade on startup <span style="color:#ff8080;font-weight:700;">(places real orders!)</span></label></div>
 </div>
 <div class="settings-stage-divider" data-settings-panel="strategy-profiles">
 <span>Strategy Profiles</span>
 <small>Apply a complete preset to scanner, paper tracking, chart defaults, and risk-template fields. Review the values, then save.</small>
 </div>
 <div class="sg" data-settings-panel="strategy-profiles">
 <div class="sgt">Profile Presets</div>
 <div class="strategy-preset-grid">
 <button class="strategy-preset-card" type="button" data-settings-profile-preset="manual_clean"><strong>Manual Clean</strong><span>Scanner only, paper tracking on, live automation off.</span><small>Score 65 | Key chart | 1.5 ATR / 2R</small></button>
 <button class="strategy-preset-card" type="button" data-settings-profile-preset="breakout_validation"><strong>Breakout Validation</strong><span>Higher score and trigger discipline for forward testing.</span><small>Score 78 | Trigger required | 1.3 ATR / 2.5R</small></button>
 <button class="strategy-preset-card" type="button" data-settings-profile-preset="trend_follow"><strong>Trend Follow</strong><span>Wider stop and larger sample gate for continuation trades.</span><small>Score 72 | 1.8 ATR / 2.4R</small></button>
 <button class="strategy-preset-card" type="button" data-settings-profile-preset="mean_reversion"><strong>Mean Reversion</strong><span>Smaller basket and tighter risk settings for reversal setups.</span><small>Score 76 | 1.1 ATR / 1.6R</small></button>
 <button class="strategy-preset-card" type="button" data-settings-profile-preset="paper_first"><strong>Paper First</strong><span>Turns on paper tracking and auto scan while keeping real orders off.</span><small>Auto scan 5m | Paper ledger | Live off</small></button>
 </div>
 <div class="account-inline-note" id="strategyProfilePresetStatus">Pick a preset to update the visible settings form. Use Save Strategy after review.</div>
 </div>
 <div class="sg sg-danger" data-settings-panel="options-auto">
 <div class="sgt">Options Auto-Trade (Theta Desk)</div>
 <div class="srow" style="margin-bottom:6px;padding:6px 8px;background:rgba(49,196,141,.08);border:1px solid rgba(49,196,141,.22);border-radius:4px;font-size:10px;color:#9ef2c9;">
 Defined-risk options automation is short-premium-first: bullish signals map to bull put spreads, bearish signals map to bear call spreads, and naked short automation stays off unless you explicitly override it.
 </div>
 <div class="scheck"><label><input type="checkbox" id="sOptionsAutoTradeEnabled"/> Enable options auto-trade on startup</label></div>
 <div class="srow"><label>Allowed Underlyings</label><input type="text" class="si" id="sOptionsAutoTradeUnderlyings" value="BTC, ETH" placeholder="BTC, ETH"/></div>
 <div class="srow"><label>Min Trade Quality</label><input type="number" class="si" id="sOptionsAutoTradeMinScore" value="72" min="0" max="100" step="1"/></div>
 <div class="srow"><label>Min DTE</label><input type="number" class="si" id="sOptionsAutoTradeMinDte" value="2" min="0" max="120" step="1"/></div>
 <div class="srow"><label>Max DTE</label><input type="number" class="si" id="sOptionsAutoTradeMaxDte" value="21" min="1" max="365" step="1"/></div>
 <div class="srow"><label>Short Strike Target Delta</label><input type="number" class="si" id="sOptionsAutoTradeTargetDelta" value="0.16" min="0.01" max="0.49" step="0.01"/></div>
 <div class="srow"><label>Delta Tolerance</label><input type="number" class="si" id="sOptionsAutoTradeDeltaTolerance" value="0.08" min="0.01" max="0.30" step="0.01"/></div>
 <div class="srow"><label>Min OI Contracts</label><input type="number" class="si" id="sOptionsAutoTradeMinOi" value="250" min="0" max="100000000" step="10"/></div>
 <div class="srow"><label>Max Bid/Ask Spread %</label><input type="number" class="si" id="sOptionsAutoTradeMaxSpread" value="0.18" min="0.01" max="2" step="0.01"/></div>
 <div class="srow"><label>Min Premium Score</label><input type="number" class="si" id="sOptionsAutoTradeMinPremiumScore" value="55" min="0" max="100" step="1"/></div>
 <div class="srow"><label>Max Strategies / Day</label><input type="number" class="si" id="sOptionsAutoTradeMaxPerDay" value="4" min="1" max="50" step="1"/></div>
 <div class="srow"><label>Max Concurrent Strategies</label><input type="number" class="si" id="sOptionsAutoTradeMaxConcurrent" value="2" min="1" max="20" step="1"/></div>
 <div class="srow"><label>Max Risk / Strategy (USD)</label><input type="number" class="si" id="sOptionsAutoTradeMaxRisk" value="120" min="1" max="1000000" step="1"/></div>
 <div class="srow">
 <label>Entry Mode</label>
 <select class="si" id="sOptionsAutoTradeEntryMode">
 <option value="maker_only">Maker Only</option>
 <option value="limit" selected>Limit</option>
 <option value="market">Market</option>
 </select>
 </div>
 <div class="scheck"><label><input type="checkbox" id="sOptionsAutoTradeAllowUndefinedRisk"/> Allow undefined-risk options automation</label></div>
 <div class="scheck"><label><input type="checkbox" id="sOptionsAutoTradeNotifyBrowser" checked/> Notify browser on options auto-trade events</label></div>
 <div class="scheck"><label><input type="checkbox" id="sOptionsAutoTradeNotifyTelegram" checked/> Notify Telegram on options auto-trade events</label></div>
 </div>
 <div class="sg sg-danger" data-settings-panel="straddle-auto">
 <div class="sgt">Short Straddle Auto-Trade</div>
 <div class="srow" style="margin-bottom:6px;padding:6px 8px;background:rgba(255,171,64,.07);border:1px solid rgba(255,171,64,.22);border-radius:4px;font-size:10px;color:#ffcc80;">
 Sells ATM call + put at market open. Each leg has its own stop-loss; re-entry triggers when premium reverts. Universal exit on time or P&amp;L target. <strong style="color:#ff8080;">Places real orders - use with care.</strong>
 </div>
 <div class="scheck"><label><input type="checkbox" id="sStraddleEnabled"/> Enable short straddle auto-trade <span style="color:#ff8080;font-weight:700;">(places real orders!)</span></label></div>
 <div class="srow"><label>Leg Stop-Loss %</label><input type="number" class="si" id="sStraddleLegStopLossPct" value="30" min="5" max="100" step="1" title="Close leg if premium rises this % above entry"/></div>
 <div class="srow"><label>Re-entry Threshold %</label><input type="number" class="si" id="sStraddleReentryThresholdPct" value="5" min="1" max="30" step="1" title="Re-enter when premium drops back within this % of original entry"/></div>
 <div class="srow"><label>Max Re-entries / Leg</label><input type="number" class="si" id="sStraddleMaxReentries" value="2" min="0" max="10" step="1"/></div>
 <div class="srow"><label>Profit Target (USD pts)</label><input type="number" class="si" id="sStraddleUniversalProfitTarget" value="300" min="0" max="100000" step="10" title="Close all positions when total P&L reaches this"/></div>
 <div class="srow"><label>Loss Limit (USD pts)</label><input type="number" class="si" id="sStraddleUniversalLossLimit" value="300" min="0" max="100000" step="10" title="Close all positions when total loss hits this"/></div>
 <div class="srow"><label>Close Before Expiry (min)</label><input type="number" class="si" id="sStraddleCloseMinutesBeforeExpiry" value="30" min="5" max="1440" step="5" title="Square off all legs this many minutes before expiry"/></div>
 <div class="srow">
 <label>Expiry Preference</label>
 <select class="si" id="sStraddleExpiryPreference">
 <option value="nearest" selected>Nearest Expiry</option>
 <option value="same_day">Same-Day Expiry Only</option>
 </select>
 </div>
 <div class="scheck"><label><input type="checkbox" id="sStraddleReentryEnabled" checked/> Enable re-entry after stop-loss</label></div>
 <div class="scheck"><label><input type="checkbox" id="sNativeStraddlePreferred" checked/> Prefer native MV- straddle products (single order, 50% lower fees)</label></div>
 <div class="srow" style="margin-top:8px;padding:4px 0;border-top:1px solid rgba(126,145,182,0.08);font-size:9px;color:var(--od-muted);text-transform:uppercase;letter-spacing:0.5px;">Entry Filters</div>
 <div class="srow"><label>Min Premium / Ct (USD)</label><input type="number" class="si" id="sStraddleMinPremiumPerContractUSD" value="0.25" min="0" max="10000" step="0.05" title="Reject native straddles whose credit per contract is too small"/></div>
 <div class="srow"><label>Min Theta / Margin %</label><input type="number" class="si" id="sStraddleMinThetaMarginRatioPct" value="0.35" min="0" max="100" step="0.05" title="Require daily theta yield to clear this % of estimated margin"/></div>
 <div class="scheck"><label><input type="checkbox" id="sStraddleSkewVetoEnabled" checked/> Block entries when downside skew is too aggressive</label></div>
 <div class="srow"><label>Bearish Skew Veto (25D RR)</label><input type="number" class="si" id="sStraddleMaxBearishSkewRR" value="-6" min="-50" max="50" step="0.5" title="Reject entries when 25-delta risk reversal is below this level"/></div>
 <div class="srow"><label>Same-Day Min Score</label><input type="number" class="si" id="sStraddleSameDayMinScore" value="82" min="0" max="100" step="1" title="Require a higher score for same-day expiries"/></div>
 <div class="srow"><label>Same-Day Max Spread %</label><input type="number" class="si" id="sStraddleSameDayMaxSpreadPct" value="1.2" min="0.05" max="100" step="0.05" title="Reject same-day entries with wider spreads than this"/></div>
 <div class="srow"><label>Premium Capture Exit %</label><input type="number" class="si" id="sStraddlePremiumCapturePct" value="60" min="0" max="100" step="1" title="Close the straddle when this % of premium has been captured"/></div>
 <div class="srow"><label>Entry Order Max Age (min)</label><input type="number" class="si" id="sStraddleEntryOrderMaxAgeMinutes" value="5" min="1" max="240" step="1" title="Cancel stale maker/limit entry orders after this many minutes"/></div>
 <div class="srow" style="margin-top:8px;padding:4px 0;border-top:1px solid rgba(126,145,182,0.08);font-size:9px;color:var(--od-muted);text-transform:uppercase;letter-spacing:0.5px;">Auto Position Sizing</div>
 <div class="scheck"><label><input type="checkbox" id="sAutoSizeEnabled" checked/> Auto-calculate quantity from target profit</label></div>
 <div class="srow"><label>Target Profit (USD)</label><input type="number" class="si" id="sTargetProfitUSD" value="100" min="1" max="1000000" step="10" title="Auto-calculate contract quantity to target this profit from full premium capture"/></div>
 </div>
 <div class="settings-stage-divider" data-settings-panel="charts">
 <span>Charts, Templates &amp; Storage</span>
 <small>Display defaults, risk templates, notifications, and local backup behavior.</small>
 </div>
 <div class="sg" data-settings-panel="charts">
 <div class="sgt">Key Levels</div>
 <div class="srow"><label>Pivot Length</label><input type="number" class="si" id="sKeyPivotLength" value="6" min="2" max="20"/></div>
 <div class="srow"><label>Pivot Memory</label><input type="number" class="si" id="sKeyPivotMemory" value="50" min="4" max="200"/></div>
 <div class="srow"><label>Levels / Side</label><input type="number" class="si" id="sKeyLevelCount" value="4" min="1" max="8"/></div>
 <div class="srow">
 <label>Strength Display</label>
 <select class="si" id="sKeyStrengthDisplay">
 <option value="count">Count</option>
 <option value="percent">Percent</option>
 </select>
 </div>
 <div class="srow"><label>Zone Thickness (px)</label><input type="number" class="si" id="sKeyThickness" value="3" min="1" max="8"/></div>
 <div class="scheck"><label><input type="checkbox" id="sKeyShowPivotCircles" checked/> Show pivot circles</label></div>
 <div class="scheck"><label><input type="checkbox" id="sKeyShowLevelGlow" checked/> Show level glow</label></div>
 </div>
 <div class="sg" data-settings-panel="charts">
 <div class="sgt">Chart Defaults</div>
 <div class="srow">
 <label>Default Preset</label>
 <select class="si" id="sChartDefaultPreset">
 <option value="clean">1 Clean</option>
 <option value="ema">2 EMA</option>
 <option value="key">3 Key</option>
 <option value="analysis">4 Analysis</option>
 </select>
 </div>
 <div class="scheck"><label><input type="checkbox" id="sChartShowOrders"/> Show Orders by default</label></div>
 <div class="scheck"><label><input type="checkbox" id="sChartShowVwap"/> Show VWAP by default</label></div>
 <div class="scheck"><label><input type="checkbox" id="sChartCacheEnabled" checked/> Enable shared chart cache</label></div>
 </div>
 <div class="sg" data-settings-panel="risk-templates">
 <div class="sgt">Risk Templates</div>
 <div class="es" style="font-size:8.5px;line-height:1.5;margin-bottom:8px">Used by the scanner to derive ATR-based stop distance and target R:R. Position-size defaults come from the active profile risk %, not this block.</div>
 <div class="srow"><label>ATR Stop Multiplier</label><input type="number" class="si" id="sRiskTemplateAtrStopMultiplier" value="1.5" min="0.1" max="10" step="0.1"/></div>
 <div class="srow"><label>Target R:R</label><input type="number" class="si" id="sRiskTemplateTargetRR" value="2.0" min="0.1" max="10" step="0.1"/></div>
 <div class="settings-structured-card">
 <div class="settings-structured-title">Per-symbol override</div>
 <div class="account-editor-grid">
 <label class="account-field"><span>Symbol</span><input type="text" class="si" id="sRiskOverrideSymbol" placeholder="BTCUSD"/></label>
 <label class="account-field"><span>ATR Stop Multiplier</span><input type="number" class="si" id="sRiskOverrideAtrStopMultiplier" min="0.1" max="10" step="0.1" placeholder="1.2"/></label>
 <label class="account-field"><span>Target R:R</span><input type="number" class="si" id="sRiskOverrideTargetRR" min="0.1" max="10" step="0.1" placeholder="2.5"/></label>
 </div>
 <div class="account-inline-note">Leave symbol blank to use only the default template. Existing extra symbol overrides are preserved when you save.</div>
 <input type="hidden" id="sRiskTemplateBySymbol"/>
 </div>
 </div>
 <div class="sg" data-settings-panel="backup">
 <div class="sgt">Notifications</div>
 <div class="scheck"><label><input type="checkbox" id="sNotify" checked/> Browser notifications</label></div>
 <div class="scheck"><label><input type="checkbox" id="sSound" checked/> Sound alert on new top-tier scanner or custom-alert events</label></div>
 <div class="srow">
 <label>Alert tone</label>
 <select class="si" id="sAlertTone">
 <option value="classic">Classic</option>
 <option value="beacon">Beacon</option>
 <option value="pulse">Pulse</option>
 <option value="chime">Chime</option>
 <option value="siren">Siren</option>
 </select>
 </div>
 </div>
 <div class="sg" data-settings-panel="backup">
 <div class="sgt">Local Backup Storage</div>
 <div class="scheck"><label><input type="checkbox" id="sExtBackupEnabled"/> Enable backup to a selected folder (outside Chrome storage)</label></div>
 <div class="scheck"><label><input type="checkbox" id="sExtBackupAuto"/> Auto backup after each completed scan (while popup is open)</label></div>
 <div class="scheck"><label><input type="checkbox" id="sExtArchiveEnabled"/> Auto-archive old alerts to folder when limit is exceeded</label></div>
 <div class="srow"><label>Keep Alerts in Chrome</label><input type="number" class="si" id="sKeepAlerts" min="100" max="1800" step="50" value="600"/></div>
 <div class="srow"><label>Backup Folder</label><input type="text" class="si" id="sBackupPath" placeholder="Not selected" readonly style="width:100%"/></div>
 <div class="srow" style="gap:6px">
 <button class="bsm" id="btnPickBackupDir" style="flex:1">Choose Folder</button>
 <button class="bsm" id="btnBackupNow" style="flex:1">Backup Now</button>
 </div>
 <div class="srow" style="gap:6px">
 <button class="bsm primary" id="btnFullBackupDownload" style="flex:1">Download Full App Backup</button>
 <button class="bsm" id="btnFullBackupRestore" style="flex:1">Restore Full App Backup</button>
 </div>
 <div class="sgt">Candle History Store</div>
 <div class="srow" style="gap:6px">
 <button class="bsm primary" id="btnCandleHistoryStart" style="flex:1">Start 1D + 15M Backfill</button>
 <button class="bsm" id="btnCandleHistoryPause" style="flex:1">Pause</button>
 <button class="bsm" id="btnCandleHistoryRefresh" style="flex:1">Status</button>
 </div>
 <div class="srow" style="gap:6px">
 <button class="bsm" id="btnArchiveNow" style="width:100%">Archive Old Alerts Now</button>
 </div>
 <div class="es" style="font-size:8.5px;line-height:1.5">
 Select your preferred folder once (for example: <b>D:\\Office Work Backup\\dheeraj\\P\\Chrome Extesnion\\FWD TradeDesk Pro Data</b>).
 Browser security hides full path; folder name will be shown here.
 Use Download Full App Backup before uninstalling or moving to another PC. It includes local settings and candle history, but not machine-encrypted API keys.
 </div>
 <div class="save-ok" id="candleHistoryStatus"></div>
 <div class="save-ok" id="backupSaveOK"></div>
 </div>
 <div class="settings-save-rail" data-settings-library-actions>
 <button class="btn-save" id="btnSave">SAVE STRATEGY</button>
 <div class="save-ok" id="saveOK"></div>
 </div>
 </div>
 </section>
`,

 'webhooks': ` <div class="phdr">
 <div>
 <span>Webhook Integrations</span>
 <small class="phdr-sub">Send signals to Voicenotes | Notion | Discord | Telegram | Slack | Any URL</small>
 </div>
 <div class="phdr-btns">
 <button class="bsm green" id="btnAddWebhook">+ Add Webhook</button>
 </div>
 </div>

 <div class="sg">
 <div class="sgt">Telegram Bot Alerts</div>
 <div class="scheck"><label><input type="checkbox" id="tgEnabled"/> Send new signal alerts to Telegram</label></div>
 <div class="srow"><label>Bot Token</label><input type="password" class="si" id="tgBotToken" placeholder="123456:ABC..." autocomplete="off"/></div>
 <div class="srow"><label>Chat ID</label><input type="text" class="si" id="tgChatId" placeholder="e.g. 123456789"/></div>
 <div class="srow"><label>Min Score</label><input type="number" class="si" id="tgMinScore" min="0" max="100" step="1" value="85" placeholder="Only send score = this value"/></div>
 <div class="scheck"><label><input type="checkbox" id="tgHourlySummary"/> Send hourly position summary (open trades, running P&amp;L)</label></div>
 <div class="srow"><button class="bsm" id="btnTestTelegram" style="width:100%">Send Telegram Test</button></div>
 <div class="save-ok" id="tgSaveOK"></div>
 </div>

 <!-- Webhook List -->
 <div class="wh-list" id="webhookList">
 <div class="empty">
 <div class="ei">--</div>
 <div class="eh">No webhooks configured</div>
 <div class="es">
 Add a webhook URL to send FWD TradeDesk Pro signals to your favorite apps.<br/>
 Works with <b>Voicenotes</b>, <b>Notion</b>, <b>Discord</b>, <b>Telegram bots</b>, <b>Slack</b>, <b>Zapier</b>, <b>Make</b>, and any service that accepts webhook POSTs.
 </div>
 </div>
 </div>

 <!-- Add/Edit Webhook Form (hidden by default) -->
 <div class="wh-form" id="webhookForm" style="display:none" hidden>
 <div class="sg">
 <div class="sgt">Webhook Configuration</div>
 <div class="srow"><label>Name</label><input type="text" class="si" id="whName" placeholder="e.g. My Voicenotes" maxlength="40"/></div>
 <div class="srow"><label>URL</label><input type="url" class="si" id="whUrl" placeholder="https://api.voicenotes.com/webhook/..." /></div>
 <div class="srow"><label>Format</label>
 <select class="si" id="whFormat">
 <option value="json" selected>Generic JSON (Voicenotes, Zapier, Make, etc.)</option>
 <option value="discord">Discord</option>
 <option value="slack">Slack</option>
 </select>
 </div>
 </div>
 <div class="sg">
 <div class="sgt">Events to Send</div>
 <div class="scheck"><label><input type="checkbox" id="whEvtSignal" checked/> Signal Alerts (Execute/Setup/Watch)</label></div>
 <div class="scheck"><label><input type="checkbox" id="whEvtScan" checked/> Scan Complete (summary of all signals)</label></div>
 <div class="scheck"><label><input type="checkbox" id="whEvtFunding"/> Funding Rate Extremes</label></div>
 </div>
 <div class="sg">
 <div class="sgt">Custom Headers (optional)</div>
 <div class="srow"><label>Auth Header</label><input type="text" class="si" id="whAuthHeader" placeholder="e.g. Bearer your-api-key" /></div>
 </div>
 <div style="display:flex;gap:8px;margin-top:8px">
 <button class="btn-save" id="btnSaveWebhook" style="flex:1">Save Webhook</button>
 <button class="btn-scan" id="btnTestWebhook" style="flex:0 0 auto;background:#ffc840;color:#000">Test</button>
 <button class="bsm" id="btnCancelWebhook" style="flex:0 0 auto;padding:8px 16px">Cancel</button>
 </div>
 <div class="save-ok" id="whSaveOK"></div>
 </div>

 <!-- How it works -->
 <div class="wh-guide" style="margin-top:12px;padding:12px;background:rgba(0,229,160,.04);border:1px solid rgba(0,229,160,.12);border-radius:8px;font-size:11px;color:#8892a8;line-height:1.6">
 <b style="color:#00e5a0">How to connect Voicenotes:</b><br/>
 1. Open Voicenotes -> Settings -> Integrations -> Webhooks<br/>
 2. Copy the webhook URL from Voicenotes<br/>
 3. Paste it above and select "Generic JSON" format<br/>
 4. Click "Test" to verify the connection<br/>
 <br/>
 <b style="color:#ffc840">Works with any service:</b> Discord, Slack, Notion (via Zapier/Make), Telegram bots, n8n, custom APIs, etc.
 </div>
`,

 'debug': ` <div class="phdr">
 <span>Scan Debug Log</span>
 <div class="phdr-btns">
 <button class="bsm" id="btnRefreshDebug">Refresh</button>
 <button class="bsm" id="btnDownloadDebug">Download</button>
 <button class="bsm red" id="btnClearDebug">Clear</button>
 </div>
 </div>
 <div class="debug-hint">Run a scan then click Refresh. OK | Error | Skipped</div>
 <div class="diagnostics-export-card">
 <div>
 <strong>Release Diagnostics</strong>
 <small>Export native stats, error journal, candle-cache stats, debug log, and app-state summary for production troubleshooting.</small>
 </div>
 <button class="bsm primary" id="btnExportReleaseDiagnostics">Export Diagnostics</button>
 </div>
 <div id="debugOutput" class="debug-output">No logs yet.</div>
`
};

/**
 * Inject a pane's template HTML on first visit. Idempotent.
 */
function ensurePaneRendered(tabName) {
 const pane = document.getElementById('pane-' + tabName);
 if (!pane || pane.dataset.tplLoaded) return;
 const tpl = PANE_TEMPLATES[tabName];
 if (!tpl) return;
 pane.innerHTML = tpl;
 pane.dataset.tplLoaded = '1';
}

// Home is the default active tab; Scanner still renders early so filter/preset
// elements exist before DOMContentLoaded handlers query them.
ensurePaneRendered('home');
ensurePaneRendered('scanner');
ensurePaneRendered('strategies');
// Strategy + webhooks form inputs are read by loadStrategy() at startup
// (inside a chrome.storage callback that fires during DOMContentLoaded).
ensurePaneRendered('strategy');
ensurePaneRendered('webhooks');
