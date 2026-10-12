
/**
 * assets.js
 * 資産表示機能（リスト / カード / カレンダービュー）
 */

/**
 * 表示形式を切り替える
 * @param {'list'|'card'|'calendar'} mode
 * @param {{skipRender?: boolean}} [options]
 */
function switchAssetView(mode, options = {}) {
    assetViewMode = mode;
    const btnList     = document.getElementById('btnViewList');
    const btnCard     = document.getElementById('btnViewCard');
    const btnCalendar = document.getElementById('btnViewCalendar');
    const btnListSettings = document.getElementById('btnListSettings');

    [btnList, btnCard, btnCalendar].forEach(btn => { if(btn) setToggleInactive(btn); });
    const activeBtn = { list: btnList, card: btnCard, calendar: btnCalendar }[mode];
    if(activeBtn) setToggleActive(activeBtn);

    // 列設定はリスト表示のときだけ意味を持つ
    if(btnListSettings) btnListSettings.style.display = (mode === 'list' && currentPage === 'assets') ? 'inline-flex' : 'none';

    if(!options.skipRender) applyFilters();
}

/**
 * 現在画面に並んでいる順序どおりの資産リストを返す
 * （モーダルの「前へ / 次へ」と ↑↓ の行移動が、見えている順番と一致するようにする）
 */
function getDisplayedAssets() {
    const list = getFilteredAssets();
    return (listSortState.key && listSortState.direction)
        ? sortAssetList(list, listSortState.key, listSortState.direction)
        : list;
}

/**
 * 資産データをレンダリング（ビューモードに応じて切り替え）
 */
function renderAssets(list) {
    if(assetViewMode === 'list') {
        renderAssetsList(list);
    } else if(assetViewMode === 'card') {
        renderAssetsCard(list);
    } else if(assetViewMode === 'calendar') {
        renderAssetsCalendar(list);
    }
}

/* ============================================================
   リストビュー
   ============================================================ */

function renderAssetsList(list) {
    const container = document.getElementById('assetContainer');
    container.innerHTML = '';

    const visibleColumns = listDisplaySettings.columns
        .filter(col => col.visible)
        .sort((a, b) => a.order - b.order);

    if(visibleColumns.length === 0) {
        container.innerHTML = `
            <div class="panel empty-state">
                <i class="fa-solid fa-eye-slash empty-state-icon"></i>
                <div class="empty-state-title">表示する列が1つも選ばれていません</div>
                <div class="empty-state-desc">リストに出したい項目を選んでください</div>
                <button class="btn btn-primary" onclick="openListSettingsModal()">
                    <i class="fa-solid fa-table-columns"></i> 列を設定する
                </button>
            </div>`;
        return;
    }

    if(list.length === 0) {
        renderAssetsEmptyState(container);
        return;
    }

    const columnWidths = calculateColumnWidths(visibleColumns, list);

    // 一覧は内側でスクロールさせず、画面全体のスクロールに任せる
    // （見出し行は sticky で上端に残る）。件数が多くても下が空白にならない。
    const listWrapper = document.createElement('div');
    listWrapper.className = 'list-table-wrap';

    const table = document.createElement('table');
    table.className = 'list-table';

    // ヘッダー（固定 + ソート）
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    visibleColumns.forEach((col, index) => {
        const th = document.createElement('th');
        const isSorted = listSortState.key === col.key;
        th.style.width = columnWidths[index];
        th.style.textAlign = col.headerAlign || 'left';
        if(isSorted) th.classList.add('is-sorted');
        th.title = `クリックで「${col.label}」で並べ替え`;
        th.addEventListener('click', () => handleColumnSort(col.key));

        // 並べ替え可能であることを、ホバー時の淡いアイコンで伝える
        const mark = isSorted
            ? `<i class="fa-solid fa-arrow-${listSortState.direction === 'asc' ? 'up' : 'down'} sort-mark"></i>`
            : `<i class="fa-solid fa-arrow-down-short-wide sort-mark sort-mark-idle"></i>`;
        th.innerHTML = `<span style="display:inline-flex; align-items:center;">${escapeHTML(col.label)}${mark}</span>`;

        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // ソート適用
    let displayList = list;
    if(listSortState.key && listSortState.direction) {
        displayList = sortAssetList(list, listSortState.key, listSortState.direction);
    }

    const tbody = document.createElement('tbody');
    displayList.forEach(asset => {
        const row = document.createElement('tr');
        row.dataset.assetId = asset.id;
        row.onclick = () => openAssetModal(asset.id);
        row.onmouseenter = () => setListCursor(asset.id, { scroll: false });

        visibleColumns.forEach((col, i) => {
            const td = document.createElement('td');
            td.style.textAlign = col.align || 'left';

            td.innerHTML = getAssetFieldValue(asset, col.key);
            td.dataset.col = col.key;
            // 狭い画面のカード行では、空の項目を出さない
            if(col.key !== 'name' && !getAssetFieldValue(asset, col.key, true)) td.classList.add('is-empty');

            // 最終列にだけホバー時のクイック操作を重ねる（開かずに1手で終わらせる導線）
            if(i === visibleColumns.length - 1) {
                const actions = document.createElement('span');
                actions.className = 'row-actions';
                actions.innerHTML = `
                    <button class="row-action-btn" data-quick="history" title="履歴を追加"><i class="fa-solid fa-clock-rotate-left"></i></button>
                    <button class="row-action-btn" data-quick="images" title="画像を追加"><i class="fa-solid fa-image"></i></button>`;
                actions.querySelectorAll('[data-quick]').forEach(btn => {
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        openAssetModal(asset.id, btn.dataset.quick === 'history' ? 'tabMaint' : 'tabImages');
                    };
                });
                td.appendChild(actions);
            }

            row.appendChild(td);
        });

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    listWrapper.appendChild(table);
    container.appendChild(listWrapper);

    // 直前に選んでいた行があれば選択位置を復元する
    applyListCursorClass();
}

/* ============================================================
   一覧のキーボード操作（↑↓で行を移動し Enter で開く）
   ============================================================ */

/** 現在カーソルが当たっている行の資産ID */
let listCursorId = null;

function setListCursor(assetId, options = {}) {
    listCursorId = assetId;
    applyListCursorClass(options.scroll !== false);
}

function applyListCursorClass(scroll = false) {
    let found = false;
    document.querySelectorAll('#assetContainer .list-table tbody tr').forEach(tr => {
        const isCursor = tr.dataset.assetId === listCursorId;
        tr.classList.toggle('is-cursor', isCursor);
        if(isCursor) {
            found = true;
            if(scroll) tr.scrollIntoView({ block: 'nearest' });
        }
    });
    if(!found) listCursorId = null;
}

/**
 * カーソルを上下に動かす
 * @param {number} delta
 */
function moveListCursor(delta) {
    const rows = Array.from(document.querySelectorAll('#assetContainer .list-table tbody tr'));
    if(rows.length === 0) return;

    const current = rows.findIndex(tr => tr.dataset.assetId === listCursorId);
    const next = current < 0
        ? (delta > 0 ? 0 : rows.length - 1)
        : Math.min(rows.length - 1, Math.max(0, current + delta));

    setListCursor(rows[next].dataset.assetId);
}

/** カーソル位置の資産を開く */
function openListCursor() {
    if(listCursorId) openAssetModal(listCursorId);
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

    visibleColumns.forEach((col) => {
        if(col.width === 'auto') {
            let maxLength = col.label.length;
            assetList.forEach(asset => {
                const value = getAssetFieldValue(asset, col.key, true);
                if(value) maxLength = Math.max(maxLength, value.toString().length);
            });
            autoWidths.push(Math.min(Math.max(maxLength * 10, 90), 460));
        } else if(col.width === 'equal') {
            equalCount++; autoWidths.push(null);
        } else if(col.width === 'flex') {
            flexCount++; autoWidths.push(null);
        } else if(typeof col.width === 'string' && col.width.endsWith('px')) {
            fixedTotal += parseInt(col.width);
            autoWidths.push(null);
        } else {
            autoWidths.push(null);
        }
    });

    const autoTotal = autoWidths.filter(w => w !== null).reduce((sum, w) => sum + w, 0);

    visibleColumns.forEach((col, index) => {
        if(col.width === 'auto') {
            widths.push(`${autoWidths[index]}px`);
        } else if(col.width === 'equal' || col.width === 'flex') {
            widths.push(`calc((100% - ${fixedTotal + autoTotal}px) / ${equalCount + flexCount})`);
        } else if(typeof col.width === 'string' && col.width.endsWith('px')) {
            widths.push(col.width);
        } else {
            widths.push('auto');
        }
    });

    return widths;
}

/**
 * 資産のフィールド値を取得
 * @param {object} asset
 * @param {string} key
 * @param {boolean} [textOnly] - true ならソート・幅計算用のプレーンテキストを返す
 */
function getAssetFieldValue(asset, key, textOnly = false) {
    const myTags = tags.filter(t => asset.tags.includes(t.id));
    const statusArray = Array.isArray(asset.status) ? asset.status : [asset.status];

    const truncate = (text, maxLength = 50) => {
        if(!text) return '';
        return text.length <= maxLength ? text : text.substring(0, maxLength) + '…';
    };
    /** 長文セル：省略表示 + ツールチップで全文（推測させない） */
    const longText = (text, len = 60) => {
        if(!text) return '<span class="cell-sub">—</span>';
        return `<span class="cell-sub" title="${escapeHTML(text)}">${escapeHTML(truncate(text, len))}</span>`;
    };
    const tagCell = (list) => {
        if(list.length === 0) return '<span class="cell-sub">—</span>';
        const shown = list.slice(0, 3).map(t => `<span class="badge badge-gray">${escapeHTML(t.name)}</span>`).join('');
        const extra = list.length > 3
            ? `<span class="badge badge-gray" title="${escapeHTML(list.slice(3).map(t => t.name).join('、'))}">+${list.length - 3}</span>`
            : '';
        return `<span class="cell-stack">${shown}${extra}</span>`;
    };

    switch(key) {
        case 'name':
            if(textOnly) return asset.name;
            // 行頭の色ドットで状態を示す（ステータス列まで視線を動かさずに異常に気づける）
            return `<span class="cell-name-wrap">
                <span class="status-dot" style="background:${getAssetStatusColor(asset)};" title="${escapeHTML(statusArray.filter(Boolean).join('・') || '未設定')}"></span>
                <span class="cell-name">${escapeHTML(asset.name)}</span>
            </span>`;

        case 'id':
            if(textOnly) return asset.id.toUpperCase();
            return `<span class="cell-mono">${escapeHTML(asset.id.toUpperCase())}</span>`;

        case 'date':
            if(textOnly) return asset.date || '';
            if(!asset.date) return '<span class="cell-sub">—</span>';
            return `<span class="cell-sub">${escapeHTML(asset.date)}</span>`;

        case 'tags':
            if(textOnly) return myTags.map(t => t.name).join(', ');
            return tagCell(myTags);

        case 'status':
            if(textOnly) return statusArray.filter(Boolean).join(', ');
            if(statusArray.filter(Boolean).length === 0) return '<span class="badge badge-gray">未設定</span>';
            return `<span class="cell-stack">${renderStatusBadgesHTML(statusArray)}</span>`;

        case 'parentAsset': {
            const parentAsset = getParentAsset(asset.id);
            if(textOnly) return parentAsset ? parentAsset.name : '';
            if(!parentAsset) return '<span class="cell-sub">—</span>';
            return `<span class="cell-sub" style="cursor:pointer;" onclick="event.stopPropagation(); openAssetModal('${parentAsset.id}');" title="クリックして親資産を開く">
                <i class="fa-solid fa-arrow-turn-up" style="font-size:0.7rem; opacity:0.6;"></i> ${escapeHTML(parentAsset.name)}
            </span>`;
        }

        case 'specs':
            if(textOnly) return asset.specs || '';
            return longText(asset.specs);

        case 'operations.procedure':
            if(textOnly) return asset.operations?.procedure || '';
            return longText(asset.operations?.procedure);

        case 'operations.checkpoints':
            if(textOnly) return asset.operations?.checkpoints || '';
            return longText(asset.operations?.checkpoints);

        case 'risk.assessment':
            if(textOnly) return asset.risk?.assessment || '';
            return longText(asset.risk?.assessment);

        case 'risk.measures':
            if(textOnly) return asset.risk?.measures || '';
            return longText(asset.risk?.measures);

        case 'maintenance.count': {
            const c = asset.maintenance?.length || 0;
            if(textOnly) return String(c);
            return c === 0 ? '<span class="cell-sub">—</span>' : `<span class="cell-sub">${c}件</span>`;
        }

        case 'maintenance.latest': {
            const rec = getLatestMaintenance(asset);
            if(textOnly) return rec ? rec.date : '';
            if(!rec) return '<span class="cell-sub">—</span>';
            return `<span class="cell-sub" title="${escapeHTML(rec.event || '')}">${escapeHTML(rec.date)}</span>`;
        }

        case 'maintenance.latestEvent': {
            const rec = getLatestMaintenance(asset);
            if(textOnly) return rec ? rec.event : '';
            return longText(rec ? rec.event : '');
        }

        case 'scheduledPlans.count': {
            const c = asset.scheduledPlans?.length || 0;
            if(textOnly) return String(c);
            return c === 0 ? '<span class="cell-sub">—</span>' : `<span class="cell-sub">${c}件</span>`;
        }

        case 'scheduledPlans.next': {
            const next = getNextSchedule(asset);
            if(textOnly) return next ? next.date : '';
            if(!next) return '<span class="cell-sub">—</span>';
            // 期限の近さを色で、内容を淡い文字で（日付そのものはツールチップ）
            return `<span class="cell-due" title="${escapeHTML(next.date)} ${escapeHTML(next.event || '')}">
                ${renderDuePill(daysUntil(next.date))}<span class="cell-sub">${escapeHTML(next.event || '')}</span>
            </span>`;
        }

        case 'scheduledPlans.nextEvent': {
            const next = getNextSchedule(asset);
            if(textOnly) return next ? next.event : '';
            return longText(next ? next.event : '');
        }

        case 'images.count': {
            const c = asset.images?.length || 0;
            if(textOnly) return String(c);
            return c === 0 ? '<span class="cell-sub">—</span>' : `<span class="cell-sub"><i class="fa-regular fa-image"></i> ${c}</span>`;
        }

        default:
            // マスタ別タグ: tags-{masterId}
            if(key.startsWith('tags-')) {
                const tagMasterId = key.substring(5);
                const masterTags = myTags.filter(t => t.masterId === tagMasterId);
                if(textOnly) return masterTags.map(t => t.name).join(', ');
                return tagCell(masterTags);
            }
            // カスタムフィールド: custom.{tagId}.{fieldKey}
            if(key.startsWith('custom.')) {
                const parts = key.split('.');
                if(parts.length === 3) {
                    return getCustomFieldValue(asset, parseInt(parts[1]), parts[2], textOnly);
                }
            }
            return textOnly ? '' : '<span class="cell-sub">—</span>';
    }
}

/* ============================================================
   カードビュー
   ============================================================ */

function renderAssetsCard(list) {
    const container = document.getElementById('assetContainer');
    container.innerHTML = '';

    if(list.length === 0) {
        renderAssetsEmptyState(container);
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'asset-grid';

    list.forEach(a => {
        const card = document.createElement('div');
        card.className = 'card';
        card.tabIndex = 0;
        card.onclick = () => openAssetModal(a.id);
        card.onkeydown = (e) => { if(e.key === 'Enter') openAssetModal(a.id); };

        const myTags = tags.filter(t => a.tags.includes(t.id));
        const statusBadges = (a.status && a.status.length)
            ? renderStatusBadgesHTML(a.status)
            : '<span class="badge badge-gray">未設定</span>';
        const thumbnailUrl = getAssetThumbnailUrl(a);
        const next = getNextSchedule(a);

        card.innerHTML = `
            <div class="card-image">
                ${thumbnailUrl
                    ? `<img src="${escapeHTML(thumbnailUrl)}" alt="${escapeHTML(a.name)}" loading="lazy">`
                    : `<i class="${getAssetIconClass(a)}"></i>`}
                <div class="card-img-tag">${escapeHTML(a.id.toUpperCase())}</div>
            </div>
            <div class="card-body">
                <div class="card-header-row">
                    <h3 class="card-title">${escapeHTML(a.name)}</h3>
                </div>
                <div style="display:flex; gap:4px; flex-wrap:wrap;">${statusBadges}</div>
                <div class="card-meta">
                    <span><i class="fa-regular fa-calendar"></i> ${escapeHTML(a.date || '—')}</span>
                    ${next ? `<span title="次回予定: ${escapeHTML(next.event || '')}" style="color:${daysUntil(next.date) < 0 ? 'var(--danger)' : 'inherit'};">
                        <i class="fa-regular fa-clock"></i> ${escapeHTML(formatDayDelta(daysUntil(next.date)))}
                    </span>` : ''}
                </div>
                <div class="tag-row">
                    ${myTags.slice(0, 3).map(t => `<span class="badge badge-gray">${escapeHTML(t.name)}</span>`).join('')}
                    ${myTags.length > 3 ? `<span class="badge badge-gray">+${myTags.length - 3}</span>` : ''}
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    container.appendChild(grid);
}

/**
 * 資産が0件のときの表示
 * 「なぜ0件なのか」と「次に何をすればよいか」を必ず示す。
 */
function renderAssetsEmptyState(container) {
    const isFiltered = hasActiveFilters() || (searchQuery || '').trim() !== '';

    if(isFiltered) {
        const reason = [
            ...describeActiveFilters().map(d => `${d.kind}「${d.label}」`),
            (searchQuery || '').trim() ? `検索語「${searchQuery.trim()}」` : null
        ].filter(Boolean).join(' と ');

        container.innerHTML = `
            <div class="panel empty-state">
                <i class="fa-solid fa-filter-circle-xmark empty-state-icon"></i>
                <div class="empty-state-title">条件に合う資産がありません</div>
                <div class="empty-state-desc">${escapeHTML(reason)} に一致する資産は登録されていません</div>
                <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
                    <button class="btn btn-primary" onclick="clearAllFilters()">
                        <i class="fa-solid fa-rotate-left"></i> 条件を解除して全件表示
                    </button>
                    <button class="btn btn-outline" onclick="createNewAsset()">
                        <i class="fa-solid fa-plus"></i> この条件で新規登録
                    </button>
                </div>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="panel empty-state">
            <i class="fa-solid fa-box-open empty-state-icon"></i>
            <div class="empty-state-title">まだ資産が登録されていません</div>
            <div class="empty-state-desc">最初の1件を登録するか、バックアップのJSONを読み込んでください</div>
            <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="createNewAsset()">
                    <i class="fa-solid fa-plus"></i> 新規資産を登録
                </button>
                <button class="btn btn-outline" onclick="document.getElementById('importFile').click()">
                    <i class="fa-solid fa-file-arrow-up"></i> JSONから読み込む
                </button>
            </div>
        </div>`;
}

/* ============================================================
   カレンダービュー
   ============================================================ */

function renderAssetsCalendar(assetList) {
    const container = document.getElementById('assetContainer');
    container.innerHTML = '';

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 予定イベントを収集
    const events = [];
    assetList.forEach(asset => {
        (asset.scheduledPlans || []).forEach(plan => {
            const planDate = new Date(plan.date);
            planDate.setHours(0, 0, 0, 0);

            let eventType = 'upcoming-event';
            if(planDate < today) {
                if(plan.cycle) {
                    const daysPassed = Math.floor((today - planDate) / 86400000);
                    eventType = daysPassed > plan.cycle ? 'overdue-event' : 'past-event';
                } else {
                    eventType = 'past-event';
                }
            }
            events.push({ date: plan.date, asset, event: plan.event, type: eventType, cycle: plan.cycle });
        });
    });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];

    let html = `
        <div class="calendar-wrapper">
            <div class="calendar-header-bar">
                <div class="calendar-nav-controls">
                    <button class="btn btn-ghost btn-icon-only btn-sm" onclick="changeCalendarMonth(-1)" title="前の月" aria-label="前の月">
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>
                    <div class="calendar-month-title">${year}年 ${month + 1}月</div>
                    <button class="btn btn-ghost btn-icon-only btn-sm" onclick="changeCalendarMonth(1)" title="次の月" aria-label="次の月">
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="goToCurrentMonth()">今月</button>
                </div>
                <div class="calendar-legend">
                    <span><i style="background:var(--red-200);"></i> 期限超過</span>
                    <span><i style="background:var(--blue-200);"></i> 今後の予定</span>
                    <span><i style="background:var(--slate-200);"></i> 実施済みの予定日</span>
                </div>
            </div>
            <div class="calendar-grid">
                ${dayLabels.map((d, i) => `<div class="calendar-day-label ${i === 0 ? 'is-sun' : i === 6 ? 'is-sat' : ''}">${d}</div>`).join('')}
    `;

    // 前月
    for(let i = startDay - 1; i >= 0; i--) {
        html += `<div class="calendar-day-cell other-month-day"><div class="day-num">${daysInPrevMonth - i}</div></div>`;
    }

    // 当月
    for(let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEvents = events.filter(e => e.date === dateStr);
        const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

        html += `
            <div class="calendar-day-cell ${isToday ? 'today-cell' : ''}">
                <div class="day-num">${day}</div>
                <div class="calendar-events-list">
                    ${dayEvents.slice(0, 3).map(e => `
                        <div class="calendar-event-item ${e.type}" onclick="openAssetModal('${e.asset.id}')"
                             title="${escapeHTML(e.asset.name)}：${escapeHTML(e.event || '')}">
                            ${escapeHTML(e.asset.name)}
                        </div>`).join('')}
                    ${dayEvents.length > 3
                        ? `<div class="calendar-event-item" style="background:var(--surface-muted); color:var(--text-sub);">+${dayEvents.length - 3}件</div>`
                        : ''}
                </div>
            </div>`;
    }

    // 次月
    const remainingCells = 42 - (startDay + daysInMonth);
    for(let day = 1; day <= remainingCells; day++) {
        html += `<div class="calendar-day-cell other-month-day"><div class="day-num">${day}</div></div>`;
    }

    html += `</div></div>`;
    container.innerHTML = html;
}

function changeCalendarMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    applyFilters();
}

function goToCurrentMonth() {
    currentCalendarDate = new Date();
    applyFilters();
}

/* ============================================================
   カラムソート
   ============================================================ */

/**
 * ヘッダークリック時のソート状態遷移を管理し、再レンダリングする
 * 遷移: 昇順 → 降順 → なし → (次の列クリックで昇順)
 */
function handleColumnSort(key) {
    if(listSortState.key === key) {
        if(listSortState.direction === 'asc') {
            listSortState.direction = 'desc';
        } else {
            listSortState.key = null;
            listSortState.direction = null;
        }
    } else {
        listSortState.key = key;
        listSortState.direction = 'asc';
    }
    applyFilters();
}

/**
 * 資産リストをソートして新しい配列を返す
 */
function sortAssetList(list, sortKey, sortDirection) {
    if(!sortKey || !sortDirection) return list;

    return [...list].sort((a, b) => {
        let valA = getAssetFieldValue(a, sortKey, true) || '';
        let valB = getAssetFieldValue(b, sortKey, true) || '';

        // 空値は常に末尾へ（並べ替えの向きに関わらず）
        if(!valA && valB)  return  1;
        if(valA && !valB)  return -1;
        if(!valA && !valB) return  0;

        // IDカラム: 数値部分で比較 (A1, A2, A10 → 1, 2, 10)
        if(sortKey === 'id') {
            const numA = parseInt(valA.replace(/\D/g, ''), 10);
            const numB = parseInt(valB.replace(/\D/g, ''), 10);
            if(!isNaN(numA) && !isNaN(numB)) {
                return sortDirection === 'asc' ? numA - numB : numB - numA;
            }
        }

        // 数値カラム: 両方が正規の数値文字列なら数値比較
        const numA = parseFloat(valA);
        const numB = parseFloat(valB);
        if(!isNaN(numA) && !isNaN(numB) && String(numA) === valA.trim() && String(numB) === valB.trim()) {
            return sortDirection === 'asc' ? numA - numB : numB - numA;
        }

        // それ以外: 日付(YYYY-MM-DD)も文字列ソートで正しくなるため localeCompare で統一
        const cmp = valA.toString().localeCompare(valB.toString(), 'ja');
        return sortDirection === 'asc' ? cmp : -cmp;
    });
}
