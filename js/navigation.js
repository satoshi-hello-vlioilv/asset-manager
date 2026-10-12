
/**
 * navigation.js
 * 上部ナビゲーション・フィルタバー・ページ遷移
 *
 * 設計:
 *   以前は左サイドバーにナビゲーションとタグの絞り込みツリーを常時展開していたが、
 *   250px を常に占有し、一覧の表示領域を圧迫していた。
 *   v3 では次の2層に分けている。
 *
 *     ヘッダー     = 「どこを見るか・何をするか」（ページ切替タブ + 主要操作）
 *     フィルタバー = 「今どういう状態か」（稼働状況 + マスタごとの条件 + 件数）
 *
 *   タグ階層はマスタごとのドロップダウンに畳み、開いたときだけツリーで見せる。
 *   件数は「他の条件を適用したうえで、そのタグを選ぶと何件になるか」を表示するため、
 *   空振りする条件を選ばずに済む。
 */

/**
 * タグごとの資産件数を数える（子孫タグを含む）
 * @param {object[]} pool - 数える対象の資産
 * @returns {Map<number, number>}
 */
function countAssetsByTag(pool) {
    const byTag = new Map();
    tags.forEach(tag => {
        const ids = getAllDescendantIds(tag.id);
        byTag.set(tag.id, pool.filter(a => a.tags.some(t => ids.includes(t))).length);
    });
    return byTag;
}

/**
 * よく使う絞り込みタグを推定する
 *
 * 「絞り込みに使った実績」と「実際に付与されている件数」の両方を見る。
 * 使い始めの実績が無い段階でも、資産が多く紐づくタグが自然に上位に来るため、
 * 最初から近道として機能する。
 * @param {number} limit
 * @param {string} [masterId] - 指定したマスタのタグに限る
 */
function getQuickAccessTags(limit = 6, masterId) {
    const counts = getTagAttachCounts();
    return tags
        .filter(t => !masterId || t.masterId === masterId)
        .map(t => ({ tag: t, score: usageScore('tags', t.id) * 3 + (counts.get(t.id) || 0) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(x => x.tag);
}

/**
 * ナビゲーションとフィルタバーをまとめて最新化する
 * （タグや資産が変わったあとに各所から呼ばれる。旧サイドバー時代の名前を維持）
 */
function renderSidebar() {
    renderTopNav();
    if(currentPage === 'assets') renderFilterBar(getFilteredAssets().length);
}

/* ============================================================
   上部ナビゲーション
   ============================================================ */

function renderTopNav() {
    const dash = document.getElementById('navDashboard');
    const list = document.getElementById('navAssets');
    if(dash) dash.classList.toggle('active', currentPage === 'dashboard');
    if(list) list.classList.toggle('active', currentPage === 'assets');
    const count = document.getElementById('navAssetCount');
    if(count) count.textContent = getPersistedAssets().length;
}

/**
 * ヘッダーに表示する操作を、ページに応じて切り替える
 * （その場面で使えない操作は出さない＝選択肢を減らして迷いを減らす）
 */
function setHeaderMode(mode) {
    const isAssets = mode === 'assets';
    document.body.dataset.page = mode;
    const show = (id, display) => {
        const el = document.getElementById(id);
        if(el) el.style.display = display;
    };
    show('searchContainer', isAssets ? 'block' : 'none');
    show('viewToggle',      isAssets ? 'inline-flex' : 'none');
    show('btnListSettings', isAssets && assetViewMode === 'list' ? 'inline-flex' : 'none');
    document.getElementById('filterBar').classList.toggle('show', isAssets);
}

/* ============================================================
   フィルタバー
   ============================================================ */

/**
 * 稼働状況の選択肢（件数つき）
 * 件数はタグ条件と検索語を反映し、稼働状況だけ外して数える。
 */
function getStatusFilterOptions() {
    const pool = getFilteredAssets({ ignoreStatus: true });
    const opts = [{ value: '__all__', label: 'すべて', color: 'var(--n-400)', count: pool.length }];
    STATUS_DEFS.forEach(def => {
        opts.push({ value: def.value, label: def.value, color: def.nodeColor,
                    count: pool.filter(a => matchesStatus(a, def.value)).length });
    });
    const none = pool.filter(a => matchesStatus(a, '__none__')).length;
    if(none > 0) opts.push({ value: '__none__', label: '未設定', color: 'var(--n-300)', count: none });
    return opts;
}

function renderFilterBar(visibleCount) {
    const bar = document.getElementById('filterBar');
    if(!bar) return;
    if(currentPage !== 'assets') { bar.classList.remove('show'); return; }
    bar.classList.add('show');

    /* --- 稼働状況（色つきセグメント） --- */
    const current = filterState.status || '__all__';
    document.getElementById('filterStatus').innerHTML = getStatusFilterOptions().map(o => `
        <button class="status-seg-item ${current === o.value ? 'active' : ''}"
                onclick="filterByStatus('${escapeHTML(o.value)}', { keepTags: true })"
                title="${o.value === '__all__' ? '稼働状況で絞り込まない' : `「${escapeHTML(o.label)}」だけを表示`}"
                ${o.count === 0 && current !== o.value ? 'data-empty="true"' : ''}>
            <i class="status-seg-dot" style="background:${o.color};"></i>${escapeHTML(o.label)}<span class="status-seg-count">${o.count}</span>
        </button>`).join('');

    /* --- マスタごとの条件 --- */
    document.getElementById('filterMasters').innerHTML = masters.map(m => {
        const tagId = filterState.tags[m.id];
        const tag = tagId !== undefined ? tags.find(t => t.id === tagId) : null;
        if(tag) {
            return `
                <span class="filter-btn is-active" data-master-id="${escapeHTML(m.id)}">
                    <button class="filter-btn-main" onclick="openFilterPopover('${escapeHTML(m.id)}', this.parentElement)"
                            title="${escapeHTML(m.name)} の条件を変更">
                        <span class="filter-btn-kind">${escapeHTML(m.name)}</span>${escapeHTML(tag.name)}
                    </button>
                    <button class="filter-btn-clear" onclick="clearMasterFilter('${escapeHTML(m.id)}')"
                            title="この条件を外す" aria-label="${escapeHTML(m.name)} の条件を外す">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </span>`;
        }
        return `
            <span class="filter-btn" data-master-id="${escapeHTML(m.id)}">
                <button class="filter-btn-main" onclick="openFilterPopover('${escapeHTML(m.id)}', this.parentElement)"
                        title="${escapeHTML(m.name)} で絞り込む">
                    ${escapeHTML(m.name)}<i class="fa-solid fa-chevron-down filter-btn-caret"></i>
                </button>
            </span>`;
    }).join('');

    /* --- 件数と検索語 --- */
    const total = getPersistedAssets().length;
    const hasQuery = searchQuery.trim() !== '';
    const isFiltered = hasActiveFilters() || hasQuery;
    document.getElementById('filterCount').innerHTML = isFiltered
        ? `<strong>${visibleCount}</strong> 件 <span class="filter-count-total">/ 全${total}件</span>`
        : `<strong>${total}</strong> 件`;

    document.getElementById('filterQueryChip').innerHTML = hasQuery ? `
        <span class="chip">
            <span class="chip-kind">検索</span>
            <span class="chip-label">${escapeHTML(searchQuery.trim())}</span>
            <button class="chip-remove" onclick="clearSearchInput()" title="検索を解除" aria-label="検索を解除">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </span>` : '';

    const conditions = (filterState.status ? 1 : 0) + Object.keys(filterState.tags).length + (hasQuery ? 1 : 0);
    document.getElementById('filterClear').style.display = conditions > 1 ? 'inline-flex' : 'none';
}

/* ============================================================
   マスタ別の絞り込みポップオーバー（タグ階層ツリー）
   ============================================================ */

let filterPopoverMasterId = null;
/* ポップオーバー内で展開しているタグ（開閉状態を描き直しても保つ） */
const filterPopoverOpen = new Set();

function closeFilterPopover() {
    const pop = document.getElementById('filterPopover');
    if(pop) pop.classList.remove('open');
    document.querySelectorAll('.filter-btn.is-open').forEach(b => b.classList.remove('is-open'));
    filterPopoverMasterId = null;
}

function isFilterPopoverOpen() {
    return !!filterPopoverMasterId;
}

/**
 * マスタの絞り込みポップオーバーを開く
 * @param {string} masterId
 * @param {HTMLElement} anchor - 位置合わせの基準にするボタン
 */
function openFilterPopover(masterId, anchor) {
    if(filterPopoverMasterId === masterId) { closeFilterPopover(); return; }
    closeMenus();
    closeFilterPopover();
    filterPopoverMasterId = masterId;
    anchor.classList.add('is-open');

    // 選択中のタグまでの枝を開いておく（今どこにいるかが見える）
    const activeId = filterState.tags[masterId];
    if(activeId !== undefined) {
        let cur = tags.find(t => t.id === activeId);
        let guard = 0;
        while(cur && cur.parentIds.length > 0 && guard++ < 10) {
            filterPopoverOpen.add(cur.parentIds[0]);
            cur = tags.find(t => t.id === cur.parentIds[0]);
        }
    }

    const pop = document.getElementById('filterPopover');
    const master = masters.find(m => m.id === masterId);
    pop.innerHTML = `
        <div class="filter-pop-head">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" class="filter-pop-search" id="filterPopSearch"
                   placeholder="${escapeHTML(master ? master.name : '')}を検索…" autocomplete="off"
                   oninput="renderFilterPopoverBody()">
        </div>
        <div class="filter-pop-body" id="filterPopBody"></div>
        ${activeId !== undefined ? `
            <div class="filter-pop-foot">
                <button class="btn btn-ghost btn-sm" onclick="clearMasterFilter('${escapeHTML(masterId)}')">
                    <i class="fa-solid fa-xmark"></i> この条件を外す
                </button>
            </div>` : ''}`;
    pop.classList.add('open');
    renderFilterPopoverBody();
    positionFilterPopover(anchor);

    const input = document.getElementById('filterPopSearch');
    if(input && window.innerWidth > 640) input.focus();
}

function positionFilterPopover(anchor) {
    const pop = document.getElementById('filterPopover');
    const r = anchor.getBoundingClientRect();
    if(window.innerWidth <= 640) {
        pop.style.left = '8px';
        pop.style.right = '8px';
        pop.style.top = `${r.bottom + 6}px`;
        return;
    }
    pop.style.right = 'auto';
    const width = pop.offsetWidth || 300;
    pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - width - 8))}px`;
    pop.style.top = `${r.bottom + 6}px`;
}

function renderFilterPopoverBody() {
    const body = document.getElementById('filterPopBody');
    const masterId = filterPopoverMasterId;
    if(!body || !masterId) return;

    // 件数は「このマスタの条件を外し、他の条件は適用した状態」で数える
    const pool = getFilteredAssets({ ignoreMaster: masterId });
    const counts = countAssetsByTag(pool);
    const activeId = filterState.tags[masterId];
    const masterTags = tags.filter(t => t.masterId === masterId);
    const needle = (document.getElementById('filterPopSearch')?.value || '').trim().toLowerCase();

    const row = (tag, depth, opts = {}) => {
        const hasChild = !opts.flat && masterTags.some(t => t.parentIds.includes(tag.id));
        const isOpen = filterPopoverOpen.has(tag.id);
        const count = counts.get(tag.id) || 0;
        return `
            <div class="filter-tree-row ${tag.id === activeId ? 'active' : ''} ${count === 0 ? 'is-empty' : ''}"
                 style="padding-left:${6 + depth * 14}px;" onclick="filterGrid(${tag.id})"
                 title="「${escapeHTML(tag.name)}」で絞り込む（配下のタグを含む）">
                ${hasChild
                    ? `<button class="filter-tree-toggle ${isOpen ? 'open' : ''}" onclick="event.stopPropagation(); toggleFilterTreeNode(${tag.id})"
                               aria-label="${isOpen ? '閉じる' : '開く'}"><i class="fa-solid fa-chevron-right"></i></button>`
                    : '<span class="filter-tree-spacer"></span>'}
                <span class="filter-tree-name">${opts.path ? `<span class="filter-tree-path">${escapeHTML(opts.path)} › </span>` : ''}${escapeHTML(tag.name)}</span>
                ${tag.id === activeId ? '<i class="fa-solid fa-check filter-tree-check"></i>' : ''}
                <span class="count-pill">${count}</span>
            </div>`;
    };

    // 検索中は階層を平らにして、どこにあるかをパスで示す
    if(needle) {
        const hits = masterTags.filter(t => t.name.toLowerCase().includes(needle));
        body.innerHTML = hits.length
            ? hits.map(t => row(t, 0, { flat: true, path: getTagPath(t).slice(0, -1).join(' › ') })).join('')
            : '<div class="filter-pop-empty">一致するタグがありません</div>';
        return;
    }

    let html = '';
    const quick = getQuickAccessTags(5, masterId);
    if(quick.length > 0 && masterTags.length > 6) {
        html += `<div class="filter-pop-label">よく使う</div><div class="filter-pop-quick">
            ${quick.map(t => `<button class="quick-tag ${t.id === activeId ? 'active' : ''}" onclick="filterGrid(${t.id})">
                <span>${escapeHTML(t.name)}</span><span class="quick-tag-count">${counts.get(t.id) || 0}</span></button>`).join('')}
        </div><div class="filter-pop-label">すべて</div>`;
    }

    const walk = (tag, depth, guard) => {
        if(guard > 8) return '';
        let out = row(tag, depth);
        if(filterPopoverOpen.has(tag.id)) {
            masterTags.filter(t => t.parentIds.includes(tag.id))
                .forEach(c => { out += walk(c, depth + 1, guard + 1); });
        }
        return out;
    };
    const roots = masterTags.filter(t => t.parentIds.length === 0);
    html += roots.length
        ? roots.map(r => walk(r, 0, 0)).join('')
        : '<div class="filter-pop-empty">タグがありません。「マスタ・タグ設定」から追加できます</div>';
    body.innerHTML = html;
}

function toggleFilterTreeNode(tagId) {
    if(filterPopoverOpen.has(tagId)) filterPopoverOpen.delete(tagId);
    else filterPopoverOpen.add(tagId);
    renderFilterPopoverBody();
}

/** タグの階層パス（ルートから自身まで） */
function getTagPath(tag) {
    const path = [];
    let cur = tag;
    let guard = 0;
    while(cur && guard++ < 10) {
        path.unshift(cur.name);
        cur = cur.parentIds.length ? tags.find(t => t.id === cur.parentIds[0]) : null;
    }
    return path;
}

/* ============================================================
   ページ遷移
   ============================================================ */

/**
 * ダッシュボードを表示
 */
function showDashboard() {
    currentPage = 'dashboard';
    closeFilterPopover();
    document.getElementById('dashboardContainer').style.display = 'block';
    document.getElementById('assetContainer').style.display = 'none';
    setHeaderMode('dashboard');
    renderDashboard();
    renderTopNav();
}

/**
 * 資産一覧を表示
 * @param {{keepFilter?: boolean}} [options] - keepFilter:true で現在の絞り込みを保持
 */
function showAssets(options = {}) {
    currentPage = 'assets';
    document.getElementById('dashboardContainer').style.display = 'none';
    document.getElementById('assetContainer').style.display = 'block';
    setHeaderMode('assets');

    if(!options.keepFilter) resetFilterState();

    // 表示形式のトグル状態を同期してから描画
    switchAssetView(assetViewMode, { skipRender: true });
    applyFilters();
}
