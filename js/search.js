
/**
 * search.js
 * 絞り込み状態の一元管理と検索
 *
 * 設計:
 *   「今どの条件で絞り込まれているか」を単一の状態（activeFilter + searchQuery）で保持し、
 *   表示は常にその状態から再計算する（単方向データフロー）。
 *   これにより「検索欄を消しても一覧が戻らない」「フィルタ中に追加した資産が出てこない」
 *   といった、状態が分散していたことによる不整合が構造的に発生しなくなる。
 *
 *   さらに、適用中の条件は必ずコンテキストバーにチップとして表示する。
 *   ユーザーが「何で絞り込んでいたか」を記憶しておく必要をなくすため。
 */

/* 適用中の絞り込み条件（1つだけ保持する。複合条件は検索語で行う）
   { type:'tag', id } | { type:'master', id } | { type:'status', value } | null */
let activeFilter = null;

/* 検索語（絞り込み条件の中をさらに絞る） */
let searchQuery = '';

/**
 * 検索語だけをリセットする（絞り込み条件は保持）
 */
function resetSearchQuery() {
    searchQuery = '';
    const input = document.getElementById('searchInput');
    if(input) input.value = '';
    updateSearchInputState();
}

/**
 * 絞り込み条件だけを適用した資産リスト（検索語は適用しない）
 */
function getScopedAssets() {
    // 編集中の下書きは確定データではないので一覧には出さない
    const pool = getPersistedAssets();
    if(!activeFilter) return pool;

    if(activeFilter.type === 'tag') {
        const descendantIds = getAllDescendantIds(activeFilter.id);
        return pool.filter(a => a.tags.some(t => descendantIds.includes(t)));
    }
    if(activeFilter.type === 'master') {
        const masterTagIds = tags.filter(t => t.masterId === activeFilter.id).map(t => t.id);
        return pool.filter(a => a.tags.some(t => masterTagIds.includes(t)));
    }
    if(activeFilter.type === 'status') {
        if(activeFilter.value === '__none__') {
            return pool.filter(a => !a.status || a.status.length === 0);
        }
        return pool.filter(a => Array.isArray(a.status) && a.status.includes(activeFilter.value));
    }
    return pool;
}

/**
 * 絞り込み + 検索語を適用した最終的な表示リスト
 */
function getFilteredAssets() {
    const scoped = getScopedAssets();
    const needle = searchQuery.trim().toLowerCase();
    if(!needle) return scoped;

    return scoped.filter(a => {
        if(a.name.toLowerCase().includes(needle)) return true;
        if(a.id.toLowerCase().includes(needle)) return true;
        if((a.specs || '').toLowerCase().includes(needle)) return true;
        const myTags = tags.filter(t => a.tags.includes(t.id));
        if(myTags.some(t => t.name.toLowerCase().includes(needle))) return true;
        return false;
    });
}

/**
 * 現在の状態から画面を再構築する（表示の唯一の入口）
 */
function applyFilters() {
    const list = getFilteredAssets();
    renderAssets(list);
    renderContextBar(list.length);
    updateSidebarFilterState();
}

/**
 * 表示中のページを現在の状態で描き直す
 * （資産の追加・削除・画像更新など、データが変わったあとに呼ぶ）
 */
function refreshCurrentView() {
    if(currentPage === 'dashboard') {
        renderDashboard();
    } else {
        applyFilters();
    }
}

/* ============================================================
   コンテキストバー：適用中の条件と件数の常時表示
   ============================================================ */

/**
 * 現在の絞り込み条件を人が読める形にする
 * @returns {{kind:string, label:string}|null}
 */
function describeActiveFilter() {
    if(!activeFilter) return null;

    if(activeFilter.type === 'tag') {
        const tag = tags.find(t => t.id === activeFilter.id);
        if(!tag) return null;
        const master = masters.find(m => m.id === tag.masterId);
        return { kind: master ? master.name : 'タグ', label: tag.name };
    }
    if(activeFilter.type === 'master') {
        const master = masters.find(m => m.id === activeFilter.id);
        if(!master) return null;
        return { kind: 'マスタ', label: `${master.name} が設定済み` };
    }
    if(activeFilter.type === 'status') {
        return { kind: '稼働状況', label: activeFilter.value === '__none__' ? '未設定' : activeFilter.value };
    }
    return null;
}

function renderContextBar(visibleCount) {
    const bar    = document.getElementById('contextBar');
    const countEl= document.getElementById('contextCount');
    const chipsEl= document.getElementById('contextChips');
    const clearEl= document.getElementById('contextClear');
    if(!bar) return;

    if(currentPage !== 'assets') {
        bar.classList.remove('show');
        return;
    }
    bar.classList.add('show');

    const total = getPersistedAssets().length;
    const desc  = describeActiveFilter();
    const hasQuery = searchQuery.trim() !== '';
    const isFiltered = !!desc || hasQuery;

    countEl.innerHTML = isFiltered
        ? `<strong>${visibleCount}</strong> 件を表示中 <span style="opacity:0.6;">/ 全${total}件</span>`
        : `<strong>${total}</strong> 件の資産`;

    const chips = [];
    if(desc) {
        chips.push(`
            <span class="chip">
                <span class="chip-kind">${escapeHTML(desc.kind)}</span>
                <span class="chip-label">${escapeHTML(desc.label)}</span>
                <button class="chip-remove" onclick="clearAssetFilter()" title="この条件を解除" aria-label="絞り込みを解除">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </span>`);
    }
    if(hasQuery) {
        chips.push(`
            <span class="chip">
                <span class="chip-kind">検索</span>
                <span class="chip-label">${escapeHTML(searchQuery.trim())}</span>
                <button class="chip-remove" onclick="clearSearchInput()" title="検索を解除" aria-label="検索を解除">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </span>`);
    }
    chipsEl.innerHTML = chips.join('');
    clearEl.style.display = chips.length > 1 ? 'inline-flex' : 'none';
}

/* ============================================================
   検索
   ============================================================ */

function handleSearch(query) {
    searchQuery = query || '';
    updateSearchInputState();
    applyFilters();
}

function clearSearchInput() {
    const input = document.getElementById('searchInput');
    if(input) { input.value = ''; input.focus(); }
    handleSearch('');
}

/** 入力があるときだけ×ボタンを出す */
function updateSearchInputState() {
    const container = document.getElementById('searchContainer');
    if(!container) return;
    container.classList.toggle('has-value', searchQuery.trim() !== '');
}

/* ============================================================
   絞り込みの設定・解除
   ============================================================ */

/**
 * タグで絞り込む（子孫タグも含む）
 * @param {number|null} tagId - null なら解除
 */
function filterGrid(tagId, el) {
    if(tagId === null) { clearAssetFilter(); return; }

    // 同じ条件をもう一度押したらトグルで解除（元に戻せる安心感）
    if(activeFilter && activeFilter.type === 'tag' && activeFilter.id === tagId) {
        clearAssetFilter();
        return;
    }

    activeFilter = { type: 'tag', id: tagId };
    recordUsage('tags', tagId); // よく使う絞り込みの学習
    resetSearchQuery();

    if(currentPage !== 'assets') showAssets({ keepFilter: true });
    else applyFilters();
}

/**
 * マスタ定義で絞り込む（そのマスタのタグが1つでも付いている資産）
 */
function filterByMaster(masterId, labelEl) {
    if(activeFilter && activeFilter.type === 'master' && activeFilter.id === masterId) {
        clearAssetFilter();
        return;
    }

    activeFilter = { type: 'master', id: masterId };
    resetSearchQuery();

    if(currentPage !== 'assets') showAssets({ keepFilter: true });
    else applyFilters();
}

/**
 * 稼働状況で絞り込む（ダッシュボードのKPIカードから遷移する導線）
 * @param {string} value - ステータス名 / '__none__'（未設定）/ '__all__'（全件）
 */
function filterByStatus(value) {
    activeFilter = (value === '__all__') ? null : { type: 'status', value };
    resetSearchQuery();

    if(currentPage !== 'assets') showAssets({ keepFilter: true });
    else applyFilters();
}

/** 絞り込み条件（検索語以外）を解除 */
function clearAssetFilter() {
    activeFilter = null;
    if(currentPage !== 'assets') showAssets({ keepFilter: true });
    else applyFilters();
}

/** 絞り込みと検索の両方を解除 */
function clearAllFilters() {
    activeFilter = null;
    resetSearchQuery();
    applyFilters();
}

/**
 * サイドバーの選択状態を、現在の絞り込み条件に合わせて描き直す
 * （DOM側にフラグを持たせず、状態から復元する）
 */
function updateSidebarFilterState() {
    document.querySelectorAll('.tree-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.accordion-header').forEach(h => h.classList.remove('active', 'filtered'));
    document.querySelectorAll('.nav-label').forEach(l => l.classList.remove('active'));

    // 「全資産一覧」は絞り込みが無いときだけ選択状態にする
    const navAll = document.getElementById('nav-all');
    if(navAll) navAll.classList.toggle('active', currentPage === 'assets' && !activeFilter);

    // よく使う絞り込みチップの選択状態
    document.querySelectorAll('[data-quick-tag]').forEach(btn => {
        const isActive = !!activeFilter && activeFilter.type === 'tag'
                       && activeFilter.id === Number(btn.dataset.quickTag);
        btn.classList.toggle('active', isActive);
    });

    if(!activeFilter) return;

    if(activeFilter.type === 'tag') {
        const header = document.querySelector(`.accordion-header[data-tag-id="${activeFilter.id}"]`);
        if(header) {
            header.classList.add('active', 'filtered');
            // 選択されたタグが折り畳みの中にある場合は親を開いて見える位置に出す
            let parent = header.closest('.accordion-body');
            while(parent) {
                const item = parent.closest('.accordion-item');
                if(item) {
                    item.classList.add('open');
                    const body = item.querySelector(':scope > .accordion-body');
                    if(body) body.style.display = 'block';
                }
                parent = item ? item.parentElement.closest('.accordion-body') : null;
            }
            const group = header.closest('.nav-group');
            if(group) group.classList.remove('collapsed');
        }
    } else if(activeFilter.type === 'master') {
        const label = document.querySelector(`.nav-label[data-master-id="${activeFilter.id}"]`);
        if(label) label.classList.add('active');
    }
}
