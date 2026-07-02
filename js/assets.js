
/**
 * assets.js
 * 資産表示機能（リスト/カード/カレンダービュー）
 */

function switchAssetView(mode) {
    assetViewMode = mode;
    const btnList     = document.getElementById('btnViewList');
    const btnCard     = document.getElementById('btnViewCard');
    const btnCalendar = document.getElementById('btnViewCalendar');
    const btnListSettings = document.getElementById('btnListSettings');

    // 全ボタンを非アクティブにリセットし、選択されたものをアクティブにする
    [btnList, btnCard, btnCalendar].forEach(btn => setToggleInactive(btn));
    const activeBtn = { list: btnList, card: btnCard, calendar: btnCalendar }[mode];
    if (activeBtn) setToggleActive(activeBtn);

    // 表示設定ボタンの表示/非表示
    btnListSettings.style.display = mode === 'list' ? 'inline-flex' : 'none';

    // 現在の表示データを再レンダリング
    const currentData = window.currentAssetList || assets;
    renderAssets(currentData);
}

/**
 * 資産データをレンダリング（ビューモードに応じて切り替え）
 */
function renderAssets(list) {
    window.currentAssetList = list; // 現在のリストを保存
    
    if(assetViewMode === 'list') {
        renderAssetsList(list);
    } else if(assetViewMode === 'card') {
        renderAssetsCard(list);
    } else if(assetViewMode === 'calendar') {
        renderAssetsCalendar(list);
    }
}

/**
 * リストビューでレンダリング
 */
function renderAssetsList(list) {
    const container = document.getElementById('assetContainer');
    container.innerHTML = '';
    
    // 表示設定ボタンを表示
    document.getElementById('btnListSettings').style.display = 'inline-flex';
    
    // 表示する列を順序でソートしてフィルタ
    const visibleColumns = listDisplaySettings.columns
        .filter(col => col.visible)
        .sort((a, b) => a.order - b.order);
    
    if(visibleColumns.length === 0) {
        container.innerHTML = `
            <div style="padding:60px 20px; text-align:center; color:var(--text-sub);">
                <i class="fa-solid fa-eye-slash" style="font-size:3rem; margin-bottom:12px; display:block; opacity:0.3;"></i>
                <div style="font-size:1rem;">表示する列が設定されていません</div>
                <div style="font-size:0.85rem; margin-top:8px; opacity:0.7;">
                    <button class="btn btn-primary btn-sm" onclick="openListSettingsModal()" style="margin-top:16px;">
                        <i class="fa-solid fa-sliders"></i> 表示設定を開く
                    </button>
                </div>
            </div>
        `;
        return;
    }

    // 対象資産が0件の場合は空状態を表示
    if(list.length === 0) {
        renderAssetsEmptyState(container);
        return;
    }

    // 列幅を計算
    const columnWidths = calculateColumnWidths(visibleColumns, list);
    
    // リストコンテナ（スクロール可能エリア）
    const listWrapper = document.createElement('div');
    listWrapper.style.cssText = 'position:relative; overflow:auto; max-height:calc(100vh - 250px); border:1px solid var(--border); border-radius:var(--radius-md); background:#fff;';
    
    // テーブル
    const table = document.createElement('table');
    table.style.cssText = 'width:100%; border-collapse:collapse; table-layout:fixed;';
    
    // ヘッダー（固定）
    const thead = document.createElement('thead');
    thead.style.cssText = 'position:sticky; top:0; z-index:10; background:#f8fafc; box-shadow:0 2px 4px rgba(0,0,0,0.05);';
    
    const headerRow = document.createElement('tr');
    visibleColumns.forEach((col, index) => {
        const th = document.createElement('th');
        const width = columnWidths[index];
        const headerAlign = col.headerAlign || 'left';
        const isSorted = listSortState.key === col.key;
        const sortedBg = isSorted ? 'rgba(37,99,235,0.05)' : '';
        const sortedColor = isSorted ? 'var(--primary)' : 'var(--text-sub)';
        const sortedBorder = isSorted ? 'var(--primary)' : 'var(--border)';

        th.style.cssText = `padding:12px 16px; text-align:${headerAlign}; font-weight:600; font-size:0.85rem; color:${sortedColor}; border-bottom:2px solid ${sortedBorder}; white-space:nowrap; width:${width}; cursor:pointer; user-select:none; background:${sortedBg}; transition:background 0.15s, color 0.15s;`;

        th.addEventListener('mouseover', () => { th.style.background = isSorted ? '#e0ecff' : '#eef2ff'; });
        th.addEventListener('mouseout',  () => { th.style.background = sortedBg; });
        th.addEventListener('click',     () => handleColumnSort(col.key));

        // ソート方向アイコン
        let sortIcon = '';
        if (isSorted) {
            const dir  = listSortState.direction === 'asc' ? 'up' : 'down';
            sortIcon = `<i class="fa-solid fa-sort-${dir}" style="margin-left:6px; color:var(--primary); font-size:0.75rem;"></i>`;
        }
        th.innerHTML = `<span style="display:inline-flex; align-items:center;">${col.label}${sortIcon}</span>`;

        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // ソート適用
    let displayList = list;
    if (listSortState.key && listSortState.direction) {
        displayList = sortAssetList(list, listSortState.key, listSortState.direction);
    }

    // ボディ
    const tbody = document.createElement('tbody');

    displayList.forEach((asset, index) => {
        const row = document.createElement('tr');
        row.style.cssText = 'cursor:pointer; transition:background 0.15s; border-bottom:1px solid var(--border);';
        row.onmouseover = () => row.style.background = '#f8fafc';
        row.onmouseout = () => row.style.background = index % 2 === 0 ? '#fff' : '#fafbfc';
        row.style.background = index % 2 === 0 ? '#fff' : '#fafbfc';
        row.onclick = () => openAssetModal(asset.id);
        
        visibleColumns.forEach(col => {
            const td = document.createElement('td');
            td.style.cssText = `padding:12px 16px; font-size:0.9rem; text-align:${col.align}; overflow:hidden; text-overflow:ellipsis;`;
            
            const value = getAssetFieldValue(asset, col.key);
            td.innerHTML = value;
            
            row.appendChild(td);
        });
        
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    listWrapper.appendChild(table);
    container.appendChild(listWrapper);
}

/**
 * 列幅を計算
 */
function calculateColumnWidths(visibleColumns, assetList) {
    const widths = [];
    let fixedTotal = 0;
    let equalCount = 0;
    let flexCount = 0;
    let autoWidths = [];
    
    // 各列のタイプを集計
    visibleColumns.forEach((col, index) => {
        if(col.width === 'auto') {
            // auto: 内容に基づいて幅を計算
            let maxLength = col.label.length;
            assetList.forEach(asset => {
                const value = getAssetFieldValue(asset, col.key, true);
                if(value) {
                    maxLength = Math.max(maxLength, value.toString().length);
                }
            });
            const calculatedWidth = Math.min(Math.max(maxLength * 10, 80), 500);
            autoWidths.push(calculatedWidth);
        } else if(col.width === 'equal') {
            equalCount++;
            autoWidths.push(null);
        } else if(col.width === 'flex') {
            flexCount++;
            autoWidths.push(null);
        } else if(typeof col.width === 'string' && col.width.endsWith('px')) {
            const value = parseInt(col.width);
            fixedTotal += value;
            autoWidths.push(null);
        }
    });
    
    const autoTotal = autoWidths.filter(w => w !== null).reduce((sum, w) => sum + w, 0);
    
    // 各列の幅を設定
    visibleColumns.forEach((col, index) => {
        if(col.width === 'auto') {
            widths.push(`${autoWidths[index]}px`);
        } else if(col.width === 'equal') {
            // equal: 全列均等配分（固定幅とauto幅を除く）
            widths.push(`calc((100% - ${fixedTotal + autoTotal}px) / ${equalCount + flexCount})`);
        } else if(col.width === 'flex') {
            // flex: 残り幅を均等配分（equal と同じ）
            widths.push(`calc((100% - ${fixedTotal + autoTotal}px) / ${equalCount + flexCount})`);
        } else if(typeof col.width === 'string' && col.width.endsWith('px')) {
            widths.push(col.width);
        } else {
            // デフォルト
            widths.push('auto');
        }
    });
    
    return widths;
}

/**
 * 資産のフィールド値を取得
 */
function getAssetFieldValue(asset, key, textOnly = false) {
    const myTags = tags.filter(t => asset.tags.includes(t.id));
    const statusArray = Array.isArray(asset.status) ? asset.status : [asset.status];
    
    // テキストを短縮する関数
    const truncate = (text, maxLength = 50) => {
        if(!text) return '';
        if(text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    };
    
    switch(key) {
        case 'name':
            if(textOnly) return asset.name;
            return `<div style="font-weight:600; color:var(--text);">${asset.name}</div>`;
            
        case 'id':
            if(textOnly) return asset.id.toUpperCase();
            return `<div style="font-family:monospace; color:var(--text-sub); font-size:0.85rem;">${asset.id.toUpperCase()}</div>`;
            
        case 'date':
            if(textOnly) return asset.date;
            return `<div style="color:var(--text-sub);"><i class="fa-regular fa-calendar" style="margin-right:4px;"></i>${asset.date}</div>`;
            
        case 'tags':
            if(textOnly) return myTags.map(t => t.name).join(', ');
            const tagHtml = myTags.slice(0, 3).map(t => 
                `<span class="badge badge-gray" style="font-size:0.75rem;">${t.name}</span>`
            ).join('');
            const extraTag = myTags.length > 3 ? 
                `<span class="badge badge-gray" style="font-size:0.75rem;">+${myTags.length - 3}</span>` : '';
            return `<div style="display:flex; gap:4px; flex-wrap:wrap;">${tagHtml}${extraTag}</div>`;
            
        // マスタ別タグは default で汎用的に処理
        
        case 'status':
            if(textOnly) return statusArray.join(', ');
            return `<div style="display:flex; gap:4px; flex-wrap:wrap;">${renderStatusBadgesHTML(statusArray)}</div>`;
            
        case 'parentAsset':
            const parentAsset = getParentAsset(asset.id);
            if(textOnly) return parentAsset ? parentAsset.name : '';
            if(!parentAsset) {
                return '<div style="color:var(--text-sub);">-</div>';
            }
            return `<div style="color:var(--text); cursor:pointer;" onclick="event.stopPropagation(); openAssetModal('${parentAsset.id}');" title="クリックして親資産を表示">
                <i class="fa-solid fa-arrow-up" style="margin-right:4px; font-size:0.7rem; opacity:0.6;"></i>${parentAsset.name}
            </div>`;
            
        case 'specs':
            const specs = asset.specs || '';
            if(textOnly) return specs;
            const specsText = truncate(specs, 60);
            return `<div style="color:var(--text-sub); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${specs}">${specsText || '-'}</div>`;
            
        // 運用基準・手順
        case 'operations.procedure':
            const procedure = asset.operations?.procedure || '';
            if(textOnly) return procedure;
            const procText = truncate(procedure, 60);
            return `<div style="color:var(--text-sub); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${procedure}">${procText || '-'}</div>`;
            
        case 'operations.checkpoints':
            const checkpoints = asset.operations?.checkpoints || '';
            if(textOnly) return checkpoints;
            const checkText = truncate(checkpoints, 60);
            return `<div style="color:var(--text-sub); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${checkpoints}">${checkText || '-'}</div>`;
            
        // リスク管理・安全
        case 'risk.assessment':
            const assessment = asset.risk?.assessment || '';
            if(textOnly) return assessment;
            const assessText = truncate(assessment, 60);
            return `<div style="color:var(--text-sub); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${assessment}">${assessText || '-'}</div>`;
            
        case 'risk.measures':
            const measures = asset.risk?.measures || '';
            if(textOnly) return measures;
            const measText = truncate(measures, 60);
            return `<div style="color:var(--text-sub); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${measures}">${measText || '-'}</div>`;
            
        // 履歴
        case 'maintenance.count':
            const maintCount = asset.maintenance?.length || 0;
            if(textOnly) return maintCount.toString();
            return `<div style="color:var(--text-sub);">${maintCount}件</div>`;
            
        case 'maintenance.latest':
            if(!asset.maintenance || asset.maintenance.length === 0) {
                if(textOnly) return '';
                return '<div style="color:var(--text-sub);">-</div>';
            }
            const sortedMaint = [...asset.maintenance].sort((a, b) => new Date(b.date) - new Date(a.date));
            const lastDate = sortedMaint[0].date;
            if(textOnly) return lastDate;
            return `<div style="color:var(--text-sub);"><i class="fa-solid fa-wrench" style="margin-right:4px;"></i>${lastDate}</div>`;
            
        case 'maintenance.latestEvent':
            if(!asset.maintenance || asset.maintenance.length === 0) {
                if(textOnly) return '';
                return '<div style="color:var(--text-sub);">-</div>';
            }
            const sortedMaint2 = [...asset.maintenance].sort((a, b) => new Date(b.date) - new Date(a.date));
            const lastEvent = sortedMaint2[0].event;
            if(textOnly) return lastEvent;
            const lastEventText = truncate(lastEvent, 60);
            return `<div style="color:var(--text-sub);" title="${lastEvent}">${lastEventText}</div>`;
            
        // 周期計画
        case 'scheduledPlans.count':
            const schedCount = asset.scheduledPlans?.length || 0;
            if(textOnly) return schedCount.toString();
            return `<div style="color:var(--text-sub);">${schedCount}件</div>`;
            
        case 'scheduledPlans.next':
            if(!asset.scheduledPlans || asset.scheduledPlans.length === 0) {
                if(textOnly) return '';
                return '<div style="color:var(--text-sub);">-</div>';
            }
            const today = new Date();
            const futureSchedules = asset.scheduledPlans
                .filter(s => new Date(s.date) >= today)
                .sort((a, b) => new Date(a.date) - new Date(b.date));
            if(futureSchedules.length === 0) {
                if(textOnly) return '';
                return '<div style="color:var(--text-sub);">-</div>';
            }
            const nextDate = futureSchedules[0].date;
            if(textOnly) return nextDate;
            return `<div style="color:var(--primary);"><i class="fa-regular fa-calendar-check" style="margin-right:4px;"></i>${nextDate}</div>`;
            
        case 'scheduledPlans.nextEvent':
            if(!asset.scheduledPlans || asset.scheduledPlans.length === 0) {
                if(textOnly) return '';
                return '<div style="color:var(--text-sub);">-</div>';
            }
            const today2 = new Date();
            const futureSchedules2 = asset.scheduledPlans
                .filter(s => new Date(s.date) >= today2)
                .sort((a, b) => new Date(a.date) - new Date(b.date));
            if(futureSchedules2.length === 0) {
                if(textOnly) return '';
                return '<div style="color:var(--text-sub);">-</div>';
            }
            const nextEvent = futureSchedules2[0].event;
            if(textOnly) return nextEvent;
            const nextEventText = truncate(nextEvent, 60);
            return `<div style="color:var(--primary);" title="${nextEvent}">${nextEventText}</div>`;
            
        // 画像
        case 'images.count':
            const imgCount = asset.images?.length || 0;
            if(textOnly) return imgCount.toString();
            return `<div style="color:var(--text-sub);"><i class="fa-regular fa-image" style="margin-right:4px;"></i>${imgCount}枚</div>`;
            
        default:
            // マスタ別タグ: tags-{masterId}（動的マスタ対応）
            if(key.startsWith('tags-')) {
                const tagMasterId = key.substring(5);
                const masterTags = myTags.filter(t => t.masterId === tagMasterId);
                if(textOnly) return masterTags.map(t => t.name).join(', ');
                if(masterTags.length === 0) {
                    return '<div style="color:var(--text-sub);">-</div>';
                }
                const masterTagHtml = masterTags.slice(0, 3).map(t => 
                    `<span class="badge badge-gray" style="font-size:0.75rem;">${t.name}</span>`
                ).join('');
                const masterExtraTag = masterTags.length > 3 ? 
                    `<span class="badge badge-gray" style="font-size:0.75rem;">+${masterTags.length - 3}</span>` : '';
                return `<div style="display:flex; gap:4px; flex-wrap:wrap;">${masterTagHtml}${masterExtraTag}</div>`;
            }
            // カスタムフィールド: custom.{tagId}.{fieldKey}
            if(key.startsWith('custom.')) {
                const parts = key.split('.');
                if(parts.length === 3) {
                    const tagId = parseInt(parts[1]);
                    const fieldKey = parts[2];
                    return getCustomFieldValue(asset, tagId, fieldKey, textOnly);
                }
            }
            return '-';
    }
}

/**
 * カードビューでレンダリング
 */
function renderAssetsCard(list) {
    const container = document.getElementById('assetContainer');
    container.innerHTML = '';

    // 対象資産が0件の場合は空状態を表示
    if(list.length === 0) {
        renderAssetsEmptyState(container);
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'asset-grid';

    list.forEach(a => {
        const card = document.createElement('div');
        card.className = 'card';
        card.onclick = () => openAssetModal(a.id);
        const myTags = tags.filter(t => a.tags.includes(t.id));
        const statusBadges = renderStatusBadgesHTML(a.status);
        const iconClass = getAssetIconClass(a);
        const thumbnailUrl = getAssetThumbnailUrl(a);

        card.innerHTML = `
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
        `;
        grid.appendChild(card);
    });

    container.appendChild(grid);
}

/**
 * 資産が0件のときの空状態表示（リスト/カード共通）
 */
function renderAssetsEmptyState(container) {
    container.innerHTML = `
        <div style="padding:80px 20px; text-align:center; color:var(--text-sub);">
            <i class="fa-solid fa-box-open" style="font-size:3.5rem; margin-bottom:16px; display:block; opacity:0.25;"></i>
            <div style="font-size:1.05rem; font-weight:600; margin-bottom:6px;">表示できる資産がありません</div>
            <div style="font-size:0.88rem; opacity:0.8; margin-bottom:20px;">検索条件・フィルタを変更するか、新しい資産を登録してください</div>
            <button class="btn btn-primary" onclick="createNewAsset()">
                <i class="fa-solid fa-plus"></i> 新規資産を登録
            </button>
        </div>
    `;
}

function renderAssetsCalendar(assetList) {
    const container = document.getElementById('assetContainer');
    container.innerHTML = '';
    
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    // カレンダーイベントを収集
    const events = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    assetList.forEach(asset => {
        if(asset.scheduledPlans && asset.scheduledPlans.length > 0) {
            asset.scheduledPlans.forEach(plan => {
                const planDate = new Date(plan.date);
                planDate.setHours(0, 0, 0, 0);
                
                let eventType = 'upcoming-event';
                
                if(planDate < today) {
                    if(plan.cycle) {
                        const daysPassed = Math.floor((today - planDate) / (1000 * 60 * 60 * 24));
                        if(daysPassed > plan.cycle) {
                            eventType = 'overdue-event';
                        } else {
                            eventType = 'past-event';
                        }
                    } else {
                        eventType = 'past-event';
                    }
                }
                
                events.push({
                    date: plan.date,
                    asset: asset,
                    event: plan.event,
                    type: eventType,
                    cycle: plan.cycle
                });
            });
        }
    });
    
    // カレンダー構造を作成
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    
    const prevMonth = new Date(year, month, 0);
    const daysInPrevMonth = prevMonth.getDate();
    
    let calendarHTML = `
        <div class="calendar-wrapper">
            <div class="calendar-header-bar">
                <div class="calendar-nav-controls">
                    <button class="btn btn-ghost btn-sm" onclick="changeCalendarMonth(-1)">
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>
                    <div class="calendar-month-title">${year}年 ${month + 1}月</div>
                    <button class="btn btn-ghost btn-sm" onclick="changeCalendarMonth(1)">
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
                <button class="btn btn-outline btn-sm" onclick="currentCalendarDate = new Date(); renderAssets(window.currentAssetList || assets)">
                    <i class="fa-solid fa-calendar-day"></i> 今月
                </button>
            </div>
            <div class="calendar-grid">
                <div class="calendar-day-label">日</div>
                <div class="calendar-day-label">月</div>
                <div class="calendar-day-label">火</div>
                <div class="calendar-day-label">水</div>
                <div class="calendar-day-label">木</div>
                <div class="calendar-day-label">金</div>
                <div class="calendar-day-label">土</div>
    `;
    
    // 前月の日
    for(let i = startDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        calendarHTML += `
            <div class="calendar-day-cell other-month-day">
                <div class="day-num">${day}</div>
            </div>
        `;
    }
    
    // 当月の日
    for(let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEvents = events.filter(e => e.date === dateStr);
        
        const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
        
        calendarHTML += `
            <div class="calendar-day-cell ${isToday ? 'today-cell' : ''}">
                <div class="day-num">${day}</div>
                <div class="calendar-events-list">
                    ${dayEvents.slice(0, 3).map(e => `
                        <div class="calendar-event-item ${e.type}" onclick="openAssetModal('${e.asset.id}')" title="${e.asset.name}: ${e.event}">
                            ${e.asset.name}
                        </div>
                    `).join('')}
                    ${dayEvents.length > 3 ? `<div class="calendar-event-item" style="background: #e2e8f0; color: #64748b;">+${dayEvents.length - 3}件</div>` : ''}
                </div>
            </div>
        `;
    }
    
    // 次月の日
    const totalCells = startDay + daysInMonth;
    const remainingCells = 42 - totalCells;
    for(let day = 1; day <= remainingCells; day++) {
        calendarHTML += `
            <div class="calendar-day-cell other-month-day">
                <div class="day-num">${day}</div>
            </div>
        `;
    }
    
    calendarHTML += `
            </div>
        </div>
    `;
    
    container.innerHTML = calendarHTML;
}

function changeCalendarMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderAssets(window.currentAssetList || assets);
}

/* ============================================================
 * カラムソート
 * ============================================================ */

/**
 * ヘッダークリック時のソート状態遷移を管理し、再レンダリングする
 * 遷移: 昇順 → 降順 → なし → (次の列クリックで昇順)
 * @param {string} key - ソート対象のカラムキー
 */
function handleColumnSort(key) {
    if (listSortState.key === key) {
        if (listSortState.direction === 'asc') {
            listSortState.direction = 'desc';
        } else {
            // 降順の次 → ソート解除
            listSortState.key      = null;
            listSortState.direction = null;
        }
    } else {
        listSortState.key      = key;
        listSortState.direction = 'asc';
    }
    renderAssets(window.currentAssetList || assets);
}

/**
 * 資産リストをソートして新しい配列を返す
 * @param {Array}  list          ソート対象の配列
 * @param {string} sortKey       ソートカラムキー
 * @param {string} sortDirection 'asc' | 'desc'
 * @returns {Array} ソート済み配列
 */
function sortAssetList(list, sortKey, sortDirection) {
    if (!sortKey || !sortDirection) return list;

    return [...list].sort((a, b) => {
        let valA = getAssetFieldValue(a, sortKey, true) || '';
        let valB = getAssetFieldValue(b, sortKey, true) || '';

        // 空値は末尾へ
        if (!valA && valB)  return  1;
        if (valA && !valB)  return -1;
        if (!valA && !valB) return  0;

        // IDカラム: 数値部分で比較 (A1, A2, A10 → 1, 2, 10)
        if (sortKey === 'id') {
            const numA = parseInt(valA.replace(/\D/g, ''), 10);
            const numB = parseInt(valB.replace(/\D/g, ''), 10);
            if (!isNaN(numA) && !isNaN(numB)) {
                return sortDirection === 'asc' ? numA - numB : numB - numA;
            }
        }

        // 数値カラム: 両方が正規の数値文字列なら数値比較
        const numA = parseFloat(valA);
        const numB = parseFloat(valB);
        if (!isNaN(numA) && !isNaN(numB) && String(numA) === valA.trim() && String(numB) === valB.trim()) {
            return sortDirection === 'asc' ? numA - numB : numB - numA;
        }

        // それ以外: 日付(YYYY-MM-DD)も文字列ソートで正しくなるため、全て localeCompare で統一
        const cmp = valA.toString().localeCompare(valB.toString(), 'ja');
        return sortDirection === 'asc' ? cmp : -cmp;
    });
}



