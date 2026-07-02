
/**
 * master.js
 * マスタ管理（リストビュー）
 */

// 右ペインで現在選択中のタグID
let currentDetailTagId = null;
// 右ペインのビュー ('list' | 'form')
let cfPaneMode = 'list';
// 編集中フィールドインデックス（新規はnull）
let cfEditIndex = null;

// =============================================================================
// フィールド種別 UI 定義
// =============================================================================
const FIELD_TYPE_UI = {
    text:     { icon: 'fa-font',           label: 'テキスト',  desc: '短い文字を入力する欄',     color: '#3b82f6' },
    number:   { icon: 'fa-hashtag',        label: '数値',      desc: '数字のみを入力する欄',     color: '#10b981' },
    date:     { icon: 'fa-calendar-days',  label: '日付',      desc: 'カレンダーから日付を選ぶ', color: '#f59e0b' },
    select:   { icon: 'fa-list-ul',        label: '選択肢',    desc: 'リストから一つを選ぶ',     color: '#8b5cf6' },
    checkbox: { icon: 'fa-square-check',   label: 'チェック',  desc: 'はい／いいえで回答する',   color: '#ef4444' },
    textarea: { icon: 'fa-align-left',     label: 'メモ欄',    desc: '複数行のテキストを入力',   color: '#6366f1' },
};

// =============================================================================
// プリセットテンプレート
// =============================================================================
const FIELD_PRESETS = [
    { icon: 'fa-road',             label: '走行距離',      type: 'number',   unit: 'km',   validation: { min: 0, max: 999999 } },
    { icon: 'fa-wrench',           label: '次回点検日',    type: 'date',     alertDays: 30 },
    { icon: 'fa-yen-sign',         label: '購入金額',      type: 'number',   unit: '円',   validation: { min: 0 } },
    { icon: 'fa-barcode',          label: '製造番号',      type: 'text' },
    { icon: 'fa-calendar-check',   label: '保証期限',      type: 'date',     alertDays: 60 },
    { icon: 'fa-weight-hanging',   label: '重量',          type: 'number',   unit: 'kg',   validation: { min: 0 } },
    { icon: 'fa-temperature-half', label: '使用温度上限',  type: 'number',   unit: '℃' },
    { icon: 'fa-user',             label: '担当者',        type: 'text' },
    { icon: 'fa-square-check',     label: '点検済み',      type: 'checkbox' },
    { icon: 'fa-comment',          label: '備考',          type: 'textarea' },
];

// =============================================================================
// CSS スタイル注入
// =============================================================================
function injectCFStyles() {
    if(document.getElementById('cf-styles')) return;
    const s = document.createElement('style');
    s.id = 'cf-styles';
    s.textContent = `
        /* ── 2ペインレイアウト ── */
        .cf-two-pane {
            display: flex;
            width: 100%;
            height: 100%;
            overflow: hidden;
        }
        .cf-left-pane {
            flex: 1;
            min-width: 0;
            overflow-y: auto;
            padding: 24px 20px 32px;
            background: #f8fafc;
        }
        .cf-right-pane {
            width: 440px;
            flex-shrink: 0;
            border-left: 2px solid var(--border);
            background: #fff;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transition: width 0.2s ease;
        }
        .cf-right-pane.hidden { width: 0; border-left: none; overflow: hidden; }
        .cf-right-pane-header {
            padding: 16px 20px;
            border-bottom: 1px solid var(--border);
            background: #f8fafc;
            flex-shrink: 0;
        }
        .cf-right-pane-body {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        }
        /* ── 選択中タグカードのハイライト ── */
        .nested-card.cf-selected {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
        }
        .nested-card.cf-selected > .nested-card-header {
            background: #eff6ff;
        }
        /* ── フィールドアイテム ── */
        .cf-field-item {
            display: flex; align-items: center; gap: 12px;
            padding: 12px 14px;
            background: #f8fafc;
            border: 1px solid var(--border);
            border-radius: 10px;
            transition: all 0.15s;
            margin-bottom: 8px;
        }
        .cf-field-item:hover {
            background: #fff;
            box-shadow: 0 2px 10px rgba(0,0,0,0.07);
            border-color: #c7d2fe;
        }
        .cf-field-type-icon {
            width: 38px; height: 38px;
            border-radius: 10px; flex-shrink: 0;
            display: flex; align-items: center;
            justify-content: center; font-size: 1rem;
        }
        .cf-field-info { flex: 1; min-width: 0; }
        .cf-field-name { font-weight: 600; font-size: 0.92rem; color: var(--text); }
        .cf-field-meta {
            display: flex; align-items: center; gap: 4px;
            flex-wrap: wrap; margin-top: 4px;
        }
        .cf-field-actions { display: flex; gap: 4px; flex-shrink: 0; }
        /* ── 空状態 ── */
        .cf-empty-state {
            text-align: center; padding: 40px 20px;
            color: var(--text-sub); font-size: 0.9rem; line-height: 1.8;
        }
        /* ── プリセット ── */
        .cf-preset-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 8px; }
        .cf-preset-chip {
            display: inline-flex; align-items: center; gap: 5px;
            padding: 6px 13px; background: #f1f5f9;
            border: 1px solid #e2e8f0; border-radius: 20px;
            font-size: 0.82rem; cursor: pointer; color: #374151;
            transition: all 0.15s; font-family: inherit;
        }
        .cf-preset-chip:hover {
            background: var(--primary); border-color: var(--primary);
            color: #fff; box-shadow: 0 2px 8px rgba(37,99,235,0.25);
            transform: translateY(-1px);
        }
        .cf-preset-chip:hover i { color: #fff !important; }
        /* ── 種別セレクタ ── */
        .cf-type-grid {
            display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
            margin-bottom: 4px;
        }
        .cf-type-card {
            padding: 12px 8px; border: 2px solid #e2e8f0;
            border-radius: 10px; cursor: pointer;
            text-align: center; transition: all 0.15s;
            background: #fff; user-select: none;
        }
        .cf-type-card:hover { border-color: #93c5fd; background: #eff6ff; }
        .cf-type-card.selected {
            border-color: var(--primary); background: #eff6ff;
            box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
        }
        .cf-type-card.cf-type-disabled { pointer-events: none; }
        .cf-type-card.cf-type-disabled:not(.selected) { opacity: 0.3; }
        .cf-type-card i { font-size: 1.2rem; display: block; margin-bottom: 5px; }
        .cf-type-card-label { font-size: 0.76rem; font-weight: 700; color: var(--text); line-height: 1.2; }
        .cf-type-card-desc  { font-size: 0.64rem; color: var(--text-sub); line-height: 1.3; margin-top: 2px; }
        /* ── プレビューボックス ── */
        .cf-preview-box {
            padding: 16px; background: #f8fafc;
            border: 1px solid var(--border); border-radius: 10px;
            margin-top: 16px;
        }
        .cf-preview-header {
            font-size: 0.72rem; font-weight: 700; color: var(--text-sub);
            text-transform: uppercase; letter-spacing: 0.5px;
            margin-bottom: 10px; display: flex; align-items: center; gap: 5px;
        }
        .preview-label {
            display: block; font-size: 0.88rem; font-weight: 600;
            margin-bottom: 6px; color: var(--text);
        }
        .preview-input {
            width: 100%; padding: 8px 10px; border: 1px solid #d1d5db;
            border-radius: 6px; font-size: 0.88rem; background: #fff;
            box-sizing: border-box; font-family: inherit; color: #9ca3af;
        }
        select.preview-input { appearance: auto; cursor: default; }
        textarea.preview-input { resize: none; min-height: 64px; }
        .preview-hint {
            font-size: 0.78rem; color: #d97706; margin-top: 6px;
            display: flex; align-items: center; gap: 4px;
        }
        .cf-preview-type-badge {
            display: flex; align-items: center; gap: 7px;
            padding: 8px 12px; border-radius: 8px;
            font-size: 0.82rem; margin-top: 12px; font-weight: 600;
        }
        /* ── CF管理ボタン（タグカード上）── */
        .cf-mgr-btn {
            position: relative; display: inline-flex;
            align-items: center; justify-content: center;
        }
        .cf-badge {
            position: absolute; top: -5px; right: -5px;
            min-width: 16px; height: 16px; padding: 0 3px;
            background: var(--primary); color: #fff; border-radius: 10px;
            font-size: 0.62rem; display: flex; align-items: center;
            justify-content: center; font-weight: 700;
            line-height: 1; box-sizing: border-box; pointer-events: none;
        }
        /* ── セクションラベル ── */
        .cf-section-label {
            font-size: 0.74rem; font-weight: 700; color: var(--text-sub);
            margin-bottom: 10px; text-transform: uppercase;
            letter-spacing: 0.4px; display: flex; align-items: center; gap: 5px;
        }
        /* ── 右ペイン未選択プレースホルダー ── */
        .cf-no-selection {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; height: 100%;
            color: var(--text-sub); text-align: center; padding: 32px;
        }
    `;
    document.head.appendChild(s);
}

// =============================================================================
// ユーティリティ
// =============================================================================
function escapeAttr(str) {
    if(str === undefined || str === null) return '';
    return String(str)
        .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
        .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function generateFieldKey(label) {
    const base = String(label || 'field')
        .toLowerCase()
        .replace(/[^\x00-\x7F]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, 18) || 'field';
    return `${base}_${Date.now().toString(36)}`;
}

// =============================================================================
// openMasterModal
// =============================================================================
function openMasterModal() {
    document.getElementById('masterModal').classList.add('open');
    currentMasterMode = 'tags';
    switchMasterTab('tags');
    graphState.scale = 1;
    graphState.panX  = 0;
    graphState.panY  = 0;
    updateGraphTransform();
}

function addNewMasterDefinition() {
    const name = prompt("新しいマスタ定義の名称を入力してください（例: メーカー、契約形態）");
    if(name) {
        const newId = 'cust_' + Date.now();
        masters.push({ id: newId, name: name });
        currentMasterId = newId;
        renderMasterCats();
        loadEditor();
        renderSidebar();
        showToast('新規マスタ定義を追加しました');
    }
}

function renderMasterCats() {
    const list = document.getElementById('masterCategoryList');
    list.innerHTML = '';
    masters.forEach(m => {
        const btn = document.createElement('div');
        btn.className = `cat-btn ${currentMasterId === m.id ? 'active' : ''}`;
        btn.style.cssText = 'display:flex;align-items:center;gap:8px;padding:12px 16px;cursor:pointer;border-radius:8px;transition:all 0.2s;margin-bottom:4px;';
        if(currentMasterId === m.id) {
            btn.style.background = 'linear-gradient(135deg,#3b82f6 0%,#2563eb 100%)';
            btn.style.color      = '#fff';
            btn.style.boxShadow  = '0 2px 8px rgba(59,130,246,0.3)';
        } else {
            btn.style.background = '#f8fafc';
            btn.style.color      = '#334155';
        }
        btn.onmouseover = () => { if(currentMasterId !== m.id) btn.style.background = '#e2e8f0'; };
        btn.onmouseout  = () => { if(currentMasterId !== m.id) btn.style.background = '#f8fafc'; };

        const nameSpan = document.createElement('span');
        nameSpan.textContent = m.name;
        nameSpan.style.cssText = 'flex:1;font-weight:600;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;';
        nameSpan.title = m.name;
        nameSpan.onclick = () => { currentMasterId = m.id; renderMasterCats(); loadEditor(); };

        if(currentMasterId === m.id) {
            const actionsDiv = document.createElement('div');
            actionsDiv.style.cssText = 'display:flex;gap:2px;flex-shrink:0;';

            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-icon-only';
            editBtn.style.cssText = 'padding:6px;width:28px;height:28px;border-radius:6px;transition:all 0.2s;background:rgba(255,255,255,0.2);color:#fff;';
            editBtn.innerHTML = '<i class="fa-solid fa-pen" style="font-size:0.75rem;"></i>';
            editBtn.title = 'マスタ名を編集';
            editBtn.onmouseover = () => editBtn.style.background = 'rgba(255,255,255,0.3)';
            editBtn.onmouseout  = () => editBtn.style.background = 'rgba(255,255,255,0.2)';
            editBtn.onclick = (e) => { e.stopPropagation(); editMasterName(m.id); };

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-icon-only';
            deleteBtn.style.cssText = 'padding:6px;width:28px;height:28px;border-radius:6px;transition:all 0.2s;background:rgba(239,68,68,0.15);color:#fecaca;';
            deleteBtn.innerHTML = '<i class="fa-solid fa-trash" style="font-size:0.75rem;"></i>';
            deleteBtn.title = 'マスタを削除';
            deleteBtn.onmouseover = () => { deleteBtn.style.background='rgba(239,68,68,0.25)'; deleteBtn.style.color='#fff'; };
            deleteBtn.onmouseout  = () => { deleteBtn.style.background='rgba(239,68,68,0.15)'; deleteBtn.style.color='#fecaca'; };
            deleteBtn.onclick = (e) => { e.stopPropagation(); deleteMaster(m.id); };

            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(deleteBtn);
            btn.appendChild(nameSpan);
            btn.appendChild(actionsDiv);
        } else {
            btn.appendChild(nameSpan);
        }

        const chevron = document.createElement('i');
        chevron.className = 'fa-solid fa-chevron-right';
        chevron.style.cssText = 'font-size:0.7rem;flex-shrink:0;transition:transform 0.2s;';
        chevron.style.color = currentMasterId === m.id ? '#fff' : '#94a3b8';
        if(currentMasterId === m.id) chevron.style.transform = 'translateX(2px)';
        btn.appendChild(chevron);

        list.appendChild(btn);
    });
}

function switchView(view) {
    currentView = view;
    const btnList  = document.getElementById('btnMasterViewList');
    const btnGraph = document.getElementById('btnMasterViewGraph');
    [btnList, btnGraph].forEach(b => setToggleInactive(b));
    setToggleActive(view === 'list' ? btnList : btnGraph);

    if(currentMasterMode === 'assets') {
        const lv = document.getElementById('assetsListView');
        const gv = document.getElementById('assetsGraphView');
        if(view === 'list') { lv.style.display='block'; lv.className='list-editor-container'; gv.style.display='none'; }
        else                { lv.style.display='none'; gv.style.display='block'; gv.className='graph-wrapper'; }
        loadAssetsEditor();
        if(view === 'graph') setTimeout(() => autoFitAssetsGraph(), 100);
    } else {
        const lv = document.getElementById('listView');
        const gv = document.getElementById('graphView');
        if(view === 'list') { lv.style.display='block'; lv.className='list-editor-container'; gv.style.display='none'; }
        else                { lv.style.display='none'; gv.style.display='block'; gv.className='graph-wrapper'; }
        loadEditor();
        if(view === 'graph') setTimeout(() => autoFitGraph(), 100);
    }
}

function loadEditor() {
    selectedElement = null;
    if(currentView === 'list') renderListView();
    else renderGraphView();
}

// =============================================================================
// renderListView ── 2ペイン構造
// =============================================================================
function renderListView() {
    injectCFStyles();

    const container = document.getElementById('listView');
    // max-width 制約を解除してモーダルの全幅を活用
    container.className   = '';
    container.style.cssText = 'width:100%;height:100%;overflow:hidden;';
    container.innerHTML   = '';
    currentDetailTagId    = null;
    cfPaneMode            = 'list';
    cfEditIndex           = null;

    const twoPane = document.createElement('div');
    twoPane.className = 'cf-two-pane';

    const leftPane = document.createElement('div');
    leftPane.className = 'cf-left-pane';
    leftPane.id = 'cf-left-pane';
    _buildTagTreeInto(leftPane);

    const rightPane = document.createElement('div');
    rightPane.className = 'cf-right-pane hidden';
    rightPane.id = 'cf-right-pane';
    _renderRightPanePlaceholder(rightPane);

    twoPane.appendChild(leftPane);
    twoPane.appendChild(rightPane);
    container.appendChild(twoPane);
}

// =============================================================================
// 左ペイン：タグツリー構築
// =============================================================================
function _buildTagTreeInto(pane) {
    pane.innerHTML = '';
    const currentTags = tags.filter(t => t.masterId === currentMasterId);

    // 操作ガイド（折り畳み）
    const helpWrap   = document.createElement('div');
    helpWrap.style.cssText = 'margin-bottom:16px;';
    const helpToggle = document.createElement('div');
    helpToggle.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;transition:background 0.2s;font-size:0.88rem;color:#475569;';
    helpToggle.onmouseover = () => helpToggle.style.background = '#f1f5f9';
    helpToggle.onmouseout  = () => helpToggle.style.background = '#fff';
    helpToggle.innerHTML = `
        <i class="fa-solid fa-info-circle" style="color:#3b82f6;font-size:0.9rem;"></i>
        <span style="font-weight:600;">操作方法と階層構造のルール</span>
        <i class="fa-solid fa-chevron-down" id="helpChevron"
           style="margin-left:auto;color:#94a3b8;transition:transform 0.2s;font-size:0.75rem;"></i>
    `;
    const helpContent = document.createElement('div');
    helpContent.style.cssText = 'display:none;margin-top:8px;padding:16px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;font-size:0.85rem;';
    helpContent.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;">
            <div>
                <div style="font-weight:700;margin-bottom:8px;color:#475569;display:flex;align-items:center;gap:6px;">
                    <i class="fa-solid fa-pencil" style="color:#8b5cf6;"></i>基本操作
                </div>
                <ul style="margin:0;padding-left:16px;color:#64748b;line-height:1.9;">
                    <li><strong>タグ名編集:</strong> タグ名をクリック</li>
                    <li><strong>階層移動:</strong> ドラッグ&amp;ドロップ</li>
                    <li><strong>子要素追加:</strong> 「+」ボタン</li>
                    <li><strong>固有項目管理:</strong> <i class="fa-solid fa-sliders" style="color:var(--primary);"></i> ボタン → 右ペインで設定</li>
                </ul>
            </div>
            <div>
                <div style="font-weight:700;margin-bottom:8px;color:#475569;display:flex;align-items:center;gap:6px;">
                    <i class="fa-solid fa-sitemap" style="color:#3b82f6;"></i>階層のルール
                </div>
                <ul style="margin:0;padding-left:16px;color:#64748b;line-height:1.9;">
                    <li>同じ階層レベルなら複数の親を持てる</li>
                    <li>階層を飛ばす接続は自動調整</li>
                    <li>循環参照は作成不可</li>
                </ul>
            </div>
            <div>
                <div style="font-weight:700;margin-bottom:8px;color:#475569;display:flex;align-items:center;gap:6px;">
                    <i class="fa-solid fa-sliders" style="color:var(--primary);"></i>固有の入力項目とは
                </div>
                <div style="color:#64748b;line-height:1.7;">
                    <i class="fa-solid fa-sliders" style="color:var(--primary);"></i> ボタンで右ペインを開くと、そのタグが選択された資産にだけ表示される専用の入力欄を設定できます。
                </div>
            </div>
        </div>
    `;
    helpToggle.onclick = () => {
        const isOpen = helpContent.style.display !== 'none';
        helpContent.style.display = isOpen ? 'none' : 'block';
        helpToggle.querySelector('#helpChevron').style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
    };
    helpWrap.appendChild(helpToggle);
    helpWrap.appendChild(helpContent);
    pane.appendChild(helpWrap);

    // 複数親識別
    const multiParentNodes = new Set();
    currentTags.forEach(t => { if(t.parentIds.length > 1) multiParentNodes.add(t.id); });

    const getNodeColor = (nodeId) => {
        if(!multiParentNodes.has(nodeId)) return 'transparent';
        let hash = 0;
        const str = nodeId.toString();
        for(let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        return `hsla(${Math.abs(hash % 360)},70%,95%,0.8)`;
    };

    const getChildrenOf = (parentId) => currentTags.filter(t => t.parentIds.includes(parentId));
    const roots = currentTags.filter(t =>
        t.parentIds.length === 0 || !currentTags.some(p => t.parentIds.includes(p.id))
    );

    const createCard = (tag, parentId = null) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'nested-card';
        wrapper.id = `tag-card-${tag.id}`;

        const header = document.createElement('div');
        header.className = 'nested-card-header';
        header.draggable = true;

        const bgColor = getNodeColor(tag.id);
        if(bgColor !== 'transparent') header.style.background = bgColor;

        header.ondragstart = (e) => { e.dataTransfer.setData('text/id', tag.id); wrapper.classList.add('dragging'); };
        header.ondragend   = () => wrapper.classList.remove('dragging');
        header.ondragover  = (e) => { e.preventDefault(); header.style.background = bgColor !== 'transparent' ? bgColor : '#eff6ff'; };
        header.ondragleave = () => { header.style.background = bgColor; };
        header.ondrop      = (e) => {
            e.preventDefault();
            header.style.background = bgColor;
            const childId = parseInt(e.dataTransfer.getData('text/id'));
            if(childId !== tag.id) linkParent(childId, tag.id);
        };

        const uniqueId  = parentId !== null ? `tag-name-${tag.id}-p${parentId}` : `tag-name-${tag.id}`;
        const multiIcon = multiParentNodes.has(tag.id)
            ? `<i class="fa-solid fa-link" style="color:#3b82f6;font-size:0.75rem;margin-right:4px;" title="複数の親に所属"></i>` : '';
        const cfCount = (tag.customFields || []).length;

        header.innerHTML = `
            <i class="fa-solid fa-grip-vertical" style="color:#cbd5e1;"></i>
            ${multiIcon}
            <span id="${uniqueId}" data-tag-id="${tag.id}"
                  style="font-weight:600;cursor:pointer;padding:4px 8px;border-radius:4px;transition:background 0.15s;flex:1;min-width:0;"
                  onclick="startEditTagNameInList(${tag.id},'${uniqueId}')"
                  onmouseover="this.style.background='rgba(0,0,0,0.05)'"
                  onmouseout="this.style.background='transparent'"
                  title="クリックして名前を編集">${tag.name}</span>
            <div class="card-actions">
                <button class="btn btn-icon-only btn-ghost cf-mgr-btn"
                        id="cf-btn-${tag.id}"
                        onclick="openCFRightPane(${tag.id})"
                        title="固有の入力項目を右ペインで管理">
                    <i class="fa-solid fa-sliders"></i>
                    ${cfCount > 0 ? `<span class="cf-badge">${cfCount}</span>` : ''}
                </button>
                <button class="btn btn-icon-only btn-ghost"
                        onclick="addNewChild(${tag.id})" title="子要素を追加">
                    <i class="fa-solid fa-plus"></i>
                </button>
                <button class="btn btn-icon-only btn-ghost" style="color:var(--danger);"
                        onclick="deleteTag(${tag.id})" title="削除">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        wrapper.appendChild(header);

        const children = getChildrenOf(tag.id);
        if(children.length > 0) {
            const cc = document.createElement('div');
            cc.className = 'nested-children';
            children.forEach(c => cc.appendChild(createCard(c, tag.id)));
            wrapper.appendChild(cc);
        }
        return wrapper;
    };

    roots.forEach(r => pane.appendChild(createCard(r)));

    const dropZone = document.createElement('div');
    dropZone.style.cssText = 'padding:20px;border:2px dashed #cbd5e1;border-radius:8px;text-align:center;color:#94a3b8;margin-top:20px;background:#fafbfc;font-size:0.88rem;';
    dropZone.innerText = 'ここにドロップしてルート（親なし）にする';
    dropZone.ondragover = (e) => e.preventDefault();
    dropZone.ondrop     = (e) => { e.preventDefault(); makeRoot(parseInt(e.dataTransfer.getData('text/id'))); };
    pane.appendChild(dropZone);
}

// =============================================================================
// 右ペイン：開閉・切り替え
// =============================================================================

function openCFRightPane(tagId) {
    const rightPane = document.getElementById('cf-right-pane');
    if(!rightPane) return;

    // ハイライトをリセット
    document.querySelectorAll('.nested-card.cf-selected')
            .forEach(el => el.classList.remove('cf-selected'));

    // 同タグを再クリック → 閉じる
    if(currentDetailTagId === tagId && !rightPane.classList.contains('hidden')) {
        _closeRightPane();
        return;
    }

    currentDetailTagId = tagId;
    cfPaneMode  = 'list';
    cfEditIndex = null;

    document.getElementById(`tag-card-${tagId}`)?.classList.add('cf-selected');
    rightPane.classList.remove('hidden');
    _renderRightPaneCFList(tagId);
}

function _closeRightPane() {
    const pane = document.getElementById('cf-right-pane');
    if(pane) pane.classList.add('hidden');
    document.querySelectorAll('.nested-card.cf-selected')
            .forEach(el => el.classList.remove('cf-selected'));
    currentDetailTagId = null;
}

function _renderRightPanePlaceholder(pane) {
    pane.innerHTML = `
        <div class="cf-no-selection">
            <i class="fa-solid fa-sliders" style="font-size:3rem;opacity:0.12;margin-bottom:16px;"></i>
            <div style="font-weight:600;font-size:0.95rem;margin-bottom:8px;color:#b0bec5;">
                タグを選択してください
            </div>
            <div style="font-size:0.83rem;color:#cfd8dc;line-height:1.8;">
                左のタグカードにある
                <i class="fa-solid fa-sliders" style="font-size:0.8rem;"></i>
                ボタンをクリックすると、<br>
                そのタグの固有入力項目をここで設定できます。
            </div>
        </div>
    `;
}

// =============================================================================
// 右ペイン：CF一覧ビュー
// =============================================================================
function _renderRightPaneCFList(tagId) {
    const pane = document.getElementById('cf-right-pane');
    if(!pane) return;
    const tag    = tags.find(t => t.id === tagId);
    if(!tag) return;
    const fields = tag.customFields || [];
    cfPaneMode   = 'list';
    cfEditIndex  = null;

    pane.innerHTML = `
        <div class="cf-right-pane-header">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                    <i class="fa-solid fa-tag" style="color:var(--primary);font-size:0.88rem;flex-shrink:0;"></i>
                    <span style="font-weight:700;font-size:0.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                          title="${escapeAttr(tag.name)}">${tag.name}</span>
                    ${fields.length > 0
                        ? `<span class="badge badge-blue" style="font-size:0.73rem;flex-shrink:0;">${fields.length}件</span>`
                        : ''}
                </div>
                <button class="btn-close" onclick="_closeRightPane()" title="閉じる" style="flex-shrink:0;">
                    <i class="fa-solid fa-xmark" style="font-size:0.85rem;"></i>
                </button>
            </div>
            <div style="margin-top:10px;font-size:0.8rem;color:var(--text-sub);line-height:1.5;
                        padding:8px 10px;background:#e8f0fe;border-radius:6px;border-left:3px solid var(--primary);">
                このタグが選択された資産にだけ表示される専用の入力欄を設定できます。
            </div>
        </div>

        <div class="cf-right-pane-body">
            <!-- プリセット -->
            <div style="margin-bottom:22px;">
                <div class="cf-section-label">
                    <i class="fa-solid fa-bolt" style="color:#f59e0b;"></i> テンプレートから追加
                </div>
                <div class="cf-preset-chips">
                    ${FIELD_PRESETS.map((p, i) => `
                        <button class="cf-preset-chip" onclick="applyFieldPreset(${i},${tagId})">
                            <i class="fa-solid ${p.icon}"
                               style="font-size:0.78rem;color:${(FIELD_TYPE_UI[p.type]||{}).color||'var(--primary)'};"></i>
                            ${p.label}
                        </button>
                    `).join('')}
                </div>
            </div>

            <!-- 設定済み一覧 -->
            <div>
                <div class="cf-section-label">
                    <i class="fa-solid fa-list"></i> 設定済みの項目
                    <button class="btn btn-sm btn-primary"
                            style="margin-left:auto;padding:4px 12px;font-size:0.78rem;"
                            onclick="_renderRightPaneCFForm(${tagId},null)">
                        <i class="fa-solid fa-plus"></i> 手動で作成
                    </button>
                </div>
                ${fields.length === 0 ? `
                    <div class="cf-empty-state">
                        <i class="fa-solid fa-plus-circle"
                           style="font-size:2rem;opacity:0.15;display:block;margin-bottom:12px;"></i>
                        まだ入力項目がありません。<br>
                        上のテンプレートか「手動で作成」をご利用ください。
                    </div>
                ` : fields.map((f, i) => _fieldItemHTML(f, i, tagId)).join('')}
            </div>
        </div>
    `;
}

function _fieldItemHTML(field, index, tagId) {
    const ui = FIELD_TYPE_UI[field.type] || FIELD_TYPE_UI.text;
    const chips = [];
    if(field.required)   chips.push('<span class="badge badge-red" style="font-size:0.7rem;">必須</span>');
    if(field.unit)       chips.push(`<span class="badge badge-gray" style="font-size:0.7rem;">単位: ${field.unit}</span>`);
    if(field.alertDays)  chips.push(`<span class="badge badge-orange" style="font-size:0.7rem;"><i class="fa-solid fa-bell" style="margin-right:2px;"></i>${field.alertDays}日前</span>`);
    if(field.options)    chips.push(`<span class="badge badge-gray" style="font-size:0.7rem;">${field.options.length}択</span>`);
    if(field.validation?.min !== undefined || field.validation?.max !== undefined) {
        chips.push(`<span class="badge badge-gray" style="font-size:0.7rem;">${field.validation?.min ?? '−'}〜${field.validation?.max ?? '−'}</span>`);
    }
    return `
        <div class="cf-field-item">
            <div class="cf-field-type-icon" style="background:${ui.color}1a;color:${ui.color};">
                <i class="fa-solid ${ui.icon}"></i>
            </div>
            <div class="cf-field-info">
                <div class="cf-field-name">${field.label}</div>
                <div class="cf-field-meta">
                    <span style="color:${ui.color};font-size:0.78rem;font-weight:600;">${ui.label}</span>
                    ${chips.join('')}
                </div>
            </div>
            <div class="cf-field-actions">
                <button class="btn btn-icon-only btn-ghost"
                        onclick="_renderRightPaneCFForm(${tagId},${index})" title="編集">
                    <i class="fa-solid fa-pen" style="font-size:0.78rem;"></i>
                </button>
                <button class="btn btn-icon-only btn-ghost btn-danger-ghost"
                        onclick="deleteCustomField(${tagId},${index})" title="削除">
                    <i class="fa-solid fa-trash" style="font-size:0.78rem;"></i>
                </button>
            </div>
        </div>
    `;
}

// =============================================================================
// 右ペイン：CF追加 / 編集フォーム
// =============================================================================
function _renderRightPaneCFForm(tagId, fieldIndex) {
    const pane = document.getElementById('cf-right-pane');
    if(!pane) return;
    const tag    = tags.find(t => t.id === tagId);
    if(!tag) return;
    const isEdit = fieldIndex !== null;
    const field  = isEdit ? (tag.customFields || [])[fieldIndex] : { label:'', type:'text', required:false };
    if(!field) return;

    cfPaneMode  = 'form';
    cfEditIndex = fieldIndex;

    const typeGridHTML = Object.entries(FIELD_TYPE_UI).map(([type, ui]) => `
        <div class="cf-type-card ${field.type === type ? 'selected' : ''} ${isEdit ? 'cf-type-disabled' : ''}"
             data-type="${type}"
             ${isEdit ? '' : `onclick="selectFieldType('${type}',${tagId})"`}
             title="${ui.desc}">
            <i class="fa-solid ${ui.icon}" style="color:${ui.color};"></i>
            <div class="cf-type-card-label">${ui.label}</div>
            <div class="cf-type-card-desc">${ui.desc}</div>
        </div>
    `).join('');

    pane.innerHTML = `
        <div class="cf-right-pane-header">
            <div style="display:flex;align-items:center;gap:8px;">
                <button class="btn btn-ghost btn-sm"
                        onclick="_renderRightPaneCFList(${tagId})"
                        style="padding:4px 10px;flex-shrink:0;">
                    <i class="fa-solid fa-arrow-left" style="font-size:0.78rem;"></i> 一覧に戻る
                </button>
                <span style="font-weight:700;font-size:0.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${isEdit ? `「${field.label}」を編集` : '新しい入力項目を追加'}
                </span>
            </div>
            ${isEdit ? `
                <div style="margin-top:8px;font-size:0.78rem;color:var(--text-sub);
                            padding:6px 10px;background:#f1f5f9;border-radius:6px;">
                    入力の種類は追加後に変更できません。
                </div>` : ''}
        </div>

        <div class="cf-right-pane-body">

            <!-- 項目名 -->
            <div class="form-group" style="margin-bottom:18px;">
                <label style="font-size:0.88rem;">
                    項目名 <span style="color:var(--danger);margin-left:2px;">*</span>
                    <small style="color:var(--text-sub);font-weight:400;margin-left:6px;">
                        資産登録画面に表示されるラベル
                    </small>
                </label>
                <input type="text" id="cf-label"
                       value="${escapeAttr(field.label)}"
                       placeholder="例: 走行距離、次回点検日、担当者名"
                       oninput="updateFieldPreview(${tagId})"
                       style="font-size:0.95rem;">
            </div>

            <!-- 入力の種類 -->
            <div class="form-group" style="margin-bottom:18px;">
                <label style="font-size:0.88rem;">
                    入力の種類 <span style="color:var(--danger);margin-left:2px;">*</span>
                </label>
                <div class="cf-type-grid">${typeGridHTML}</div>
                <input type="hidden" id="cf-type" value="${field.type}">
            </div>

            <!-- 型別オプション -->
            <div id="cf-type-options">${_renderTypeOptions(field)}</div>

            <!-- 必須 -->
            <div class="form-group" style="margin-top:4px;margin-bottom:20px;">
                <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-weight:normal;">
                    <input type="checkbox" id="cf-required"
                           ${field.required ? 'checked' : ''}
                           onchange="updateFieldPreview(${tagId})"
                           style="margin-top:3px;flex-shrink:0;">
                    <div>
                        <span style="font-weight:600;font-size:0.88rem;">必須項目にする</span>
                        <div style="font-size:0.78rem;color:var(--text-sub);margin-top:2px;">
                            この欄が空のまま資産を保存できなくなります
                        </div>
                    </div>
                </label>
            </div>

            <!-- プレビュー -->
            <div id="cf-preview-box" class="cf-preview-box"></div>

            <!-- ボタン -->
            <div style="display:flex;justify-content:flex-end;gap:8px;
                        margin-top:20px;padding-top:16px;border-top:1px solid var(--border);">
                <button class="btn btn-ghost" onclick="_renderRightPaneCFList(${tagId})">
                    キャンセル
                </button>
                <button class="btn btn-primary"
                        onclick="saveCustomField(${tagId},${isEdit ? fieldIndex : 'null'})">
                    <i class="fa-solid fa-check"></i>
                    ${isEdit ? '変更を保存' : '追加する'}
                </button>
            </div>
        </div>
    `;

    // textarea は innerHTML で value が反映されないため手動セット
    if(field.type === 'select' && field.options) {
        const ta = document.getElementById('cf-options');
        if(ta) ta.value = field.options.join('\n');
    }

    updateFieldPreview(tagId);
}

// =============================================================================
// 種別カード選択 / プレビュー
// =============================================================================
function selectFieldType(type, tagId) {
    const hidden = document.getElementById('cf-type');
    if(!hidden) return;
    hidden.value = type;
    document.querySelectorAll('.cf-type-card').forEach(c => {
        c.classList.toggle('selected', c.dataset.type === type);
    });
    document.getElementById('cf-type-options').innerHTML = _renderTypeOptions({ type });
    updateFieldPreview(tagId);
}

function updateFieldPreview(tagId) {
    const box = document.getElementById('cf-preview-box');
    if(!box) return;
    const label     = document.getElementById('cf-label')?.value      || '';
    const type      = document.getElementById('cf-type')?.value       || 'text';
    const required  = document.getElementById('cf-required')?.checked || false;
    const unit      = document.getElementById('cf-unit')?.value       || '';
    const alertDays = parseInt(document.getElementById('cf-alertDays')?.value) || null;
    const options   = document.getElementById('cf-options')?.value
        ?.split('\n').map(o => o.trim()).filter(Boolean) || [];
    box.innerHTML = _previewHTML({ label, type, required, unit, alertDays, options });
}

function _previewHTML(field) {
    const ui    = FIELD_TYPE_UI[field.type] || FIELD_TYPE_UI.text;
    const label = field.label || '（項目名を入力してください）';
    let inputHTML = '';
    switch(field.type) {
        case 'number':
            inputHTML = `
                <div style="display:flex;align-items:center;gap:6px;">
                    <input type="number" class="preview-input" style="flex:1;" placeholder="0" disabled>
                    ${field.unit ? `<span style="font-size:0.84rem;color:var(--text-sub);white-space:nowrap;">${field.unit}</span>` : ''}
                </div>`;
            break;
        case 'date':
            inputHTML = `<input type="date" class="preview-input" disabled>`;
            if(field.alertDays) inputHTML += `
                <div class="preview-hint">
                    <i class="fa-solid fa-bell"></i> 期限の${field.alertDays}日前からダッシュボードにアラート表示
                </div>`;
            break;
        case 'select': {
            const opts = field.options?.length
                ? field.options.map(o => `<option>${o}</option>`).join('')
                : '<option>（選択肢を入力してください）</option>';
            inputHTML = `<select class="preview-input" disabled>${opts}</select>`;
            break;
        }
        case 'checkbox':
            inputHTML = `
                <label style="display:flex;align-items:center;gap:8px;cursor:default;color:#9ca3af;font-size:0.9rem;">
                    <input type="checkbox" disabled> はい（チェックする）
                </label>`;
            break;
        case 'textarea':
            inputHTML = `<textarea class="preview-input" rows="3" placeholder="テキストを入力..." disabled></textarea>`;
            break;
        default:
            inputHTML = `<input type="text" class="preview-input" placeholder="テキストを入力..." disabled>`;
    }
    return `
        <div class="cf-preview-header">
            <i class="fa-solid fa-eye"></i> 入力画面のプレビュー
        </div>
        <div style="margin-bottom:10px;">
            <label class="preview-label">
                ${label}${field.required ? '<span style="color:var(--danger);margin-left:2px;">*</span>' : ''}
            </label>
            ${inputHTML}
        </div>
        <div class="cf-preview-type-badge" style="background:${ui.color}18;color:${ui.color};">
            <i class="fa-solid ${ui.icon}"></i>
            <span>${ui.label}</span>
            <span style="font-weight:400;opacity:0.65;font-size:0.78rem;">— ${ui.desc}</span>
        </div>
    `;
}

function _renderTypeOptions(field) {
    let inner = '';
    switch(field.type) {
        case 'number':
            inner = `
                <div class="form-group">
                    <label style="font-size:0.88rem;">単位（オプション）</label>
                    <input type="text" id="cf-unit" value="${escapeAttr(field.unit)}"
                           placeholder="例: km, kg, 個" oninput="updateFieldPreview()">
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div class="form-group">
                        <label style="font-size:0.88rem;">最小値</label>
                        <input type="number" id="cf-min"
                               value="${field.validation?.min !== undefined ? field.validation.min : ''}"
                               placeholder="下限なし">
                    </div>
                    <div class="form-group">
                        <label style="font-size:0.88rem;">最大値</label>
                        <input type="number" id="cf-max"
                               value="${field.validation?.max !== undefined ? field.validation.max : ''}"
                               placeholder="上限なし">
                    </div>
                </div>`;
            break;
        case 'text':
            inner = `
                <div class="form-group">
                    <label style="font-size:0.88rem;">最大文字数（オプション）</label>
                    <input type="number" id="cf-maxLength" value="${escapeAttr(field.maxLength)}"
                           min="1" placeholder="制限なし">
                </div>
                <div class="form-group">
                    <label style="font-size:0.88rem;">入力パターン（オプション・上級者向け）</label>
                    <input type="text" id="cf-pattern" value="${escapeAttr(field.pattern)}"
                           placeholder="例: ^[0-9]{3}-[0-9]{4}$">
                    <small>正規表現で入力値を検証します</small>
                </div>`;
            break;
        case 'date':
            inner = `
                <div class="form-group">
                    <label style="font-size:0.88rem;">アラートの日数（オプション）</label>
                    <input type="number" id="cf-alertDays" value="${escapeAttr(field.alertDays)}"
                           min="1" placeholder="例: 30" oninput="updateFieldPreview()">
                    <small>期限の何日前からダッシュボードに警告を表示するか</small>
                </div>`;
            break;
        case 'select':
            inner = `
                <div class="form-group">
                    <label style="font-size:0.88rem;">
                        選択肢（1行に1つ） <span style="color:var(--danger);">*</span>
                    </label>
                    <textarea id="cf-options" rows="5"
                              placeholder="選択肢A&#10;選択肢B&#10;選択肢C"
                              oninput="updateFieldPreview()"></textarea>
                    <small>空行は無視されます</small>
                </div>`;
            break;
        case 'textarea':
            inner = `
                <div class="form-group">
                    <label style="font-size:0.88rem;">最大文字数（オプション）</label>
                    <input type="number" id="cf-maxLength" value="${escapeAttr(field.maxLength)}"
                           min="1" placeholder="制限なし">
                </div>`;
            break;
    }
    if(!inner) return '';
    const ui = FIELD_TYPE_UI[field.type];
    return `
        <div class="type-options-section" style="margin-bottom:16px;">
            <div class="type-options-section-header">
                <i class="fa-solid ${ui?.icon||'fa-sliders'}" style="color:${ui?.color||'var(--primary)'};"></i>
                「${ui?.label || field.type}」の詳細設定
            </div>
            ${inner}
        </div>`;
}

// =============================================================================
// プリセット追加 / バッジ更新
// =============================================================================
function applyFieldPreset(presetIndex, tagId) {
    const preset = FIELD_PRESETS[presetIndex];
    if(!preset) return;
    const tag = tags.find(t => t.id === tagId);
    if(!tag) return;
    if(!tag.customFields) tag.customFields = [];

    if(tag.customFields.some(f => f.label === preset.label)) {
        showToast(`「${preset.label}」は既に追加されています`, 'warning');
        return;
    }
    const fieldData = {
        key: generateFieldKey(preset.label), label: preset.label,
        type: preset.type, required: false,
        ...(preset.unit       && { unit:       preset.unit }),
        ...(preset.alertDays  && { alertDays:  preset.alertDays }),
        ...(preset.validation && { validation: preset.validation }),
    };
    tag.customFields.push(fieldData);
    autoSaveData();
    addCustomFieldColumns();
    _updateCFBadge(tagId);
    showToast(`「${preset.label}」を追加しました`);
    _renderRightPaneCFList(tagId);
}

function _updateCFBadge(tagId) {
    const btn = document.getElementById(`cf-btn-${tagId}`);
    if(!btn) return;
    const tag   = tags.find(t => t.id === tagId);
    const count = (tag?.customFields || []).length;
    let badge   = btn.querySelector('.cf-badge');
    if(count > 0) {
        if(!badge) { badge = document.createElement('span'); badge.className = 'cf-badge'; btn.appendChild(badge); }
        badge.textContent = count;
    } else {
        badge?.remove();
    }
}

// =============================================================================
// saveCustomField / deleteCustomField
// =============================================================================
function saveCustomField(tagId, fieldIndex) {
    const tag = tags.find(t => t.id === tagId);
    if(!tag) return;
    if(!tag.customFields) tag.customFields = [];

    const label    = document.getElementById('cf-label')?.value.trim();
    const type     = document.getElementById('cf-type')?.value;
    const required = document.getElementById('cf-required')?.checked || false;

    if(!label) { showToast('項目名を入力してください', 'error'); document.getElementById('cf-label')?.focus(); return; }
    if(!type)  { showToast('入力の種類を選択してください', 'error'); return; }

    const isEdit     = fieldIndex !== null;
    const isDupLabel = tag.customFields.some((f, i) => f.label === label && i !== fieldIndex);
    if(isDupLabel) {
        showToast(`「${label}」という項目名は既に使用されています`, 'error');
        document.getElementById('cf-label')?.focus();
        return;
    }

    const key = isEdit ? tag.customFields[fieldIndex].key : generateFieldKey(label);
    const fieldData = { key, label, type, required };

    switch(type) {
        case 'number': {
            const unit = document.getElementById('cf-unit')?.value.trim();
            if(unit) fieldData.unit = unit;
            const min = document.getElementById('cf-min')?.value;
            const max = document.getElementById('cf-max')?.value;
            if((min !== '' && min != null) || (max !== '' && max != null)) {
                fieldData.validation = {};
                if(min !== '' && min != null) fieldData.validation.min = parseFloat(min);
                if(max !== '' && max != null) fieldData.validation.max = parseFloat(max);
            }
            break;
        }
        case 'text': {
            const ml = document.getElementById('cf-maxLength')?.value;
            if(ml) fieldData.maxLength = parseInt(ml);
            const pt = document.getElementById('cf-pattern')?.value.trim();
            if(pt) fieldData.pattern = pt;
            break;
        }
        case 'date': {
            const ad = document.getElementById('cf-alertDays')?.value;
            if(ad) fieldData.alertDays = parseInt(ad);
            break;
        }
        case 'select': {
            const optText = document.getElementById('cf-options')?.value;
            if(!optText?.trim()) { showToast('選択肢を入力してください', 'error'); document.getElementById('cf-options')?.focus(); return; }
            const opts = optText.split('\n').map(o => o.trim()).filter(Boolean);
            if(opts.length === 0) { showToast('有効な選択肢を入力してください', 'error'); return; }
            fieldData.options = opts;
            break;
        }
        case 'textarea': {
            const ml = document.getElementById('cf-maxLength')?.value;
            if(ml) fieldData.maxLength = parseInt(ml);
            break;
        }
    }

    if(isEdit) { tag.customFields[fieldIndex] = fieldData; showToast('入力項目を更新しました'); }
    else       { tag.customFields.push(fieldData);         showToast('入力項目を追加しました'); }

    autoSaveData();
    addCustomFieldColumns();
    _updateCFBadge(tagId);
    _renderRightPaneCFList(tagId);
}

function deleteCustomField(tagId, fieldIndex) {
    const tag = tags.find(t => t.id === tagId);
    if(!tag?.customFields) return;
    const field = tag.customFields[fieldIndex];
    if(!confirm(`入力項目「${field.label}」を削除しますか？\n登録済みの資産データからも削除されます。`)) return;

    tag.customFields.splice(fieldIndex, 1);
    assets.forEach(asset => {
        if(asset.customAttributes?.[tagId]) {
            delete asset.customAttributes[tagId][field.key];
            if(Object.keys(asset.customAttributes[tagId]).length === 0) delete asset.customAttributes[tagId];
        }
    });

    autoSaveData();
    addCustomFieldColumns();
    _updateCFBadge(tagId);
    showToast('入力項目を削除しました');
    _renderRightPaneCFList(tagId);
}

// 後方互換
function renderTagDetail(tagId)     { openCFRightPane(tagId); }
function showTagDetailInList(tagId) { openCFRightPane(tagId); }

// =============================================================================
// 資産構成管理
// =============================================================================
function switchMasterTab(mode) {
    currentMasterMode = mode;
    const btnTags    = document.getElementById('btnMasterTabTags');
    const btnAssets  = document.getElementById('btnMasterTabAssets');
    const tagsArea   = document.getElementById('tagsEditorArea');
    const assetsArea = document.getElementById('assetsEditorArea');
    const titleEl    = document.getElementById('masterModalTitle');
    [btnTags, btnAssets].forEach(b => setToggleInactive(b));
    setToggleActive(mode === 'tags' ? btnTags : btnAssets);
    if(mode === 'tags') {
        tagsArea.style.display = 'flex'; assetsArea.style.display = 'none';
        titleEl.textContent = 'タグ管理';
        renderMasterCats(); loadEditor();
    } else {
        tagsArea.style.display = 'none'; assetsArea.style.display = 'flex';
        titleEl.textContent = '資産構成管理';
        loadAssetsEditor();
    }
}

function saveMasterChanges() {
    renderSidebar(); autoSaveData();
    showToast('設定を保存しました');
    closeModal('masterModal');
}

function loadAssetsEditor() {
    if(currentView === 'list') renderAssetsListView();
    else showAssetsGraphView();
}

function renderAssetsListView() {
    const container = document.getElementById('assetsListView');
    container.innerHTML = ''; container.className = 'list-editor-container'; container.style.display = 'block';
    document.getElementById('assetsGraphView').style.display = 'none';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%;';

    const helpSection  = document.createElement('div');
    helpSection.style.cssText = 'margin-bottom:16px;';
    const helpToggle   = document.createElement('div');
    helpToggle.style.cssText = 'display:flex;align-items:center;gap:8px;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;transition:background 0.2s;';
    helpToggle.onmouseover = () => helpToggle.style.background = '#f1f5f9';
    helpToggle.onmouseout  = () => helpToggle.style.background = '#f8fafc';
    helpToggle.innerHTML = `
        <i class="fa-solid fa-info-circle" style="color:#3b82f6;font-size:1rem;"></i>
        <span style="font-weight:600;color:#1e293b;font-size:0.95rem;">資産構成管理について</span>
        <i class="fa-solid fa-chevron-down" id="assetHelpChevron"
           style="margin-left:auto;color:#64748b;transition:transform 0.2s;"></i>
    `;
    const helpContent = document.createElement('div');
    helpContent.style.cssText = 'display:none;margin-top:12px;padding:16px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;';
    helpContent.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">
            <div><div style="font-weight:600;margin-bottom:10px;color:#475569;font-size:0.9rem;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-sitemap" style="color:#8b5cf6;"></i>親子関係とは</div>
            <ul style="margin:0;padding-left:18px;color:#64748b;line-height:1.8;font-size:0.88rem;"><li>設備を構成する部品・パーツの管理</li><li>設置場所と資産の関係管理</li></ul></div>
            <div><div style="font-weight:600;margin-bottom:10px;color:#475569;font-size:0.9rem;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-pencil" style="color:#3b82f6;"></i>基本操作</div>
            <ul style="margin:0;padding-left:18px;color:#64748b;line-height:1.8;font-size:0.88rem;"><li><strong>親資産を設定:</strong> カードをドラッグして親にドロップ</li><li><strong>解除:</strong> 「解除」ボタンをクリック</li></ul></div>
            <div><div style="font-weight:600;margin-bottom:10px;color:#475569;font-size:0.9rem;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;"></i>制約事項</div>
            <ul style="margin:0;padding-left:18px;color:#64748b;line-height:1.8;font-size:0.88rem;"><li>1つの資産は1つの親のみ持てる</li><li>循環参照・子孫を親に設定することは不可</li></ul></div>
        </div>
    `;
    helpToggle.onclick = () => {
        const isOpen = helpContent.style.display !== 'none';
        helpContent.style.display = isOpen ? 'none' : 'block';
        document.getElementById('assetHelpChevron').style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
    };
    helpSection.appendChild(helpToggle);
    helpSection.appendChild(helpContent);
    wrap.appendChild(helpSection);

    const mainArea = document.createElement('div');
    mainArea.style.cssText = 'flex:1;overflow-y:auto;width:100%;';
    const rootAssets = assets.filter(a => !a.parentId);

    const createAssetCard = (asset) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'nested-card';
        const header = document.createElement('div');
        header.className = 'nested-card-header';
        header.draggable = true;
        header.ondragstart = (e) => { e.dataTransfer.setData('text/assetId', asset.id); wrapper.classList.add('dragging'); };
        header.ondragend   = () => wrapper.classList.remove('dragging');
        header.ondragover  = (e) => { e.preventDefault(); header.style.background = '#eff6ff'; };
        header.ondragleave = () => { header.style.background = 'transparent'; };
        header.ondrop      = (e) => {
            e.preventDefault(); header.style.background = 'transparent';
            const cid = e.dataTransfer.getData('text/assetId');
            if(cid !== asset.id) linkAssetParent(cid, asset.id);
        };
        const statusBadges = renderStatusBadgesHTML(asset.status, 'font-size:0.7rem;');
        header.innerHTML = `
            <i class="fa-solid fa-grip-vertical" style="color:#cbd5e1;"></i>
            <span style="font-weight:600;cursor:pointer;padding:4px 8px;border-radius:4px;transition:background 0.15s;"
                  onclick="closeModal('masterModal');openAssetModal('${asset.id}')"
                  onmouseover="this.style.background='rgba(0,0,0,0.05)'"
                  onmouseout="this.style.background='transparent'"
                  title="クリックして詳細を表示">${asset.name}</span>
            <span style="font-size:0.75rem;color:var(--text-sub);margin-left:4px;">(${asset.id.toUpperCase()})</span>
            ${statusBadges}
            <div class="card-actions" style="margin-left:auto;">
                ${asset.parentId ? `<button class="btn btn-icon-only btn-ghost" onclick="unlinkAssetParent('${asset.id}')" title="親子関係を解除"><i class="fa-solid fa-unlink"></i></button>` : ''}
            </div>
        `;
        wrapper.appendChild(header);
        const children = getChildAssets(asset.id);
        if(children.length > 0) {
            const cc = document.createElement('div');
            cc.className = 'nested-children';
            children.forEach(c => cc.appendChild(createAssetCard(c)));
            wrapper.appendChild(cc);
        }
        return wrapper;
    };

    if(rootAssets.length === 0) {
        mainArea.innerHTML = `
            <div style="padding:60px 20px;text-align:center;color:var(--text-sub);">
                <i class="fa-solid fa-sitemap" style="font-size:3rem;margin-bottom:12px;display:block;opacity:0.3;"></i>
                <div>資産が登録されていません</div>
                <div style="font-size:0.85rem;margin-top:8px;opacity:0.7;">先に資産を登録してから、親子関係を設定してください</div>
            </div>
        `;
    } else {
        rootAssets.forEach(r => mainArea.appendChild(createAssetCard(r)));
        const dz = document.createElement('div');
        dz.style.cssText = 'padding:24px;border:2px dashed #cbd5e1;border-radius:8px;text-align:center;color:#94a3b8;margin-top:20px;background:#fafbfc;font-size:0.9rem;';
        dz.innerText = 'ここにドロップして親なし（トップレベル）にする';
        dz.ondragover = (e) => e.preventDefault();
        dz.ondrop     = (e) => { e.preventDefault(); unlinkAssetParent(e.dataTransfer.getData('text/assetId')); };
        mainArea.appendChild(dz);
    }

    wrap.appendChild(mainArea);
    container.appendChild(wrap);
}

function showAssetsGraphView() {
    document.getElementById('assetsGraphView').style.display = 'block';
    document.getElementById('assetsListView').style.display  = 'none';
    renderAssetsGraphView();
    setTimeout(() => autoFitAssetsGraph(), 100);
}

function linkAssetParent(childId, parentId) {
    if(isAncestorAsset(childId, parentId)) { showToast('循環参照になるため設定できません', 'warning'); return; }
    if(childId === parentId)               { showToast('自分自身を親に設定することはできません', 'warning'); return; }
    const child = assets.find(a => a.id === childId);
    if(!child) return;
    child.parentId = parentId;
    loadAssetsEditor(); autoSaveData(); showToast('親子関係を設定しました');
}

function unlinkAssetParent(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if(!asset) return;
    asset.parentId = null;
    loadAssetsEditor(); autoSaveData(); showToast('親子関係を解除しました');
}

function clearAllAssetParents() {
    if(!confirm('すべての資産の親子関係を解除しますか？\nこの操作は取り消せません。')) return;
    assets.forEach(a => { a.parentId = null; });
    loadAssetsEditor(); autoSaveData(); showToast('すべての親子関係を解除しました', 'success');
}

// =============================================================================
// マスタ名編集・削除
// =============================================================================
function editMasterName(masterId) {
    const master = masters.find(m => m.id === masterId);
    if(!master) return;
    const newName = prompt('マスタ定義の名称を変更してください:', master.name);
    if(!newName?.trim() || newName.trim() === master.name) return;
    master.name = newName.trim();
    renderMasterCats(); renderSidebar(); autoSaveData();
    showToast('マスタ定義名を変更しました');
}

function deleteMaster(masterId) {
    const master      = masters.find(m => m.id === masterId);
    if(!master) return;
    const relatedTags = tags.filter(t => t.masterId === masterId);
    const affected    = assets.filter(a => a.tags.some(tid => relatedTags.some(t => t.id === tid)));
    let msg = `マスタ定義「${master.name}」を削除しますか？\n\nこの操作は取り消せません。`;
    if(relatedTags.length > 0) {
        msg += `\n\n警告: このマスタに属する${relatedTags.length}個のタグも削除されます。`;
        if(affected.length > 0) msg += `\n${affected.length}個の資産がこれらのタグを使用しています。`;
    }
    if(!confirm(msg)) return;
    const idsToDelete = relatedTags.map(t => t.id);
    assets.forEach(asset => {
        asset.tags = asset.tags.filter(tid => !idsToDelete.includes(tid));
        if(asset.customAttributes) idsToDelete.forEach(tid => delete asset.customAttributes[tid]);
    });
    tags    = tags.filter(t => t.masterId !== masterId);
    masters = masters.filter(m => m.id !== masterId);
    if(currentMasterId === masterId) currentMasterId = masters.length > 0 ? masters[0].id : null;
    renderMasterCats(); renderSidebar(); loadEditor(); autoSaveData();
    showToast('マスタ定義を削除しました', 'success');
}


