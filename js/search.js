
/**
 * search.js
 * 絞り込み状態の一元管理と検索
 *
 * 設計:
 *   「今どの条件で絞り込まれているか」を単一の状態（filterState + searchQuery）で保持し、
 *   表示は常にその状態から再計算する（単方向データフロー）。
 *
 *   条件は「稼働状況」と「マスタごとのタグ」を同時に組み合わせられる
 *   （例: 停止中 × 第1工場 × フォークリフト）。マスタが増えても同じ仕組みで扱える。
 *
 *   適用中の条件は必ず一覧上部のフィルタバーに表示する。
 *   ユーザーが「何で絞り込んでいたか」を記憶しておく必要をなくすため。
 */

/* 適用中の絞り込み条件
   status: ステータス名 / '__none__'（未設定）/ null
   tags:   { [masterId]: tagId } マスタごとに1つ（配下のタグを含めて絞り込む） */
let filterState = { status: null, tags: {} };

/* 検索語（絞り込み条件の中をさらに絞る） */
let searchQuery = '';

/** 絞り込み条件（検索語以外）が1つでもあるか */
function hasActiveFilters() {
    return !!filterState.status || Object.keys(filterState.tags).length > 0;
}

/** 絞り込みと検索語をまとめて初期化する（画面遷移・データ取り込み時） */
function resetFilterState() {
    filterState = { status: null, tags: {} };
    resetSearchQuery();
}

/** 絞り込みに使っているタグID（マスタの並び順） */
function getFilterTagIds() {
    return masters
        .map(m => filterState.tags[m.id])
        .filter(id => id !== undefined && tags.some(t => t.id === id));
}

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
 * 稼働状況が条件に合うか
 */
function matchesStatus(asset, status) {
    if(!status) return true;
    if(status === '__none__') return !asset.status || asset.status.length === 0;
    return Array.isArray(asset.status) && asset.status.includes(status);
}

/**
 * 絞り込み条件だけを適用した資産リスト（検索語は適用しない）
 * @param {{ignoreStatus?: boolean, ignoreMaster?: string}} [options]
 *   件数表示用に、特定の条件だけ外して数えたいときに使う
 */
function getScopedAssets(options = {}) {
    // 編集中の下書きは確定データではないので一覧には出さない
    let list = getPersistedAssets();

    if(!options.ignoreStatus) {
        list = list.filter(a => matchesStatus(a, filterState.status));
    }

    Object.entries(filterState.tags).forEach(([masterId, tagId]) => {
        if(masterId === options.ignoreMaster) return;
        const descendantIds = getAllDescendantIds(tagId);
        list = list.filter(a => a.tags.some(t => descendantIds.includes(t)));
    });

    return list;
}

/**
 * 絞り込み + 検索語を適用した最終的な表示リスト
 */
function getFilteredAssets(options = {}) {
    const scoped = getScopedAssets(options);
    const needle = searchQuery.trim().toLowerCase();
    if(!needle) return scoped;
    return scoped.filter(a => assetMatchesQuery(a, needle));
}

/** 検索語に一致するか（名称・ID・備考・タグ名） */
function assetMatchesQuery(a, needle) {
    if(a.name.toLowerCase().includes(needle)) return true;
    if(a.id.toLowerCase().includes(needle)) return true;
    if((a.specs || '').toLowerCase().includes(needle)) return true;
    return tags.some(t => a.tags.includes(t.id) && t.name.toLowerCase().includes(needle));
}

/**
 * 現在の状態から画面を再構築する（表示の唯一の入口）
 */
function applyFilters() {
    const list = getFilteredAssets();
    renderAssets(list);
    renderFilterBar(list.length);
    renderTopNav();
}

/**
 * 表示中のページを現在の状態で描き直す
 * （資産の追加・削除・画像更新など、データが変わったあとに呼ぶ）
 */
function refreshCurrentView() {
    if(currentPage === 'dashboard') {
        renderDashboard();
        renderTopNav();
    } else {
        applyFilters();
    }
}

/* ============================================================
   条件の説明（空状態・新規登録時の文言に使う）
   ============================================================ */

/**
 * 現在の絞り込み条件を人が読める形にする
 * @returns {{kind:string, label:string}[]}
 */
function describeActiveFilters() {
    const out = [];
    if(filterState.status) {
        out.push({ kind: '稼働状況', label: filterState.status === '__none__' ? '未設定' : filterState.status });
    }
    getFilterTagIds().forEach(id => {
        const tag = tags.find(t => t.id === id);
        const master = masters.find(m => m.id === tag.masterId);
        out.push({ kind: master ? master.name : 'タグ', label: tag.name });
    });
    return out;
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

/** 一覧を開いていなければ開き、開いていれば描き直す */
function showFilteredAssets() {
    if(currentPage !== 'assets') showAssets({ keepFilter: true });
    else applyFilters();
}

/**
 * タグで絞り込む（子孫タグも含む）
 * 同じマスタの条件は置き換え、別のマスタの条件とは組み合わせる。
 * @param {number|null} tagId - null なら全条件を解除
 */
function filterGrid(tagId) {
    if(tagId === null) { clearAssetFilter(); return; }
    const tag = tags.find(t => t.id === tagId);
    if(!tag) return;

    // 同じ条件をもう一度押したらトグルで解除（元に戻せる安心感）
    if(filterState.tags[tag.masterId] === tagId) {
        delete filterState.tags[tag.masterId];
    } else {
        filterState.tags[tag.masterId] = tagId;
        recordUsage('tags', tagId); // よく使う絞り込みの学習
    }
    closeFilterPopover();
    showFilteredAssets();
}

/** マスタ1つ分の条件を外す */
function clearMasterFilter(masterId) {
    delete filterState.tags[masterId];
    closeFilterPopover();
    showFilteredAssets();
}

/**
 * 稼働状況で絞り込む
 * @param {string} value - ステータス名 / '__none__'（未設定）/ '__all__'（解除）
 * @param {{keepTags?: boolean}} [options] - ダッシュボードから来たときはタグ条件を外す
 */
function filterByStatus(value, options = {}) {
    // フィルタバー上では同じ状態をもう一度押すと解除（トグル）
    const toggleOff = options.keepTags && value === filterState.status;
    filterState.status = (value === '__all__' || toggleOff) ? null : value;
    if(!options.keepTags) {
        filterState.tags = {};
        resetSearchQuery();
    }
    showFilteredAssets();
}

/** 絞り込み条件（検索語以外）を解除 */
function clearAssetFilter() {
    filterState = { status: null, tags: {} };
    showFilteredAssets();
}

/** 絞り込みと検索の両方を解除 */
function clearAllFilters() {
    resetFilterState();
    applyFilters();
}
