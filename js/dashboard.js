
/**
 * dashboard.js
 * ダッシュボード表示
 */

/**
 * ダッシュボードのレンダリング
 */
function renderDashboard() {
    const container = document.getElementById('dashboardContainer');
    
    // 統計情報を計算
    const totalAssets = assets.length;
    const activeAssets = assets.filter(a => a.status.includes('稼働中')).length;
    const maintenanceAssets = assets.filter(a => a.status.includes('点検中')).length;
    const stoppedAssets = assets.filter(a => a.status.includes('停止中') || a.status.includes('修理中')).length;
    
    const activePercent = totalAssets > 0 ? Math.round((activeAssets / totalAssets) * 100) : 0;
    
    // カスタムフィールドのアラートをチェック
    const alerts = checkCustomFieldAlerts();
    
    container.innerHTML = `
        <!-- Stat Cards -->
        <div class="dashboard-grid">
            <div class="stat-card">
                <div class="stat-label">総資産数</div>
                <div class="stat-value">${totalAssets}</div>
                <div class="stat-trend trend-up">
                    <i class="fa-solid fa-arrow-trend-up"></i> 前月比 +${Math.floor(Math.random() * 3 + 1)}
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-label">稼働率</div>
                <div class="stat-value" style="color: var(--success);">${activePercent}%</div>
                <div class="stat-trend">
                    ${activeAssets} / ${totalAssets} 稼働中
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-label">点検・メンテナンス</div>
                <div class="stat-value" style="color: var(--primary);">${maintenanceAssets}</div>
                <div class="stat-trend">
                    定期点検実施中
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-label">停止・修理中</div>
                <div class="stat-value" style="color: var(--danger);">${stoppedAssets}</div>
                <div class="stat-trend ${stoppedAssets > 0 ? 'trend-down' : ''}">
                    ${stoppedAssets > 0 ? '<i class="fa-solid fa-exclamation-triangle"></i> 要対応' : '正常'}
                </div>
            </div>
        </div>
        
        <!-- Alert Section -->
        ${alerts.length > 0 ? renderAlerts(alerts) : ''}
        
        <!-- Recent Assets Section -->
        <div style="margin-top: 32px;">
            <h3 style="margin: 0 0 16px 0; font-size: 1.2rem; font-weight: 600;">最近追加された資産</h3>
            <div class="asset-grid">
                ${renderRecentAssetCards()}
            </div>
        </div>
        
        <!-- Recent Activity -->
        <div style="margin-top: 48px;">
            <h3 style="margin: 0 0 16px 0; font-size: 1.2rem; font-weight: 600;">最近の履歴</h3>
            <div style="background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden;">
                ${renderRecentHistory()}
            </div>
        </div>
    `;
}

/**
 * アラートセクションを表示
 */
function renderAlerts(alerts) {
    // 重要度でソート（overdue > high > medium > low）
    const severityOrder = { overdue: 0, high: 1, medium: 2, low: 3 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    
    return `
        <div style="margin-top:32px; padding:20px; background:#fff; border:1px solid var(--border); border-radius:var(--radius-lg);">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 style="margin:0; font-size:1.2rem; font-weight:600;">
                    <i class="fa-solid fa-bell" style="color:var(--warning); margin-right:8px;"></i>
                    期限アラート
                </h3>
                <span style="font-size:0.85rem; color:var(--text-sub);">${alerts.length}件</span>
            </div>
            <div style="display:grid; gap:12px;">
                ${alerts.slice(0, 10).map(alert => {
                    let bgColor, borderColor, iconColor, icon;
                    
                    if(alert.severity === 'overdue') {
                        bgColor = '#fef2f2';
                        borderColor = '#fca5a5';
                        iconColor = '#dc2626';
                        icon = 'fa-exclamation-circle';
                    } else if(alert.severity === 'high') {
                        bgColor = '#fef2f2';
                        borderColor = '#fca5a5';
                        iconColor = '#ef4444';
                        icon = 'fa-bell';
                    } else if(alert.severity === 'medium') {
                        bgColor = '#fffbeb';
                        borderColor = '#fde047';
                        iconColor = '#f59e0b';
                        icon = 'fa-bell';
                    } else {
                        bgColor = '#f0fdf4';
                        borderColor = '#86efac';
                        iconColor = '#22c55e';
                        icon = 'fa-bell';
                    }
                    
                    const daysText = alert.severity === 'overdue' 
                        ? `${Math.abs(alert.daysRemaining)}日超過` 
                        : `あと${alert.daysRemaining}日`;
                    
                    return `
                        <div style="padding:16px; background:${bgColor}; border-left:4px solid ${borderColor}; border-radius:var(--radius-md); cursor:pointer; transition:all 0.2s;"
                             onclick="openAssetModal('${alert.assetId}')"
                             onmouseover="this.style.boxShadow='var(--shadow-md)'"
                             onmouseout="this.style.boxShadow=''">
                            <div style="display:flex; align-items:start; gap:12px;">
                                <i class="fa-solid ${icon}" style="color:${iconColor}; font-size:1.2rem; margin-top:2px;"></i>
                                <div style="flex:1;">
                                    <div style="font-weight:600; margin-bottom:4px; color:var(--text);">
                                        ${alert.assetName}
                                    </div>
                                    <div style="font-size:0.9rem; color:var(--text-sub); margin-bottom:4px;">
                                        <span class="badge badge-gray" style="font-size:0.75rem;">${alert.tagName}</span>
                                        ${alert.fieldLabel}
                                    </div>
                                    <div style="display:flex; align-items:center; gap:12px; font-size:0.85rem;">
                                        <span style="color:var(--text-sub);">
                                            <i class="fa-regular fa-calendar" style="margin-right:4px;"></i>
                                            ${alert.dueDate}
                                        </span>
                                        <span style="color:${iconColor}; font-weight:600;">${daysText}</span>
                                    </div>
                                </div>
                                <i class="fa-solid fa-chevron-right" style="color:var(--text-sub); opacity:0.3;"></i>
                            </div>
                        </div>
                    `;
                }).join('')}
                ${alerts.length > 10 ? `
                    <div style="text-align:center; padding:12px; color:var(--text-sub); font-size:0.9rem;">
                        他 ${alerts.length - 10}件のアラート
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * 最近追加された資産カードを表示
 */
function renderRecentAssetCards() {
    const recentAssets = [...assets].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);
    
    return recentAssets.map(a => {
        const myTags = tags.filter(t => a.tags.includes(t.id));
        const statusBadges = renderStatusBadgesHTML(a.status);
        const iconClass = getAssetIconClass(a);
        const thumbnailUrl = getAssetThumbnailUrl(a);

        return `
            <div class="card" onclick="openAssetModal('${a.id}')">
                <div class="card-image">
                    ${thumbnailUrl ? `<img src="${thumbnailUrl}" alt="${escapeHTML(a.name)}">` : `<i class="${iconClass}"></i>`}
                    <div class="card-img-tag">${a.id.toUpperCase()}</div>
                </div>
                <div class="card-body">
                    <div class="card-header-row">
                        <h3 class="card-title">${a.name}</h3>
                    </div>
                    <div class="card-meta">
                        <span><i class="fa-regular fa-calendar"></i> ${a.date}</span>
                    </div>
                    <div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:4px;">
                        ${statusBadges}
                    </div>
                    <div class="tag-row">
                        ${myTags.slice(0, 3).map(t => `<span class="badge badge-gray">${t.name}</span>`).join('')}
                        ${myTags.length > 3 ? `<span class="badge badge-gray">+${myTags.length - 3}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * 最近の履歴を表示
 */
function renderRecentHistory() {
    const allHistory = [];
    assets.forEach(asset => {
        if(asset.maintenance && asset.maintenance.length > 0) {
            asset.maintenance.forEach(m => {
                allHistory.push({
                    assetName: asset.name,
                    assetId: asset.id,
                    date: m.date,
                    event: m.event
                });
            });
        }
    });
    
    allHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
    const recent = allHistory.slice(0, 8);
    
    if(recent.length === 0) {
        return '<div style="color: var(--text-sub); text-align: center; padding: 40px;">履歴がありません</div>';
    }
    
    return recent.map((h, idx) => `
        <div style="padding: 16px 20px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; ${idx === recent.length - 1 ? 'border-bottom: none;' : ''}">
            <div style="flex: 1;">
                <div style="font-weight: 600; margin-bottom: 4px; font-size: 0.95rem;">${h.assetName}</div>
                <div style="color: var(--text-sub); font-size: 0.85rem;">${h.event}</div>
            </div>
            <div style="text-align: right; min-width: 100px;">
                <div style="font-size: 0.75rem; color: var(--text-sub);">${h.date}</div>
                <div style="font-size: 0.75rem; color: var(--text-sub); margin-top: 2px;">${h.assetId.toUpperCase()}</div>
            </div>
        </div>
    `).join('');
}

