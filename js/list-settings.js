
/**
 * list-settings.js
 * リスト表示設定（2ペインレイアウト版）
 */

function openListSettingsModal() {
    // 動的列を最新に更新
    addCustomFieldColumns();
    document.getElementById('listSettingsModal').classList.add('open');
    renderListColumnsSettings();
}

function renderListColumnsSettings() {
    const container = document.getElementById('listColumnsContainer');
    const sortedColumns = [...listDisplaySettings.columns].sort((a, b) => a.order - b.order);
    const categories = [...new Set(availableColumns.map(col => col.category))];

    // ── 「tags」列がある場合の移行ヒント ──
    const hasSingleTagsCol = sortedColumns.some(c => c.key === 'tags');
    const migrateHint = hasSingleTagsCol ? `
        <div style="display:flex; align-items:flex-start; gap:8px; padding:7px 10px; background:#fef9c3; border:1px solid #fde68a; border-radius:6px; margin-bottom:6px; flex-shrink:0;">
            <i class="fa-solid fa-lightbulb" style="color:#d97706; font-size:0.8rem; margin-top:2px; flex-shrink:0;"></i>
            <div style="font-size:0.78rem; color:#92400e; line-height:1.4;">「タグ（すべて）」列をマスタごとに分解できます。右欄から各マスタの列を追加した後、この列を削除してください。</div>
        </div>
    ` : '';

    // ── LEFT PANE: 表示中の列 ──
    let leftItems = '';
    sortedColumns.forEach((col) => {
        let widthType = 'auto', widthValue = '150';
        if(col.width === 'equal') widthType = 'equal';
        else if(col.width === 'flex') widthType = 'flex';
        else if(typeof col.width === 'string' && col.width.endsWith('px')) {
            widthType = 'fixed';
            widthValue = col.width.replace('px', '');
        }

        leftItems += `
            <div class="list-column-item" data-key="${col.key}" draggable="true"
                 style="display:flex; flex-direction:column; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; transition:border-color 0.15s, box-shadow 0.15s; ${col.visible ? '' : 'opacity:0.5;'}">
                <!-- Main row -->
                <div style="display:flex; align-items:center; gap:5px; padding:6px 7px;">
                    <i class="fa-solid fa-grip-vertical" style="color:#cbd5e1; cursor:move; flex-shrink:0; font-size:0.75rem;"></i>
                    <input type="checkbox" ${col.visible ? 'checked' : ''} 
                           onchange="toggleColumnVisibility('${col.key}', this.checked); this.closest('.list-column-item').style.opacity = this.checked ? '1' : '0.5';"
                           style="width:15px; height:15px; cursor:pointer; flex-shrink:0; accent-color:var(--primary);">
                    <span style="flex:1; font-size:0.86rem; font-weight:600; color:var(--text-main); min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${col.label}">${col.label}</span>
                    <!-- データ配置 -->
                    <select onchange="updateColumnAlign('${col.key}', this.value)" title="データ配置"
                            style="font-size:0.74rem; padding:2px 20px 2px 5px; border:1px solid #e2e8f0; border-radius:4px; color:var(--text-sub); background:#fff; flex-shrink:0;">
                        <option value="left" ${col.align === 'left' ? 'selected' : ''}>左</option>
                        <option value="center" ${col.align === 'center' ? 'selected' : ''}>中</option>
                        <option value="right" ${col.align === 'right' ? 'selected' : ''}>右</option>
                    </select>
                    <!-- 列幅タイプ -->
                    <select onchange="updateColumnWidthType('${col.key}', this.value)" title="列幅"
                            style="font-size:0.74rem; padding:2px 20px 2px 5px; border:1px solid #e2e8f0; border-radius:4px; color:var(--text-sub); background:#fff; flex-shrink:0;">
                        <option value="auto" ${widthType === 'auto' ? 'selected' : ''}>自動</option>
                        <option value="fixed" ${widthType === 'fixed' ? 'selected' : ''}>固定</option>
                        <option value="equal" ${widthType === 'equal' ? 'selected' : ''}>均等</option>
                        <option value="flex" ${widthType === 'flex' ? 'selected' : ''}>残り</option>
                    </select>
                    <!-- 固定幅値入力（常にDOM存在、display切り替え） -->
                    <input type="number" id="fixedWidth-${col.key}" value="${widthValue}" min="50" max="800"
                           onchange="updateColumnWidthValue('${col.key}', parseInt(this.value))"
                           style="width:48px; font-size:0.74rem; padding:2px 4px; border:1px solid #e2e8f0; border-radius:4px; flex-shrink:0; display:${widthType === 'fixed' ? 'inline-block' : 'none'};">
                    <!-- 詳細設定トグル -->
                    <button onclick="toggleColumnSettings('${col.key}')" title="ヘッダー配置等"
                            style="flex-shrink:0; background:none; border:none; cursor:pointer; color:#cbd5e1; padding:2px 3px; border-radius:3px; transition:color 0.15s; font-size:0.73rem;"
                            onmouseover="this.style.color='var(--primary)'" onmouseout="this.style.color='#cbd5e1'">
                        <i class="fa-solid fa-cog"></i>
                    </button>
                    <!-- 削除 -->
                    <button onclick="removeColumn('${col.key}')" title="列を削除"
                            style="flex-shrink:0; background:none; border:none; cursor:pointer; color:#cbd5e1; padding:2px 3px; border-radius:3px; transition:color 0.15s; font-size:0.73rem;"
                            onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#cbd5e1'">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
                <!-- 詳細設定行（折り畳み） -->
                <div id="settings-${col.key}" style="display:none; padding:0 7px 7px 28px; border-top:1px solid #f1f5f9;">
                    <div style="display:flex; align-items:center; gap:10px; padding-top:5px;">
                        <label style="font-size:0.74rem; color:var(--text-sub); white-space:nowrap;">ヘッダー配置:</label>
                        <select onchange="updateColumnHeaderAlign('${col.key}', this.value)"
                                style="font-size:0.74rem; padding:2px 20px 2px 5px; border:1px solid #e2e8f0; border-radius:4px; color:var(--text-sub); background:#fff;">
                            <option value="left" ${(!col.headerAlign || col.headerAlign === 'left') ? 'selected' : ''}>左寄せ</option>
                            <option value="center" ${col.headerAlign === 'center' ? 'selected' : ''}>中央揃え</option>
                            <option value="right" ${col.headerAlign === 'right' ? 'selected' : ''}>右寄せ</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    });

    // ── RIGHT PANE: 追加可能な列 ──
    let masterFilterBtns = `<button class="btn btn-sm btn-outline" id="masterFilter-all" onclick="filterRightPaneMaster('all')" style="padding:2px 8px; font-size:0.74rem; background:#fff; box-shadow:var(--shadow-sm);">すべて</button>`;
    masters.forEach(m => {
        masterFilterBtns += `<button class="btn btn-sm btn-ghost" id="masterFilter-${m.id}" onclick="filterRightPaneMaster('${m.id}')" style="padding:2px 8px; font-size:0.74rem;">${m.name}</button>`;
    });

    let rightGroups = '';
    categories.forEach(category => {
        const catCols = availableColumns.filter(col => col.category === category);
        let groupItems = '';

        catCols.forEach((col, idx) => {
            const isAdded = listDisplaySettings.columns.some(c => c.key === col.key);
            groupItems += `
                <div class="available-col-item" data-key="${col.key}" data-category="${category}" ${col.masterId ? `data-master="${col.masterId}"` : ''}
                     style="display:flex; align-items:center; gap:6px; padding:4px 8px; cursor:${isAdded ? 'default' : 'pointer'};
                            background:${isAdded ? '#f0fdf4' : '#fff'};
                            ${idx < catCols.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''}
                            transition:background 0.12s;"
                     ${!isAdded ? `onmouseover="this.style.background='#eef2ff'" onmouseout="this.style.background='#fff'" onclick="addColumnByKey('${col.key}')"` : ''}>
                    ${isAdded
                        ? `<i class="fa-solid fa-check" style="color:#10b981; font-size:0.7rem; width:12px; flex-shrink:0;"></i>`
                        : `<i class="fa-solid fa-plus-circle" style="color:var(--primary); font-size:0.7rem; width:12px; flex-shrink:0; opacity:0.7;"></i>`
                    }
                    <span style="font-size:0.83rem; color:${isAdded ? '#6b7280' : 'var(--text-main)'}; flex:1;">${col.label}</span>
                    ${isAdded ? `<span style="font-size:0.7rem; color:#10b981; font-weight:600;">追加済</span>` : ''}
                </div>
            `;
        });

        rightGroups += `
            <div class="available-col-group" data-category="${category}" style="margin-bottom:5px;">
                <div style="font-size:0.72rem; font-weight:700; color:#64748b; padding:4px 8px 2px; background:#f1f5f9; border:1px solid #e8ecf0; border-radius:4px 4px 0 0; letter-spacing:0.3px;">${category}</div>
                <div style="border:1px solid #e8ecf0; border-top:none; border-radius:0 0 4px 4px; overflow:hidden;">
                    ${groupItems}
                </div>
            </div>
        `;
    });

    // ── 組み立て ──
    container.innerHTML = `
        <div style="display:flex; gap:18px; height:calc(85vh - 200px); overflow:hidden;">
            <!-- LEFT: 表示中の列 -->
            <div style="flex:1.15; display:flex; flex-direction:column; min-width:0;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid var(--border);">
                    <span style="font-size:0.80rem; font-weight:700; color:var(--text-sub); text-transform:uppercase; letter-spacing:0.4px;">表示中の列</span>
                    <span style="font-size:0.73rem; color:var(--text-sub); opacity:0.65;"><i class="fa-solid fa-grip-vertical" style="font-size:0.6rem;"></i> ドラッグで並び替え</span>
                </div>
                <div id="columnsList" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:4px; padding-right:4px;">
                    ${migrateHint}
                    ${leftItems}
                </div>
            </div>

            <!-- RIGHT: 追加可能な列 -->
            <div style="flex:0.85; display:flex; flex-direction:column; min-width:0; border-left:1px solid var(--border); padding-left:18px;">
                <div style="margin-bottom:8px;">
                    <div style="font-size:0.80rem; font-weight:700; color:var(--text-sub); text-transform:uppercase; letter-spacing:0.4px; margin-bottom:6px; padding-bottom:6px; border-bottom:1px solid var(--border);">追加可能な列</div>
                    <div style="display:flex; gap:4px; flex-wrap:wrap;">
                        ${masterFilterBtns}
                    </div>
                </div>
                <div id="availableColumnsList" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:0; padding-right:4px;">
                    ${rightGroups}
                </div>
            </div>
        </div>
    `;

    setupColumnDragAndDrop();
}

/**
 * 右ペインのマスタフィルタ
 */
function filterRightPaneMaster(masterId) {
    document.querySelectorAll('[id^="masterFilter-"]').forEach(btn => {
        btn.className = 'btn btn-sm btn-ghost';
        btn.style.background = 'transparent';
        btn.style.boxShadow = 'none';
        btn.style.padding = '2px 8px';
        btn.style.fontSize = '0.74rem';
    });
    const activeBtn = document.getElementById(`masterFilter-${masterId}`);
    if(activeBtn) {
        activeBtn.className = 'btn btn-sm btn-outline';
        activeBtn.style.background = '#fff';
        activeBtn.style.boxShadow = 'var(--shadow-sm)';
    }

    document.querySelectorAll('.available-col-item').forEach(item => {
        if(masterId === 'all') { item.style.display = 'flex'; return; }
        const isTagMaster = item.dataset.category === 'タグ（マスタ別）';
        if(isTagMaster) {
            item.style.display = (item.dataset.master === masterId) ? 'flex' : 'none';
        } else {
            item.style.display = 'flex';
        }
    });

    document.querySelectorAll('.available-col-group').forEach(group => {
        const items = group.querySelectorAll('.available-col-item');
        group.style.display = Array.from(items).some(i => i.style.display !== 'none') ? 'block' : 'none';
    });
}

/**
 * キーで列を追加
 */
function addColumnByKey(key) {
    const availableCol = availableColumns.find(c => c.key === key);
    if(!availableCol) return;
    if(listDisplaySettings.columns.find(c => c.key === key)) return;

    const maxOrder = Math.max(...listDisplaySettings.columns.map(c => c.order), -1);
    listDisplaySettings.columns.push({
        key: key,
        label: availableCol.label,
        visible: true,
        order: maxOrder + 1,
        align: 'left',
        width: 'auto'
    });

    renderListColumnsSettings();
    showToast(`「${availableCol.label}」を追加しました`, 'success');
}

/**
 * 列を削除
 */
function removeColumn(key) {
    listDisplaySettings.columns = listDisplaySettings.columns.filter(c => c.key !== key);
    renderListColumnsSettings();
    showToast('列を削除しました', 'success');
}

/**
 * 詳細設定の折り畳みトグル
 */
function toggleColumnSettings(key) {
    const settingsDiv = document.getElementById(`settings-${key}`);
    if(settingsDiv) {
        settingsDiv.style.display = settingsDiv.style.display === 'none' ? 'block' : 'none';
    }
}

function updateColumnAlign(key, align) {
    const col = listDisplaySettings.columns.find(c => c.key === key);
    if(col) col.align = align;
}

function updateColumnHeaderAlign(key, headerAlign) {
    const col = listDisplaySettings.columns.find(c => c.key === key);
    if(col) col.headerAlign = headerAlign;
}

function updateColumnWidthType(key, type) {
    const col = listDisplaySettings.columns.find(c => c.key === key);
    if(col) {
        col.width = (type === 'fixed') ? '150px' : type;
        // 固定幅入力欄の表示切り替え（DOM直操作で再レンダリング回避）
        const fixedInput = document.getElementById(`fixedWidth-${key}`);
        if(fixedInput) {
            fixedInput.style.display = (type === 'fixed') ? 'inline-block' : 'none';
            if(type === 'fixed') fixedInput.value = 150;
        }
    }
}

function updateColumnWidthValue(key, value) {
    const col = listDisplaySettings.columns.find(c => c.key === key);
    if(col) col.width = `${value}px`;
}

function toggleColumnVisibility(key, visible) {
    const col = listDisplaySettings.columns.find(c => c.key === key);
    if(col) col.visible = visible;
}

/**
 * ドラッグアンドドロップ（左ペインの並び替え）
 */
function setupColumnDragAndDrop() {
    const container = document.getElementById('columnsList');
    if (!container) return;

    let draggedItem  = null;
    let placeholder  = null;

    /* --- ゴーストプレースホルダーの生成 --- */
    function createPlaceholder(sourceItem) {
        const ph = document.createElement('div');
        ph.className = 'drag-ghost-placeholder';
        ph.style.height = sourceItem.offsetHeight + 'px';

        // ラベルテキスト取得
        const labelEl = sourceItem.querySelector('span[title]');
        const label   = labelEl ? labelEl.getAttribute('title') : '';

        ph.innerHTML = `<i class="fa-solid fa-grip"></i><span>${label}</span>`;
        return ph;
    }

    /* --- 挿入位置の決定 --- */
    function calcInsertBefore(clientY) {
        const items = Array.from(container.querySelectorAll('.list-column-item'));
        for (const item of items) {
            if (item === draggedItem) continue;
            const rect    = item.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            if (clientY < midpoint) return item;
        }
        return null; // 末尾へ
    }

    /* --- コンテナレベルのイベント --- */
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedItem || !placeholder) return;

        const target = calcInsertBefore(e.clientY);
        if (target) {
            // プレースホルダーが既に正しい位置なら移動しない（点滅防止）
            if (placeholder.nextSibling !== target) {
                container.insertBefore(placeholder, target);
            }
        } else {
            if (container.lastChild !== placeholder) {
                container.appendChild(placeholder);
            }
        }
    });

    container.addEventListener('dragleave', (e) => {
        // コンテナ外に出た場合のみプレースホルダーを削除
        if (!container.contains(e.relatedTarget)) {
            if (placeholder) { placeholder.remove(); placeholder = null; }
        }
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!draggedItem || !placeholder) return;

        // ドロップ位置にドラッグ項目を挿入
        container.insertBefore(draggedItem, placeholder);
        placeholder.remove();

        draggedItem.style.opacity = '';
        draggedItem = null;
        placeholder = null;
    });

    /* --- 各項目のdragstart / dragend --- */
    container.querySelectorAll('.list-column-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedItem  = item;
            e.dataTransfer.effectAllowed = 'move';

            placeholder = createPlaceholder(item);

            // ドラッグイメージのキャプチャ後に元項目を半透明にする
            requestAnimationFrame(() => {
                item.style.opacity = '0.25';
            });
        });

        item.addEventListener('dragend', () => {
            // オパシティを正規の値に戻す（非表示カラムは0.5）
            const col = listDisplaySettings.columns.find(c => c.key === item.dataset.key);
            item.style.opacity = col?.visible !== false ? '' : '0.5';

            if (placeholder) { placeholder.remove(); placeholder = null; }
            draggedItem = null;
        });
    });
}

/**
 * 設定保存
 */
function saveListSettings() {
    const items = document.querySelectorAll('.list-column-item');
    items.forEach((item, index) => {
        const key = item.dataset.key;
        const col = listDisplaySettings.columns.find(c => c.key === key);
        if(col) col.order = index;
    });

    closeModal('listSettingsModal');

    if(assetViewMode === 'list') {
        renderAssets(window.currentAssetList || assets);
    }

    showToast('リスト表示設定を保存しました', 'success');
    autoSaveData();
}

/**
 * デフォルトに戻す（マスタ動的生成対応）
 */
function resetListSettings() {
    if(!confirm('リスト表示設定をデフォルトに戻しますか？')) return;

    const tagColumns = masters.map((m, idx) => ({
        key: `tags-${m.id}`,
        label: m.name,
        visible: true,
        order: 3 + idx,
        align: 'left',
        width: 'auto'
    }));

    listDisplaySettings.columns = [
        { key: 'name', label: '資産名称', visible: true, order: 0, align: 'left', width: 'auto' },
        { key: 'date', label: '導入日', visible: true, order: 1, align: 'left', width: 'auto' },
        ...tagColumns,
        { key: 'status', label: 'ステータス', visible: true, order: 3 + tagColumns.length, align: 'right', width: 'auto' }
    ];

    renderListColumnsSettings();
    showToast('デフォルト設定に戻しました', 'success');
}


