
/**
 * navigation.js
 * サイドバーとページ遷移
 */

/**
 * サイドバーをレンダリング
 */
function renderSidebar() {
    const nav = document.getElementById('sidebarNav');
    
    // トップナビゲーション
    const topNav = `
        <div class="nav-item ${currentPage === 'dashboard' ? 'active' : ''}" onclick="showDashboard()" id="nav-dashboard">
            <i class="fa-solid fa-chart-pie"></i> ダッシュボード
        </div>
        <div class="nav-item ${currentPage === 'assets' ? 'active' : ''}" onclick="showAssets()" id="nav-all">
            <i class="fa-solid fa-layer-group"></i> 全資産一覧
        </div>
        <div style="margin: 24px 0 8px 0; font-size:0.75rem; font-weight:700; color:var(--text-sub); padding-left: 12px;">
            カテゴリ・タグ
        </div>
    `;
    
    nav.innerHTML = topNav;
    const container = document.createElement('div');
    
    masters.forEach(m => {
        const group = document.createElement('div');
        group.className = 'nav-group';
        group.id = `master-group-${m.id}`;
        
        // マスタ定義名（クリック可能、折り畳み可能）
        const labelEl = document.createElement('div');
        labelEl.className = 'nav-label';
        labelEl.innerHTML = `
            <span>${m.name}</span>
            <i class="fa-solid fa-chevron-down chevron"></i>
        `;
        
        // シングルクリック: フィルタ機能
        labelEl.onclick = (e) => {
            // chevronクリックの場合は折り畳みのみ
            if(e.target.classList.contains('chevron')) {
                toggleMasterGroup(m.id);
                return;
            }
            // それ以外はフィルタ機能
            filterByMaster(m.id, labelEl);
        };
        
        // ダブルクリック: 折り畳み機能
        labelEl.ondblclick = (e) => {
            e.preventDefault(); // テキスト選択を防止
            toggleMasterGroup(m.id);
        };
        
        group.appendChild(labelEl);
        
        // マスタコンテンツ（折り畳み対象）
        const contentEl = document.createElement('div');
        contentEl.className = 'nav-content';
        
        const roots = tags.filter(t => t.masterId === m.id && t.parentIds.length === 0);
        roots.forEach(root => {
            contentEl.appendChild(createTagNode(root, 1));
        });
        
        group.appendChild(contentEl);
        container.appendChild(group);
    });
    nav.appendChild(container);
}

/**
 * タグノードを再帰的に作成（最大7階層まで対応）
 */
function createTagNode(tag, depth) {
    if(depth > 7) return null; // 最大7階層まで
    
    const item = document.createElement('div');
    item.className = 'accordion-item';
    item.style.marginLeft = depth > 1 ? '16px' : '0';
    
    const children = tags.filter(t => t.parentIds.includes(tag.id));
    const hasChild = children.length > 0;
    
    const headerEl = document.createElement('div');
    headerEl.className = 'accordion-header';
    headerEl.dataset.tagId = tag.id;
    
    // アイコンの種類を階層によって変える
    const iconClass = depth === 1 ? 'fa-solid fa-tag' : 
                     depth === 2 ? 'fa-solid fa-caret-right' :
                     'fa-solid fa-circle';
    const iconSize = depth === 1 ? '0.8rem' : depth === 2 ? '0.75rem' : '0.4rem';
    
    const contentEl = document.createElement('div');
    contentEl.className = 'accordion-header-content';
    contentEl.innerHTML = `
        <i class="${iconClass}" style="color:var(--secondary); font-size:${iconSize}; margin-right:8px;"></i>
        <span>${tag.name}</span>
        <i class="fa-solid fa-filter accordion-filter-icon"></i>
    `;
    
    // シングルクリック: フィルタ機能
    contentEl.onclick = (e) => {
        e.stopPropagation();
        filterGrid(tag.id, headerEl);
    };
    
    headerEl.appendChild(contentEl);
    
    // 子がある場合は必ずアコーディオンボタンを追加
    if(hasChild) {
        const chevron = document.createElement('i');
        chevron.className = 'fa-solid fa-chevron-down chevron';
        chevron.style.cssText = 'cursor: pointer; padding: 4px; transition: transform 0.2s;';
        chevron.onclick = (e) => {
            e.stopPropagation();
            toggleAccordion(headerEl);
        };
        headerEl.appendChild(chevron);
        
        // ダブルクリックでも折り畳み可能
        headerEl.ondblclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleAccordion(headerEl);
        };
    }
    
    item.appendChild(headerEl);
    
    // 子ノードを再帰的に作成
    if(hasChild) {
        const bodyEl = document.createElement('div');
        bodyEl.className = 'accordion-body';
        bodyEl.style.cssText = 'display: none;'; // 初期状態は閉じた状態
        
        children.forEach(child => {
            const childNode = createTagNode(child, depth + 1);
            if(childNode) {
                bodyEl.appendChild(childNode);
            }
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
    if(group) {
        group.classList.toggle('collapsed');
    }
}

/**
 * ダッシュボードを表示
 */
function showDashboard() {
    currentPage = 'dashboard';
    document.getElementById('dashboardContainer').style.display = 'block';
    document.getElementById('assetContainer').style.display = 'none';
    document.getElementById('searchContainer').style.display = 'none';
    document.getElementById('viewToggle').style.display = 'none';
    document.getElementById('btnCreateAsset').style.display = 'none';
    document.getElementById('divider1').style.display = 'none';
    document.getElementById('btnListSettings').style.display = 'none';
    document.getElementById('pageTitle').innerText = 'ダッシュボード';
    
    renderDashboard();
    renderSidebar(); // Update active state
}

/**
 * 資産一覧を表示
 */
function showAssets() {
    currentPage = 'assets';
    document.getElementById('dashboardContainer').style.display = 'none';
    document.getElementById('assetContainer').style.display = 'block';
    document.getElementById('searchContainer').style.display = 'block';
    document.getElementById('viewToggle').style.display = 'flex';
    document.getElementById('btnCreateAsset').style.display = 'inline-flex';
    document.getElementById('divider1').style.display = 'block';
    document.getElementById('pageTitle').innerText = '全資産一覧';

    // 検索状態をリセットして全資産を表示
    resetSearchState();
    renderAssets(assets);
    
    // 初回表示時はリストビューを設定
    if(assetViewMode === 'list') {
        switchAssetView('list');
    }
    
    renderSidebar(); // Update active state
}


