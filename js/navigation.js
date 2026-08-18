
/**
 * navigation.js
 * サイドバー描画とページ遷移
 *
 * 設計:
 *   サイドバーは「ナビゲーション」と「絞り込み」という別種の操作を含むため、
 *   セクション見出しで明確に分ける（機能の混同による誤操作を防ぐ）。
 *   タグには該当件数を添える。中身が何件あるかを開く前に分かれば、
 *   空の枝を開いて確かめる無駄な探索がなくなる。
 */

/**
 * タグ / マスタごとの資産件数を数える（子孫タグを含む）
 * @returns {{byTag: Map<number, number>, byMaster: Map<string, number>}}
 */
function buildAssetCountIndex() {
    const byTag = new Map();
    const byMaster = new Map();
    const pool = getPersistedAssets();

    // 子孫を含む件数（同一資産の二重カウントを避けるため資産単位で数える）
    tags.forEach(tag => {
        const ids = getAllDescendantIds(tag.id);
        byTag.set(tag.id, pool.filter(a => a.tags.some(t => ids.includes(t))).length);
    });

    masters.forEach(m => {
        const masterTagIds = tags.filter(t => t.masterId === m.id).map(t => t.id);
        byMaster.set(m.id, pool.filter(a => a.tags.some(t => masterTagIds.includes(t))).length);
    });

    return { byTag, byMaster, total: pool.length };
}

/**
 * サイドバーをレンダリング
 */
function renderSidebar() {
    const nav = document.getElementById('sidebarNav');
    if(!nav) return;

    const counts = buildAssetCountIndex();
    nav.innerHTML = '';

    /* --- セクション1: ナビゲーション --- */
    const navSection = document.createElement('div');
    navSection.innerHTML = `
        <div class="nav-section-label">メニュー</div>
        <div class="nav-item ${currentPage === 'dashboard' ? 'active' : ''}" onclick="showDashboard()" id="nav-dashboard">
            <i class="fa-solid fa-gauge-high"></i>
            <span class="nav-item-text">ダッシュボード</span>
        </div>
        <div class="nav-item ${currentPage === 'assets' && !activeFilter ? 'active' : ''}" onclick="showAssets()" id="nav-all">
            <i class="fa-solid fa-layer-group"></i>
            <span class="nav-item-text">全資産一覧</span>
            <span class="count-pill">${counts.total}</span>
        </div>
    `;
    nav.appendChild(navSection);

    /* --- セクション2: 絞り込み --- */
    const filterLabel = document.createElement('div');
    filterLabel.className = 'nav-section-label';
    filterLabel.innerHTML = `<span>タグで絞り込む</span>`;
    nav.appendChild(filterLabel);

    const container = document.createElement('div');

    masters.forEach(m => {
        const group = document.createElement('div');
        group.className = 'nav-group';
        group.id = `master-group-${m.id}`;

        // マスタ定義名（クリック=絞り込み / シェブロン=折り畳み）
        const labelEl = document.createElement('div');
        labelEl.className = 'nav-label';
        labelEl.dataset.masterId = m.id;
        labelEl.title = `${m.name} が設定されている資産だけを表示`;
        labelEl.innerHTML = `
            <span class="nav-label-text">${escapeHTML(m.name)}</span>
            <span class="count-pill">${counts.byMaster.get(m.id) || 0}</span>
            <i class="fa-solid fa-chevron-down chevron" title="開閉"></i>
        `;

        labelEl.onclick = (e) => {
            if(e.target.classList.contains('chevron')) {
                toggleMasterGroup(m.id);
                return;
            }
            filterByMaster(m.id, labelEl);
        };
        labelEl.ondblclick = (e) => {
            e.preventDefault();
            toggleMasterGroup(m.id);
        };

        group.appendChild(labelEl);

        const contentEl = document.createElement('div');
        contentEl.className = 'nav-content';

        const roots = tags.filter(t => t.masterId === m.id && t.parentIds.length === 0);
        if(roots.length === 0) {
            contentEl.innerHTML = `
                <div style="padding:8px 10px; font-size:var(--text-xs); color:var(--text-faint);">
                    タグがありません
                </div>`;
        } else {
            roots.forEach(root => {
                const node = createTagNode(root, 1, counts);
                if(node) contentEl.appendChild(node);
            });
        }

        group.appendChild(contentEl);
        container.appendChild(group);
    });
    nav.appendChild(container);

    // 絞り込み状態を状態変数から復元する
    if(typeof updateSidebarFilterState === 'function') updateSidebarFilterState();
}

/**
 * タグノードを再帰的に作成（最大7階層まで対応）
 */
function createTagNode(tag, depth, counts) {
    if(depth > 7) return null;

    const item = document.createElement('div');
    item.className = 'accordion-item';

    const children = tags.filter(t => t.parentIds.includes(tag.id));
    const hasChild = children.length > 0;
    const count = counts ? (counts.byTag.get(tag.id) || 0) : 0;

    const headerEl = document.createElement('div');
    headerEl.className = 'accordion-header';
    headerEl.dataset.tagId = tag.id;
    headerEl.title = `「${tag.name}」で絞り込む（配下のタグを含む）`;

    // 階層の深さはインデントで表す（アイコンの種類を変えるより読み取りが速い）
    headerEl.style.paddingLeft = `${10 + (depth - 1) * 10}px`;

    const contentEl = document.createElement('div');
    contentEl.className = 'accordion-header-content';
    if(count === 0) contentEl.parentElement?.classList.add('is-empty-branch');
    contentEl.innerHTML = `
        <span>${escapeHTML(tag.name)}</span>
        <i class="fa-solid fa-filter accordion-filter-icon"></i>
        <span class="count-pill">${count}</span>
    `;
    if(count === 0) headerEl.classList.add('is-empty-branch');

    contentEl.onclick = (e) => {
        e.stopPropagation();
        filterGrid(tag.id, headerEl);
    };

    headerEl.appendChild(contentEl);

    if(hasChild) {
        const chevron = document.createElement('i');
        chevron.className = 'fa-solid fa-chevron-down chevron';
        chevron.title = '開閉';
        chevron.onclick = (e) => {
            e.stopPropagation();
            toggleAccordion(headerEl);
        };
        headerEl.appendChild(chevron);

        headerEl.ondblclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleAccordion(headerEl);
        };
    }

    item.appendChild(headerEl);

    if(hasChild) {
        const bodyEl = document.createElement('div');
        bodyEl.className = 'accordion-body';
        bodyEl.style.display = 'none';

        children.forEach(child => {
            const childNode = createTagNode(child, depth + 1, counts);
            if(childNode) bodyEl.appendChild(childNode);
        });

        item.appendChild(bodyEl);
    }

    return item;
}

/**
 * マスタグループの折り畳み/展開
 */
function toggleMasterGroup(masterId) {
    const group = document.getElementById(`master-group-${masterId}`);
    if(group) group.classList.toggle('collapsed');
}

/**
 * ヘッダーに表示する操作を、ページに応じて切り替える
 * （その場面で使えない操作は出さない＝選択肢を減らして迷いを減らす）
 */
function setHeaderMode(mode) {
    const show = (id, display) => {
        const el = document.getElementById(id);
        if(el) el.style.display = display;
    };
    const isAssets = mode === 'assets';

    show('searchContainer', isAssets ? 'block' : 'none');
    show('viewToggle',      isAssets ? 'inline-flex' : 'none');
    show('btnCreateAsset',  isAssets ? 'inline-flex' : 'none');
    show('divider1',        isAssets ? 'block' : 'none');
    show('btnListSettings', isAssets && assetViewMode === 'list' ? 'inline-flex' : 'none');
}

/**
 * ダッシュボードを表示
 */
function showDashboard() {
    currentPage = 'dashboard';
    document.getElementById('dashboardContainer').style.display = 'block';
    document.getElementById('assetContainer').style.display = 'none';
    document.getElementById('pageTitle').innerText = 'ダッシュボード';
    setHeaderMode('dashboard');
    document.getElementById('contextBar').classList.remove('show');

    renderDashboard();
    renderSidebar();
}

/**
 * 資産一覧を表示
 * @param {{keepFilter?: boolean}} [options] - keepFilter:true で現在の絞り込みを保持
 */
function showAssets(options = {}) {
    currentPage = 'assets';
    document.getElementById('dashboardContainer').style.display = 'none';
    document.getElementById('assetContainer').style.display = 'block';
    document.getElementById('pageTitle').innerText = '資産一覧';
    setHeaderMode('assets');

    if(!options.keepFilter) {
        activeFilter = null;
        resetSearchQuery();
    }

    // 表示形式のトグル状態を同期してから描画
    switchAssetView(assetViewMode, { skipRender: true });
    applyFilters();
    renderSidebar();
}
