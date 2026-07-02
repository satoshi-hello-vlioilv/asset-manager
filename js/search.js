
/**
 * search.js
 * 検索とフィルター機能
 */

// 検索の起点リスト（サイドバーのフィルタ適用後など、検索前の一覧）
// ※ 以前は「前回の検索結果」を母集合にしていたため、検索欄をクリアしても
//    一覧が復元されないバグがあった。起点リストを保持することで解消。
let searchBaseList = null;

/**
 * 検索状態をリセット（フィルタやページ切替時に呼ぶ）
 */
function resetSearchState() {
    searchBaseList = null;
    const input = document.getElementById('searchInput');
    if(input) input.value = '';
}

/**
 * 検索機能（現在のフィルタ文脈の中で絞り込む）
 */
function handleSearch(query) {
    // 最初の入力時に、検索の起点となるリストを記憶する
    if(searchBaseList === null) {
        searchBaseList = window.currentAssetList || assets;
    }

    if(!query.trim()) {
        // 検索解除: 起点リストに戻す
        const base = searchBaseList;
        searchBaseList = null;
        renderAssets(base);
        return;
    }

    const needle = query.toLowerCase();
    const filtered = searchBaseList.filter(a => {
        // 資産名で検索
        if(a.name.toLowerCase().includes(needle)) return true;
        // IDで検索
        if(a.id.toLowerCase().includes(needle)) return true;
        // タグ名で検索
        const myTags = tags.filter(t => a.tags.includes(t.id));
        if(myTags.some(t => t.name.toLowerCase().includes(needle))) return true;
        return false;
    });

    renderAssets(filtered);
}

/**
 * マスタ定義名によるフィルタ（そのマスタに属する全タグを持つ資産を表示）
 */
function filterByMaster(masterId, labelEl) {
    resetSearchState();

    // Reset all active states
    document.querySelectorAll('.tree-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.accordion-header').forEach(h => h.classList.remove('active', 'filtered'));
    document.querySelectorAll('.nav-label').forEach(l => l.classList.remove('active'));
    
    // Highlight selected master label
    labelEl.classList.add('active');
    
    // Get all tags belonging to this master
    const masterTags = tags.filter(t => t.masterId === masterId).map(t => t.id);
    
    // Filter assets that have at least one tag from this master
    const filtered = assets.filter(a => a.tags.some(t => masterTags.includes(t)));
    
    const masterName = masters.find(m => m.id === masterId)?.name;
    document.getElementById('pageTitle').innerHTML = `<span style="color:var(--primary)">${masterName}</span> マスタに登録された資産`;
    renderAssets(filtered);
}

/**
 * タグによるフィルタ（そのタグと子孫タグを持つ資産を表示）
 */
function filterGrid(tagId, el) {
    resetSearchState();

    // アセットページに切り替え
    if(currentPage !== 'assets') {
        showAssets();
    }

    // Reset all active states
    document.querySelectorAll('.tree-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.accordion-header').forEach(h => h.classList.remove('active', 'filtered'));
    document.querySelectorAll('.nav-label').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    if(tagId === null) {
        // "All" clicked - mark nav-all as active
        const navAll = document.getElementById('nav-all');
        if(navAll) navAll.classList.add('active');
        renderAssets(assets);
        document.getElementById('pageTitle').innerText = '全資産一覧';
        return;
    }

    // Highlight selected element
    if(el) {
        el.classList.add('active');
        if(el.classList.contains('accordion-header')) {
            el.classList.add('filtered');
        }
    }

    // Get all descendant tags (including the selected tag itself)
    const descendantIds = getAllDescendantIds(tagId);
    
    // Filter assets that have any of the descendant tags
    const filtered = assets.filter(a => a.tags.some(t => descendantIds.includes(t)));
    
    const tagName = tags.find(t => t.id === tagId)?.name;
    document.getElementById('pageTitle').innerHTML = `<span style="color:var(--primary)">${tagName}</span> の一覧`;
    renderAssets(filtered);
}


