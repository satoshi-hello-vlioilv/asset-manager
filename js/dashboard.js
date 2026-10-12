
/**
 * dashboard.js
 * ダッシュボード表示
 *
 * 設計:
 *   ダッシュボードの役割は「眺めること」ではなく「次の行動を決めること」。
 *
 *     1段目: KPIストリップ（全体像を1行の数字に圧縮。押すとその一覧へ）
 *     2段目左: 要対応（停止中 / 期限超過 / 14日以内 の3グループ、各上位3件）
 *     2段目右: 稼働状況の内訳・最近の動き（文脈の確認）
 *
 *   要対応は件数が増えても画面を占領しないよう、種別ごとに上位3件だけを出し、
 *   残りは「すべて表示」で開く（サブ情報はコンパクトに、全体像は崩さない）。
 *   各行の「実施済み」で、点検 → 履歴に記録 → 次回予定を更新 を1クリックで完了できる。
 */

/* 要対応グループの開閉状態（描き直しても保つ） */
const actionGroupState = {
    stop: { collapsed: false, expanded: false },
    over: { collapsed: false, expanded: false },
    soon: { collapsed: false, expanded: false }
};
const ACTION_GROUP_PREVIEW = 3;

function renderDashboard() {
    const container = document.getElementById('dashboardContainer');
    if(!container) return;

    // 編集中の下書きは統計に含めない
    const pool = getPersistedAssets();
    const totalAssets  = pool.length;
    const has = (a, s) => (a.status || []).includes(s);
    const activeAssets = pool.filter(a => has(a, '稼働中')).length;
    const inspecting   = pool.filter(a => has(a, '点検中') || has(a, '修理中')).length;
    const stopped      = pool.filter(a => has(a, '停止中')).length;
    const activePercent = totalAssets > 0 ? Math.round((activeAssets / totalAssets) * 100) : 0;

    const now = new Date();
    const addedThisMonth = pool.filter(a => {
        if(!a.date) return false;
        const d = new Date(a.date);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;

    const tasks = collectActionItems();
    const groups = groupActionItems(tasks);

    // 稼働状況の比率をKPI内のミニバーで示す（数字と割合を同じ場所で読める）
    const mix = STATUS_DEFS
        .map(d => ({ color: d.nodeColor, count: pool.filter(a => has(a, d.value)).length }))
        .filter(x => x.count > 0);
    const mixBar = mix.length
        ? `<span class="kpi-mix">${mix.map(x => `<i style="flex:${x.count}; background:${x.color};"></i>`).join('')}</span>`
        : '';

    const kpi = (opts) => `
        <button class="kpi ${opts.onclick ? '' : 'is-static'}" ${opts.onclick ? `onclick="${opts.onclick}"` : 'tabindex="-1"'}
                ${opts.title ? `title="${escapeHTML(opts.title)}"` : ''} ${opts.tone ? `data-tone="${opts.tone}"` : ''}>
            <span class="kpi-label">${opts.label}</span>
            <span class="kpi-value">${opts.value}</span>
            <span class="kpi-sub">${opts.sub}</span>
        </button>`;

    container.innerHTML = `
        <div class="kpi-strip">
            ${kpi({ label: '総資産', value: totalAssets, sub: `今月 ${addedThisMonth} 件を追加`,
                    onclick: "filterByStatus('__all__')", title: '全資産一覧を開く' })}
            ${kpi({ label: '稼働率', value: `${activePercent}<small>%</small>`, sub: mixBar || `${activeAssets} / ${totalAssets}`,
                    tone: 'success', onclick: "filterByStatus('稼働中')", title: `${activeAssets} / ${totalAssets} が稼働中。稼働中の資産を表示` })}
            ${kpi({ label: '停止中', value: stopped, sub: stopped > 0 ? '対応が必要' : '停止中なし',
                    tone: stopped > 0 ? 'danger' : '', onclick: "filterByStatus('停止中')", title: '停止中の資産だけを表示' })}
            ${kpi({ label: '点検・修理中', value: inspecting, sub: inspecting > 0 ? '作業が進行中' : '該当なし',
                    tone: inspecting > 0 ? 'warning' : '', onclick: "filterByStatus('点検中')", title: '点検中の資産を表示' })}
            ${kpi({ label: '期限超過', value: groups.over.length, sub: '周期計画・期限項目',
                    tone: groups.over.length > 0 ? 'danger' : '', onclick: "focusActionGroup('over')", title: '要対応の「期限超過」へ' })}
            ${kpi({ label: '14日以内', value: groups.soon.length, sub: '予定・期限が近いもの',
                    tone: groups.soon.length > 0 ? 'warning' : '', onclick: "focusActionGroup('soon')", title: '要対応の「14日以内」へ' })}
        </div>

        <div class="dashboard-cols">
            <div style="min-width:0;">
                ${renderActionCenter(tasks, groups)}
            </div>

            <div class="dashboard-side">
                ${renderStatusBreakdown(totalAssets)}

                <div class="panel">
                    <div class="panel-head">
                        <h3 class="section-title"><i class="fa-solid fa-clock-rotate-left"></i> 最近の作業履歴</h3>
                    </div>
                    ${renderRecentHistory()}
                </div>

                ${renderRecentlyOpenedPanel()}

                <div class="panel">
                    <div class="panel-head">
                        <h3 class="section-title"><i class="fa-solid fa-cubes"></i> 最近追加した資産</h3>
                        <button class="btn btn-ghost btn-sm" onclick="showAssets()">一覧へ</button>
                    </div>
                    ${renderRecentAssetList()}
                </div>
            </div>
        </div>
    `;
}

/* ============================================================
   要対応（Action Center）
   ============================================================ */

/**
 * 対応が必要な事項をすべて集め、緊急度の高い順に並べる
 */
function collectActionItems() {
    const items = [];

    getPersistedAssets().forEach(asset => {
        (asset.scheduledPlans || []).forEach((plan, planIndex) => {
            const days = daysUntil(plan.date);
            if(isNaN(days)) return;

            // 期限超過、または14日以内に到来する予定だけを扱う
            if(days > 14) return;

            const tone = days < 0 ? 'danger' : days <= 3 ? 'warning' : 'info';
            items.push({
                kind: 'schedule',
                tone,
                icon: days < 0 ? 'fa-calendar-xmark' : 'fa-calendar-day',
                title: asset.name,
                desc: `${plan.event || '周期計画'}（予定 ${plan.date}）`,
                when: formatDayDelta(days),
                sort: days,
                assetId: asset.id,
                planIndex
            });
        });

        // 停止中の資産（予定より優先して最上部に出す）
        const status = asset.status || [];
        if(status.includes('停止中')) {
            items.push({
                kind: 'status', tone: 'danger', icon: 'fa-circle-exclamation',
                title: asset.name,
                desc: asset.specs ? asset.specs.split('\n')[0] : '停止中のままです',
                when: '停止中', sort: -99999, assetId: asset.id
            });
        }
    });

    // カスタムフィールドの期限アラート（車検満了日など）
    checkCustomFieldAlerts().forEach(alert => {
        items.push({
            kind: 'field',
            tone: alert.severity === 'overdue' ? 'danger' : alert.severity === 'high' ? 'warning' : 'info',
            icon: 'fa-bell',
            title: alert.assetName,
            desc: `${alert.tagName}：${alert.fieldLabel}（${alert.dueDate}）`,
            when: formatDayDelta(alert.daysRemaining),
            sort: alert.daysRemaining, assetId: alert.assetId
        });
    });

    return items.sort((a, b) => a.sort - b.sort);
}

/**
 * 要対応を「停止中 / 期限超過 / 14日以内」に分ける
 */
function groupActionItems(items) {
    return {
        stop: items.filter(i => i.kind === 'status'),
        over: items.filter(i => i.kind !== 'status' && i.tone === 'danger'),
        soon: items.filter(i => i.kind !== 'status' && i.tone !== 'danger')
    };
}

function renderActionCenter(items, groups) {
    if(items.length === 0) {
        return `
            <div class="all-clear">
                <i class="fa-solid fa-circle-check"></i>
                <div>
                    <div class="all-clear-title">対応が必要な事項はありません</div>
                    <div class="all-clear-desc">期限超過・停止中の資産・14日以内の予定はすべてクリアです</div>
                </div>
            </div>`;
    }

    const urgent = groups.stop.length + groups.over.length;
    const defs = [
        { key: 'stop', label: '停止中',   tone: 'danger',  empty: '停止中の資産はありません' },
        { key: 'over', label: '期限超過', tone: 'danger',  empty: '期限を過ぎた予定はありません' },
        { key: 'soon', label: '14日以内', tone: 'warning', empty: '14日以内の予定はありません' }
    ];

    const row = (item) => {
        const index = items.indexOf(item);
        return `
            <div class="action-row" onclick="openAssetModal('${item.assetId}')" title="クリックして詳細を開く">
                <span class="action-mark" data-tone="${item.tone}"></span>
                <span class="action-icon" data-tone="${item.tone}"><i class="fa-solid ${item.icon}"></i></span>
                <div class="action-main">
                    <span class="action-title">${escapeHTML(item.title)}</span>
                    <span class="action-desc">${escapeHTML(item.desc)}</span>
                </div>
                <span class="action-when" data-tone="${item.tone}">${escapeHTML(item.when)}</span>
                <span class="action-quick">${item.kind === 'schedule' ? `
                        <button class="btn btn-outline btn-sm"
                                onclick="event.stopPropagation(); completeActionItem(${index});"
                                title="今日実施したものとして履歴に記録し、次回予定へ進めます">
                            <i class="fa-solid fa-check"></i> 実施済み
                        </button>` : ''}</span>
            </div>`;
    };

    const section = (def) => {
        const list = groups[def.key];
        const state = actionGroupState[def.key];
        const shown = state.expanded ? list : list.slice(0, ACTION_GROUP_PREVIEW);
        const rest = list.length - shown.length;
        return `
            <div class="action-group ${state.collapsed ? 'is-collapsed' : ''}" id="actionGroup-${def.key}">
                <button class="action-group-head" onclick="toggleActionGroup('${def.key}')" aria-expanded="${!state.collapsed}">
                    <i class="fa-solid fa-chevron-down action-group-chevron"></i>
                    <span class="action-group-dot" data-tone="${list.length ? def.tone : 'neutral'}"></span>
                    <span class="action-group-title">${def.label}</span>
                    <span class="count-pill">${list.length}</span>
                </button>
                <div class="action-group-body">
                    ${list.length === 0
                        ? `<div class="action-group-empty"><i class="fa-solid fa-check"></i> ${def.empty}</div>`
                        : shown.map(row).join('')}
                    ${rest > 0 ? `
                        <button class="action-more" onclick="expandActionGroup('${def.key}', true)">
                            残り ${rest} 件を表示 <i class="fa-solid fa-chevron-down"></i>
                        </button>` : ''}
                    ${state.expanded && list.length > ACTION_GROUP_PREVIEW ? `
                        <button class="action-more" onclick="expandActionGroup('${def.key}', false)">
                            上位 ${ACTION_GROUP_PREVIEW} 件に戻す <i class="fa-solid fa-chevron-up"></i>
                        </button>` : ''}
                </div>
            </div>`;
    };

    return `
        <div class="panel action-center">
            <div class="panel-head">
                <h3 class="section-title">
                    <i class="fa-solid fa-list-check" style="color:${urgent > 0 ? 'var(--danger)' : 'var(--warning)'};"></i>
                    要対応
                </h3>
                <span class="badge ${urgent > 0 ? 'badge-red' : 'badge-orange'}">${items.length}件</span>
            </div>
            ${defs.map(section).join('')}
        </div>`;
}

function toggleActionGroup(key) {
    actionGroupState[key].collapsed = !actionGroupState[key].collapsed;
    renderDashboard();
}

function expandActionGroup(key, expanded) {
    actionGroupState[key].expanded = expanded;
    renderDashboard();
}

/** KPIから要対応の該当グループへ移動し、全件を開く */
function focusActionGroup(key) {
    actionGroupState[key].collapsed = false;
    actionGroupState[key].expanded = true;
    renderDashboard();
    const el = document.getElementById(`actionGroup-${key}`);
    if(el) {
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        el.classList.add('is-flash');
        setTimeout(() => el.classList.remove('is-flash'), 900);
    }
}

/**
 * 要対応の行から直接「実施済み」にする
 * 資産を開かずに、履歴の記録と次回予定の更新をまとめて済ませる。
 */
function completeActionItem(index) {
    const items = collectActionItems();
    const item = items[index];
    if(!item || item.kind !== 'schedule') return;

    const asset = assets.find(a => a.id === item.assetId);
    if(!asset || !asset.scheduledPlans[item.planIndex]) return;

    const plan = asset.scheduledPlans[item.planIndex];
    const previousDate = plan.date;

    if(!asset.maintenance) asset.maintenance = [];
    const historyRecord = { date: todayISO(), event: plan.event };
    asset.maintenance.push(historyRecord);
    recordUsage('events', plan.event);

    let message;
    if(plan.cycle) {
        plan.date = addDaysISO(todayISO(), plan.cycle);
        message = `「${asset.name}」の ${plan.event} を記録し、次回を ${plan.date} にしました`;
    } else {
        asset.scheduledPlans.splice(item.planIndex, 1);
        message = `「${asset.name}」の ${plan.event} を記録し、予定を完了しました`;
    }

    renderDashboard();
    autoSaveData();

    showToast(message, 'success', {
        label: '元に戻す',
        onClick: () => {
            const hIndex = asset.maintenance.indexOf(historyRecord);
            if(hIndex >= 0) asset.maintenance.splice(hIndex, 1);
            if(plan.cycle) plan.date = previousDate;
            else asset.scheduledPlans.splice(item.planIndex, 0, plan);
            renderDashboard();
            autoSaveData();
        }
    });
}

/* ============================================================
   稼働状況の内訳
   ============================================================ */

function renderStatusBreakdown(totalAssets) {
    if(totalAssets === 0) return '';

    const pool = getPersistedAssets();
    const rows = STATUS_DEFS.map(def => ({
        label: def.value,
        color: def.nodeColor,
        count: pool.filter(a => (a.status || []).includes(def.value)).length
    })).filter(r => r.count > 0);

    const noneCount = pool.filter(a => !a.status || a.status.length === 0).length;
    if(noneCount > 0) rows.push({ label: '未設定', color: 'var(--n-300)', count: noneCount, isNone: true });

    if(rows.length === 0) return '';
    const sum = rows.reduce((s, r) => s + r.count, 0);

    return `
        <div class="panel panel-pad">
            <div class="section-head" style="margin-bottom:0;">
                <h3 class="section-title"><i class="fa-solid fa-chart-simple"></i> 稼働状況の内訳</h3>
            </div>
            <div class="status-bar">
                ${rows.map(r => `
                    <div class="status-bar-seg" style="width:${(r.count / sum * 100).toFixed(2)}%; background:${r.color};"
                         title="${escapeHTML(r.label)}: ${r.count}件"></div>`).join('')}
            </div>
            <div class="status-legend">
                ${rows.map(r => `
                    <span class="status-legend-item" onclick="filterByStatus('${r.isNone ? '__none__' : escapeHTML(r.label)}')"
                          title="この状態の資産だけを一覧表示">
                        <span class="status-legend-dot" style="background:${r.color};"></span>
                        ${escapeHTML(r.label)}
                        <span class="status-legend-value">${r.count}</span>
                    </span>`).join('')}
            </div>
        </div>`;
}

/* ============================================================
   最近の動き
   ============================================================ */

/**
 * 最近追加した資産（カードより情報密度の高いリスト形式）
 */
function renderRecentAssetList() {
    const recent = getPersistedAssets()
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

    if(recent.length === 0) {
        return `
            <div class="empty-state" style="padding:var(--space-6) var(--space-4);">
                <i class="fa-solid fa-box-open empty-state-icon"></i>
                <div class="empty-state-title">資産がまだありません</div>
                <div class="empty-state-desc">最初の1件を登録すると、ここに表示されます</div>
                <button class="btn btn-primary btn-sm" onclick="createNewAsset()">
                    <i class="fa-solid fa-plus"></i> 新規資産を登録
                </button>
            </div>`;
    }

    return recent.map(a => {
        const status = (a.status && a.status.length) ? a.status[0] : '未設定';
        return `
            <div class="timeline-row" onclick="openAssetModal('${a.id}')">
                <div class="timeline-date">${escapeHTML(a.date || '—')}</div>
                <div class="timeline-main">
                    <span class="timeline-asset">${escapeHTML(a.name)}</span>
                    <span class="timeline-event">${escapeHTML(tags.filter(t => a.tags.includes(t.id)).map(t => t.name).join(' · '))}</span>
                </div>
                <span class="badge ${getStatusBadgeClass(status)}">${escapeHTML(status)}</span>
            </div>`;
    }).join('');
}

/**
 * 最近開いた資産（作業の続きにすぐ戻れるようにする）
 * 使用実績が無いうちは表示しない。
 */
function renderRecentlyOpenedPanel() {
    const recent = getRecentlyOpenedAssets(4);
    if(recent.length < 2) return '';

    return `
        <div class="panel">
            <div class="panel-head">
                <h3 class="section-title"><i class="fa-solid fa-rotate-left"></i> 最近開いた資産</h3>
            </div>
            ${recent.map(a => `
                <div class="timeline-row" onclick="openAssetModal('${a.id}')">
                    <div class="timeline-main">
                        <span class="timeline-asset">${escapeHTML(a.name)}</span>
                        <span class="timeline-event">${escapeHTML(a.id.toUpperCase())}</span>
                    </div>
                    <i class="fa-solid fa-chevron-right" style="color:var(--text-faint); font-size:0.65rem;"></i>
                </div>`).join('')}
        </div>`;
}

function renderRecentHistory() {
    const allHistory = [];
    getPersistedAssets().forEach(asset => {
        (asset.maintenance || []).forEach(m => {
            allHistory.push({ assetName: asset.name, assetId: asset.id, date: m.date, event: m.event });
        });
    });

    allHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
    const recent = allHistory.slice(0, 8);

    if(recent.length === 0) {
        return `
            <div class="empty-state" style="padding:var(--space-6) var(--space-4);">
                <i class="fa-regular fa-clock empty-state-icon"></i>
                <div class="empty-state-title">履歴がまだありません</div>
                <div class="empty-state-desc">資産の「履歴」タブから、実施した作業を記録できます</div>
            </div>`;
    }

    return recent.map(h => `
        <div class="timeline-row" onclick="openAssetModal('${h.assetId}', 'tabMaint')" title="クリックして履歴を開く">
            <div class="timeline-date">${escapeHTML(h.date)}</div>
            <div class="timeline-main">
                <span class="timeline-asset">${escapeHTML(h.assetName)}</span>
                <span class="timeline-event">${escapeHTML(h.event || '')}</span>
            </div>
            <span class="count-pill">${escapeHTML(formatDateRelative(h.date))}</span>
        </div>`).join('');
}
