
/**
 * command-palette.js
 * コマンドパレット（Ctrl+K）
 *
 * 設計:
 *   目的の資産・タグ・操作に到達する経路が「メニューを辿る」しかないと、
 *   ユーザーは毎回どこにあるかを思い出す必要がある。
 *   パレットは名前さえ思い浮かべば到達できる単一の入口を提供し、
 *   探索コストを一定（キーを叩くだけ）にする。
 *
 *   何も入力していない状態では「最近更新した資産」と「よく使う操作」を先に出す。
 *   ユーザーが次にしたいことは直前の作業の続きであることが多いため。
 */

let paletteState = {
    items: [],       // 表示中の候補（フラット配列）
    activeIndex: 0,
    open: false
};

/* パレットから実行できる操作 */
function getPaletteCommands() {
    return [
        { id: 'new-asset',  icon: 'fa-plus',            title: '新規資産を登録',        hint: 'N',     run: () => createNewAsset() },
        { id: 'go-dash',    icon: 'fa-gauge-high',      title: 'ダッシュボードを開く',  hint: 'G D',   run: () => showDashboard() },
        { id: 'go-assets',  icon: 'fa-layer-group',     title: '全資産一覧を開く',      hint: 'G A',   run: () => showAssets() },
        { id: 'view-list',  icon: 'fa-list',            title: 'リスト表示に切り替える', hint: '1',    run: () => { showAssets({ keepFilter: true }); switchAssetView('list'); } },
        { id: 'view-card',  icon: 'fa-grip',            title: 'カード表示に切り替える', hint: '2',    run: () => { showAssets({ keepFilter: true }); switchAssetView('card'); } },
        { id: 'view-cal',   icon: 'fa-calendar',        title: 'カレンダー表示に切り替える', hint: '3', run: () => { showAssets({ keepFilter: true }); switchAssetView('calendar'); } },
        { id: 'master',     icon: 'fa-sitemap',         title: 'マスタ・タグ設定を開く', run: () => openMasterModal() },
        { id: 'columns',    icon: 'fa-table-columns',   title: 'リストの列を設定',       run: () => openListSettingsModal() },
        { id: 'export',     icon: 'fa-file-zipper',     title: 'ZIPでバックアップ',      run: () => exportToZIP() },
        { id: 'import',     icon: 'fa-file-arrow-up',   title: 'バックアップから復元',   run: () => document.getElementById('importFile').click() },
        { id: 'clear',      icon: 'fa-rotate-left',     title: '絞り込みをすべて解除',   run: () => { showAssets({ keepFilter: true }); clearAllFilters(); } },
        { id: 'help',       icon: 'fa-keyboard',        title: 'ショートカット一覧',    hint: '?',     run: () => openKeyHelp() }
    ];
}

function openPalette(initialQuery = '') {
    const overlay = document.getElementById('paletteOverlay');
    const input = document.getElementById('paletteInput');
    if(!overlay || !input) return;

    closeMenus();
    paletteState.open = true;
    overlay.classList.add('open');
    input.value = initialQuery;
    renderPaletteResults(initialQuery);
    input.focus();
    input.select();
}

function closePalette() {
    const overlay = document.getElementById('paletteOverlay');
    if(!overlay) return;
    paletteState.open = false;
    overlay.classList.remove('open');
}

function isPaletteOpen() {
    return paletteState.open;
}

/**
 * 入力に対する候補を組み立てる
 * @param {string} query
 * @returns {Array<{group:string, items:Array}>}
 */
function buildPaletteGroups(query) {
    const q = query.trim().toLowerCase();
    const groups = [];

    if(!q) {
        // 入力前：直前の作業の続きに戻れる候補を先に出す
        let recent = getRecentlyOpenedAssets(5);
        if(recent.length === 0) {
            // まだ開いた実績が無いうちは、新しく登録された順で代用する
            recent = getPersistedAssets()
                .slice()
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 5);
        }
        if(recent.length > 0) {
            groups.push({ group: '最近開いた資産', items: recent.map(a => assetToPaletteItem(a, '')) });
        }

        groups.push({
            group: 'よく使う操作',
            items: sortCommandsByUsage(getPaletteCommands()).slice(0, 5).map(cmd => commandToPaletteItem(cmd))
        });
        return groups;
    }

    // 資産（名前・ID・備考・タグ名で一致）
    const assetMatches = getPersistedAssets().filter(a => {
        if(a.name.toLowerCase().includes(q)) return true;
        if(a.id.toLowerCase().includes(q)) return true;
        if((a.specs || '').toLowerCase().includes(q)) return true;
        return tags.filter(t => a.tags.includes(t.id)).some(t => t.name.toLowerCase().includes(q));
    });
    // 一致した中では「最近開いた / よく開く」ものを上に出す
    assetMatches.sort((a, b) => usageScore('assets', b.id) - usageScore('assets', a.id));
    if(assetMatches.length > 0) {
        groups.push({ group: '資産', items: assetMatches.slice(0, 8).map(a => assetToPaletteItem(a, q)) });
    }

    // タグ（選ぶとその絞り込みに切り替わる）
    const tagMatches = tags.filter(t => t.name.toLowerCase().includes(q)).slice(0, 6);
    if(tagMatches.length > 0) {
        groups.push({
            group: 'タグで絞り込む',
            items: tagMatches.map(t => {
                const master = masters.find(m => m.id === t.masterId);
                const descendants = getAllDescendantIds(t.id);
                const count = getPersistedAssets().filter(a => a.tags.some(id => descendants.includes(id))).length;
                return {
                    icon: 'fa-tag',
                    title: highlight(t.name, q),
                    sub: master ? master.name : '',
                    right: `<span class="count-pill">${count}</span>`,
                    run: () => { showAssets({ keepFilter: true }); filterGrid(t.id, null); }
                };
            })
        });
    }

    // 操作
    const cmdMatches = sortCommandsByUsage(getPaletteCommands().filter(c => c.title.toLowerCase().includes(q)));
    if(cmdMatches.length > 0) {
        groups.push({ group: '操作', items: cmdMatches.map(c => commandToPaletteItem(c, q)) });
    }

    return groups;
}

function assetToPaletteItem(asset, q) {
    const myTags = tags.filter(t => asset.tags.includes(t.id)).slice(0, 2).map(t => t.name);
    const status = (asset.status && asset.status.length) ? asset.status[0] : '未設定';
    return {
        icon: 'fa-cube',
        title: highlight(asset.name, q),
        sub: [asset.id.toUpperCase(), ...myTags].join(' · '),
        right: `<span class="badge ${getStatusBadgeClass(status)}">${escapeHTML(status)}</span>`,
        run: () => openAssetModal(asset.id)
    };
}

function commandToPaletteItem(cmd, q = '') {
    return {
        commandId: cmd.id,
        icon: cmd.icon,
        title: highlight(cmd.title, q),
        sub: '',
        right: cmd.hint ? cmd.hint.split(' ').map(k => `<span class="kbd">${escapeHTML(k)}</span>`).join('') : '',
        run: cmd.run
    };
}

/** 一致部分を強調する（なぜこの候補が出たのかが分かる） */
function highlight(text, q) {
    const safe = escapeHTML(text);
    if(!q || typeof q !== 'string') return safe;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if(idx < 0) return safe;
    return escapeHTML(text.slice(0, idx))
         + '<mark>' + escapeHTML(text.slice(idx, idx + q.length)) + '</mark>'
         + escapeHTML(text.slice(idx + q.length));
}

function renderPaletteResults(query) {
    const container = document.getElementById('paletteResults');
    if(!container) return;

    const groups = buildPaletteGroups(query);
    paletteState.items = groups.flatMap(g => g.items);
    paletteState.activeIndex = 0;

    if(paletteState.items.length === 0) {
        container.innerHTML = `
            <div class="palette-empty">
                <i class="fa-solid fa-magnifying-glass"></i>
                <div style="font-weight:600; color:var(--text); margin-bottom:4px;">「${escapeHTML(query)}」に一致するものがありません</div>
                <div style="font-size:var(--text-sm);">資産名・タグ名・操作名で検索できます</div>
            </div>`;
        return;
    }

    let flatIndex = 0;
    container.innerHTML = groups.map(g => `
        <div class="palette-group-label">${escapeHTML(g.group)}</div>
        ${g.items.map(item => {
            const i = flatIndex++;
            return `
                <div class="palette-item ${i === 0 ? 'active' : ''}" data-index="${i}"
                     onclick="runPaletteItem(${i})" onmousemove="setPaletteActive(${i})">
                    <div class="palette-item-icon"><i class="fa-solid ${item.icon}"></i></div>
                    <div class="palette-item-body">
                        <div class="palette-item-title">${item.title}</div>
                        ${item.sub ? `<div class="palette-item-sub">${escapeHTML(item.sub)}</div>` : ''}
                    </div>
                    <div class="palette-item-right">${item.right || ''}</div>
                </div>`;
        }).join('')}
    `).join('');
}

function setPaletteActive(index) {
    if(index === paletteState.activeIndex) return;
    paletteState.activeIndex = index;
    updatePaletteActiveClass();
}

function movePaletteActive(delta) {
    const count = paletteState.items.length;
    if(count === 0) return;
    paletteState.activeIndex = (paletteState.activeIndex + delta + count) % count;
    updatePaletteActiveClass(true);
}

function updatePaletteActiveClass(scroll = false) {
    document.querySelectorAll('.palette-item').forEach(el => {
        const isActive = Number(el.dataset.index) === paletteState.activeIndex;
        el.classList.toggle('active', isActive);
        if(isActive && scroll) el.scrollIntoView({ block: 'nearest' });
    });
}

function runPaletteItem(index) {
    const item = paletteState.items[index];
    if(!item) return;
    if(item.commandId) recordUsage('commands', item.commandId);
    closePalette();
    item.run();
}

/**
 * 操作候補を「よく使う順」に並べ替える
 * 定義順は開発者の都合でしかないので、実際に使われた回数で並べ直す。
 */
function sortCommandsByUsage(commands) {
    return [...commands].sort((a, b) => usageScore('commands', b.id) - usageScore('commands', a.id));
}

/**
 * パレット用のキーボード操作を設定する
 */
function setupPaletteEvents() {
    const input = document.getElementById('paletteInput');
    if(!input) return;

    input.addEventListener('input', (e) => renderPaletteResults(e.target.value));

    input.addEventListener('keydown', (e) => {
        if(e.isComposing) return; // 日本語入力の変換中は無視

        if(e.key === 'ArrowDown') { e.preventDefault(); movePaletteActive(1); }
        else if(e.key === 'ArrowUp') { e.preventDefault(); movePaletteActive(-1); }
        else if(e.key === 'Enter') { e.preventDefault(); runPaletteItem(paletteState.activeIndex); }
        else if(e.key === 'Escape') { e.preventDefault(); closePalette(); }
    });
}
