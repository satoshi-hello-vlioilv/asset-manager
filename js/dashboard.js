
/**
 * dashboard.js
 * ダッシュボード表示
 *
 * 設計:
 *   ダッシュボードの役割は「眺めること」ではなく「次の行動を決めること」。
 *   そのため、画面の最上部に “今日やるべきこと” を重い順に並べ、
 *   1クリックで該当資産に到達できるようにしている。
 *   統計カードはその下に置き、数字からも対象一覧へ遷移できるようにする。
 */

/**
 * ダッシュボードのレンダリング
 */
function renderDashboard() {
    const container = document.getElementById('dashboardContainer');
    if(!container) return;

    // 編集中の下書きは統計に含めない
    const pool = getPersistedAssets();
    const totalAssets  = pool.length;
    const activeAssets = pool.filter(a => (a.status || []).includes('稼働中')).length;
    const inspecting   = pool.filter(a => (a.status || []).includes('点検中')).length;
    const stopped      = pool.filter(a => (a.status || []).includes('停止中') || (a.status || []).includes('修理中')).length;
    const activePercent = totalAssets > 0 ? Math.round((activeAssets / totalAssets) * 100) : 0;

    // 今月追加された資産（推測に頼らない実測値のみを出す）
    const now = new Date();
    const addedThisMonth = pool.filter(a => {
        if(!a.date) return false;
        const d = new Date(a.date);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;

    const tasks = collectActionItems();

    container.innerHTML = `
        ${renderActionCenter(tasks)}

        <div class="dashboard-grid">
            <div class="stat-card is-clickable" data-tone="neutral" onclick="filterByStatus('__all__')" title="全資産一覧を開く">
                <div class="stat-label">総資産数</div>
                <div class="stat-value">${totalAssets}</div>
                <div class="stat-trend">今月 ${addedThisMonth} 件を追加</div>
            </div>

            <div class="stat-card is-clickable" data-tone="success" onclick="filterByStatus('稼働中')" title="稼働中の資産だけを表示">
                <div class="stat-label">稼働率</div>
                <div class="stat-value" style="color:var(--success);">${activePercent}<span style="font-size:var(--text-md);">%</span></div>
                <div class="stat-trend">${activeAssets} / ${totalAssets} が稼働中</div>
            </div>

            <div class="stat-card is-clickable" data-tone="warning" onclick="filterByStatus('点検中')" title="点検中の資産だけを表示">
                <div class="stat-label">点検・メンテナンス中</div>
                <div class="stat-value" style="color:var(--warning);">${inspecting}</div>
                <div class="stat-trend">${inspecting > 0 ? '作業が進行中です' : '該当なし'}</div>
            </div>

            <div class="stat-card is-clickable" data-tone="${stopped > 0 ? 'danger' : 'neutral'}" onclick="filterByStatus('停止中')" title="停止中の資産だけを表示">
                <div class="stat-label">停止・修理中</div>
                <div class="stat-value" style="color:${stopped > 0 ? 'var(--danger)' : 'var(--text-strong)'};">${stopped}</div>
                <div class="stat-trend ${stopped > 0 ? 'trend-down' : ''}">
                    ${stopped > 0 ? '<i class="fa-solid fa-triangle-exclamation"></i> 対応が必要です' : '停止中の資産はありません'}
                </div>
            </div>
        </div>

        ${renderStatusBreakdown(totalAssets)}

        <div class="panel" style="margin-bottom:var(--space-6);">
            <div class="panel-pad" style="padding-bottom:0;">
                <div class="section-head">
                    <h3 class="section-title"><i class="fa-solid fa-clock-rotate-left"></i> 最近の履歴</h3>
                    <span class="count-pill">直近8件</span>
                </div>
            </div>
            ${renderRecentHistory()}
        </div>

        <div>
            <div class="section-head">
                <h3 class="section-title"><i class="fa-solid fa-cubes"></i> 最近追加された資産</h3>
                <button class="btn btn-ghost btn-sm" onclick="showAssets()">すべて見る <i class="fa-solid fa-arrow-right"></i></button>
            </div>
            <div class="asset-grid">${renderRecentAssetCards()}</div>
        </div>
    `;
}

/* ============================================================
   要対応（Action Center）
   ============================================================ */

/**
 * 対応が必要な事項をすべて集め、緊急度の高い順に並べる
 * @returns {Array<{tone:string, icon:string, title:string, desc:string, when:string, sort:number, assetId:string}>}
 */
function collectActionItems() {
    const items = [];

    getPersistedAssets().forEach(asset => {
        // 1. 期限を過ぎた周期計画（最優先）
        getOverdueSchedules(asset).forEach(plan => {
            const days = daysUntil(plan.date);
            items.push({
                tone: 'danger', icon: 'fa-calendar-xmark',
                title: asset.name,
                desc: `${plan.event || '周期計画'}（予定日 ${plan.date}）`,
                when: formatDayDelta(days), sort: days, assetId: asset.id
            });
        });

        // 2. 14日以内に到来する周期計画
        (asset.scheduledPlans || []).forEach(plan => {
            const days = daysUntil(plan.date);
            if(days >= 0 && days <= 14) {
                items.push({
                    tone: days <= 3 ? 'warning' : 'info', icon: 'fa-calendar-day',
                    title: asset.name,
                    desc: `${plan.event || '周期計画'}（予定日 ${plan.date}）`,
                    when: formatDayDelta(days), sort: days, assetId: asset.id
                });
            }
        });

        // 3. 停止・修理中の資産
        const status = asset.status || [];
        if(status.includes('停止中') || status.includes('修理中')) {
            items.push({
                tone: 'danger', icon: 'fa-circle-exclamation',
                title: asset.name,
                desc: asset.specs ? asset.specs.split('\n')[0] : `${status.join('・')}の状態です`,
                when: status.join('・'), sort: -9999, assetId: asset.id
            });
        }
    });

    // 4. カスタムフィールドの期限アラート（車検満了日など）
    checkCustomFieldAlerts().forEach(alert => {
        items.push({
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

function renderActionCenter(items) {
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

    const shown = items.slice(0, 8);
    const urgent = items.filter(i => i.tone === 'danger').length;

    return `
        <div class="panel action-center">
            <div class="panel-pad" style="padding-bottom:var(--space-3);">
                <div class="section-head" style="margin-bottom:0;">
                    <div>
                        <h3 class="section-title">
                            <i class="fa-solid fa-triangle-exclamation" style="color:${urgent > 0 ? 'var(--danger)' : 'var(--warning)'};"></i>
                            要対応
                        </h3>
                        <p class="section-desc">緊急度の高い順に表示しています。クリックすると該当資産が開きます</p>
                    </div>
                    <span class="badge ${urgent > 0 ? 'badge-red' : 'badge-orange'}">${items.length}件</span>
                </div>
            </div>
            <div class="action-list">
                ${shown.map(item => `
                    <div class="action-row" onclick="openAssetModal('${item.assetId}')" title="クリックして詳細を開く">
                        <div class="action-icon" data-tone="${item.tone}"><i class="fa-solid ${item.icon}"></i></div>
                        <div class="action-main">
                            <div class="action-title">${escapeHTML(item.title)}</div>
                            <div class="action-desc">${escapeHTML(item.desc)}</div>
                        </div>
                        <span class="action-when" data-tone="${item.tone}">${escapeHTML(item.when)}</span>
                        <i class="fa-solid fa-chevron-right action-go"></i>
                    </div>`).join('')}
            </div>
            ${items.length > shown.length ? `
                <div style="padding:var(--space-3); text-align:center; border-top:1px solid var(--border-subtle);">
                    <span style="font-size:var(--text-sm); color:var(--text-sub);">他 ${items.length - shown.length} 件</span>
                </div>` : ''}
        </div>`;
}

/* ============================================================
   稼働状況の内訳
   ============================================================ */

/**
 * ステータス構成を横帯で表示する
 * 円グラフより長さの比較が容易で、凡例から直接その一覧に飛べる。
 */
function renderStatusBreakdown(totalAssets) {
    if(totalAssets === 0) return '';

    const pool = getPersistedAssets();
    const rows = STATUS_DEFS.map(def => ({
        label: def.value,
        color: def.nodeColor,
        count: pool.filter(a => (a.status || []).includes(def.value)).length
    })).filter(r => r.count > 0);

    const noneCount = pool.filter(a => !a.status || a.status.length === 0).length;
    if(noneCount > 0) rows.push({ label: '未設定', color: 'var(--slate-300)', count: noneCount, isNone: true });

    if(rows.length === 0) return '';

    const sum = rows.reduce((s, r) => s + r.count, 0);

    return `
        <div class="panel panel-pad" style="margin-bottom:var(--space-6);">
            <div class="section-head" style="margin-bottom:0;">
                <div>
                    <h3 class="section-title"><i class="fa-solid fa-chart-simple"></i> 稼働状況の内訳</h3>
                    <p class="section-desc">凡例をクリックすると、その状態の資産だけを一覧表示します</p>
                </div>
            </div>
            <div class="status-bar">
                ${rows.map(r => `
                    <div class="status-bar-seg" style="width:${(r.count / sum * 100).toFixed(2)}%; background:${r.color};"
                         title="${escapeHTML(r.label)}: ${r.count}件"></div>`).join('')}
            </div>
            <div class="status-legend">
                ${rows.map(r => `
                    <span class="status-legend-item" onclick="filterByStatus('${r.isNone ? '__none__' : escapeHTML(r.label)}')">
                        <span class="status-legend-dot" style="background:${r.color};"></span>
                        ${escapeHTML(r.label)}
                        <span class="status-legend-value">${r.count}</span>
                    </span>`).join('')}
            </div>
        </div>`;
}

/* ============================================================
   最近追加された資産 / 最近の履歴
   ============================================================ */

function renderRecentAssetCards() {
    const recentAssets = getPersistedAssets().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);

    if(recentAssets.length === 0) {
        return `
            <div class="panel empty-state" style="grid-column:1/-1;">
                <i class="fa-solid fa-box-open empty-state-icon"></i>
                <div class="empty-state-title">まだ資産が登録されていません</div>
                <div class="empty-state-desc">最初の1件を登録すると、ここに表示されます</div>
                <button class="btn btn-primary" onclick="createNewAsset()">
                    <i class="fa-solid fa-plus"></i> 新規資産を登録
                </button>
            </div>`;
    }

    return recentAssets.map(a => {
        const myTags = tags.filter(t => a.tags.includes(t.id));
        const statusBadges = (a.status && a.status.length)
            ? renderStatusBadgesHTML(a.status)
            : '<span class="badge badge-gray">未設定</span>';
        const thumbnailUrl = getAssetThumbnailUrl(a);

        return `
            <div class="card" onclick="openAssetModal('${a.id}')" tabindex="0"
                 onkeydown="if(event.key==='Enter') openAssetModal('${a.id}')">
                <div class="card-image">
                    ${thumbnailUrl
                        ? `<img src="${escapeHTML(thumbnailUrl)}" alt="${escapeHTML(a.name)}" loading="lazy">`
                        : `<i class="${getAssetIconClass(a)}"></i>`}
                    <div class="card-img-tag">${escapeHTML(a.id.toUpperCase())}</div>
                </div>
                <div class="card-body">
                    <div class="card-header-row"><h3 class="card-title">${escapeHTML(a.name)}</h3></div>
                    <div style="display:flex; gap:4px; flex-wrap:wrap;">${statusBadges}</div>
                    <div class="card-meta"><span><i class="fa-regular fa-calendar"></i> ${escapeHTML(a.date || '—')}</span></div>
                    <div class="tag-row">
                        ${myTags.slice(0, 3).map(t => `<span class="badge badge-gray">${escapeHTML(t.name)}</span>`).join('')}
                        ${myTags.length > 3 ? `<span class="badge badge-gray">+${myTags.length - 3}</span>` : ''}
                    </div>
                </div>
            </div>`;
    }).join('');
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
            <div class="empty-state" style="padding:var(--space-8) var(--space-5);">
                <i class="fa-regular fa-clock empty-state-icon"></i>
                <div class="empty-state-title">履歴がまだありません</div>
                <div class="empty-state-desc">資産の詳細画面「履歴」タブから、実施した作業を記録できます</div>
            </div>`;
    }

    return recent.map(h => `
        <div class="timeline-row" onclick="openAssetModal('${h.assetId}')" title="クリックして詳細を開く">
            <div class="timeline-date">${escapeHTML(h.date)}</div>
            <div class="timeline-main">
                <div class="timeline-asset">${escapeHTML(h.assetName)}</div>
                <div class="timeline-event" title="${escapeHTML(h.event || '')}">${escapeHTML(h.event || '')}</div>
            </div>
            <span class="count-pill">${escapeHTML(formatDateRelative(h.date))}</span>
        </div>`).join('');
}
