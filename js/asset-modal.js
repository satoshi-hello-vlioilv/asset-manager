
/**
 * asset-modal.js
 * 資産詳細モーダル機能
 */

function openAssetModal(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if(!asset) return;
    isNewAsset = false;
    openAssetModalWithData(asset);
}

function openAssetModalWithData(asset) {
    editingAssetId = asset.id;
    editingTags = [...asset.tags];
    
    // statusを配列に統一
    if(!Array.isArray(asset.status)) {
        asset.status = [asset.status];
    }
    
    // images配列がない場合は初期化
    if(!asset.images) {
        asset.images = [];
        // 旧互換: imageプロパティがある場合は移行
        if(asset.image) {
            asset.images.push({
                url: asset.image,
                comment: '',
                selected: true
            });
        }
    }

    // 初期値を保存（変更検知用）
    // imagesもディープコピーして保存しておく
    originalAssetData = {
        name: asset.name,
        date: asset.date,
        status: [...asset.status],
        specs: asset.specs || '',
        tags: [...asset.tags],
        parentId: asset.parentId || null, // 親資産ID
        images: JSON.parse(JSON.stringify(asset.images)), // Deep copy
        operations: { 
            procedure: asset.operations?.procedure || '', 
            checkpoints: asset.operations?.checkpoints || '' 
        },
        risk: { 
            assessment: asset.risk?.assessment || '', 
            measures: asset.risk?.measures || '' 
        }
    };
    
    // 基本情報タブ
    document.getElementById('modalTitle').innerText = asset.name;
    document.getElementById('modalAssetId').innerText = `ID: ${asset.id.toUpperCase()}`;
    
    // モーダルヘッダーのバッジを複数対応
    updateModalStatusBadges(asset.status);
    
    const nameInput = document.getElementById('editAssetName');
    const dateInput = document.getElementById('editAssetDate');
    const specsInput = document.getElementById('editAssetSpecs');
    
    nameInput.value = asset.name;
    dateInput.value = asset.date;
    specsInput.value = asset.specs || '';
    
    // 変更検知イベントを設定
    nameInput.oninput = () => checkFieldChange(nameInput, originalAssetData.name);
    dateInput.onchange = () => checkFieldChange(dateInput, originalAssetData.date);
    specsInput.oninput = () => checkFieldChange(specsInput, originalAssetData.specs);
    
    // 初期状態では変更なし
    removeChangeHighlight(nameInput);
    removeChangeHighlight(dateInput);
    removeChangeHighlight(specsInput);
    
    // ステータスチェックボックスを生成し、状態を設定
    renderStatusCheckboxes();
    document.querySelectorAll('.status-checkbox').forEach(cb => {
        cb.checked = asset.status.includes(cb.value);
        cb.onchange = () => {
            updateStatusBadgesFromCheckboxes();
            checkStatusChange();
        };
    });
    
    // 運用基準・手順タブ
    if(!asset.operations) asset.operations = { procedure: '', checkpoints: '' };
    const procInput = document.getElementById('editOperationsProcedure');
    const checkInput = document.getElementById('editOperationsCheckpoints');
    
    procInput.value = asset.operations.procedure || '';
    checkInput.value = asset.operations.checkpoints || '';
    
    procInput.oninput = () => checkFieldChange(procInput, originalAssetData.operations.procedure);
    checkInput.oninput = () => checkFieldChange(checkInput, originalAssetData.operations.checkpoints);
    
    removeChangeHighlight(procInput);
    removeChangeHighlight(checkInput);
    
    // リスク管理・安全タブ
    if(!asset.risk) asset.risk = { assessment: '', measures: '' };
    const riskAssInput = document.getElementById('editRiskAssessment');
    const riskMeasInput = document.getElementById('editRiskMeasures');
    
    riskAssInput.value = asset.risk.assessment || '';
    riskMeasInput.value = asset.risk.measures || '';
    
    riskAssInput.oninput = () => checkFieldChange(riskAssInput, originalAssetData.risk.assessment);
    riskMeasInput.oninput = () => checkFieldChange(riskMeasInput, originalAssetData.risk.measures);
    
    removeChangeHighlight(riskAssInput);
    removeChangeHighlight(riskMeasInput);
    
    // 親資産選択（基本情報タブ内）
    renderParentAssetSelection(asset.parentId);
    
    // 履歴タブ
    if(!asset.maintenance) asset.maintenance = [];
    document.getElementById('newHistoryDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('newHistoryEvent').value = '';
    historySortOrder = 'desc';
    renderHistoryRecords();
    
    // 周期計画タブ
    if(!asset.scheduledPlans) asset.scheduledPlans = [];
    document.getElementById('newScheduleDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('newScheduleEvent').value = '';
    document.getElementById('newScheduleCycle').value = '';
    scheduleSortOrder = 'desc';
    renderScheduleRecords();
    
    // 画像タブ
    document.getElementById('newImageUrl').value = '';
    document.getElementById('newImageComment').value = '';
    renderImagesGallery();
    setupImageDropZone(); // ドロップゾーンをセットアップ
    
    // 新規作成時は削除ボタンを「キャンセル」に変更
    const deleteBtn = document.getElementById('deleteAssetBtn');
    if(isNewAsset) {
        deleteBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> キャンセル';
        deleteBtn.className = 'btn btn-outline';
    } else {
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i> 削除';
        deleteBtn.className = 'btn btn-danger-ghost';
    }
    
    renderDynamicMasterInputs();
    renderCustomFieldInputs(); // カスタムフィールド入力フォームを描画
    document.getElementById('assetModal').classList.add('open');
}

function checkFieldChange(element, originalValue) {
    if(element.value !== originalValue) {
        addChangeHighlight(element);
    } else {
        removeChangeHighlight(element);
    }
}

function checkStatusChange() {
    const currentStatus = Array.from(document.querySelectorAll('.status-checkbox:checked'))
        .map(cb => cb.value).sort();
    const originalStatus = [...originalAssetData.status].sort();
    
    const changed = currentStatus.length !== originalStatus.length ||
                   currentStatus.some((s, i) => s !== originalStatus[i]);
    
    const container = document.querySelector('.status-checkbox').closest('div').parentElement;
    if(changed) {
        addChangeHighlight(container);
    } else {
        removeChangeHighlight(container);
    }
}

function addChangeHighlight(element) {
    element.style.backgroundColor = '#fef3c7'; // 薄い黄色
    element.style.transition = 'background-color 0.3s';
}

function removeChangeHighlight(element) {
    element.style.backgroundColor = '';
}

/**
 * ステータスチェックボックスをSTATUS_DEFSから動的に生成
 */
function renderStatusCheckboxes() {
    const container = document.getElementById('statusCheckboxContainer');
    if(!container) return;

    container.innerHTML = STATUS_DEFS.map(def => `
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.9rem;">
            <input type="checkbox" class="status-checkbox" value="${escapeHTML(def.value)}" style="width:18px; height:18px; cursor:pointer;">
            <span>${escapeHTML(def.value)}</span>
        </label>
    `).join('');
}

function updateModalStatusBadges(statusArray) {
    const container = document.getElementById('modalStatusBadge');
    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.gap = '4px';
    container.style.flexWrap = 'wrap';

    if(statusArray.length === 0) {
        const badge = document.createElement('span');
        badge.className = 'badge badge-gray';
        badge.innerText = 'ステータスなし';
        container.appendChild(badge);
        return;
    }

    statusArray.forEach(s => {
        const badge = document.createElement('span');
        badge.className = `badge ${getStatusBadgeClass(s)}`;
        badge.innerText = s;
        container.appendChild(badge);
    });
}

function updateStatusBadgesFromCheckboxes() {
    const selectedStatuses = Array.from(document.querySelectorAll('.status-checkbox:checked'))
        .map(cb => cb.value);
    updateModalStatusBadges(selectedStatuses);
}

function renderDynamicMasterInputs() {
    const container = document.getElementById('dynamicInputContainer');
    container.innerHTML = ''; 

    masters.forEach(m => {
        const wrapper = document.createElement('div');
        wrapper.style.gridColumn = 'span 1';
        
        const label = document.createElement('label');
        label.style.cssText = 'font-size:0.85rem; font-weight:700; color:var(--text-sub); display:block; margin-bottom:6px;';
        label.innerText = m.name;
        wrapper.appendChild(label);

        const inputContainer = document.createElement('div');
        inputContainer.className = 'tag-input-container';
        inputContainer.onclick = () => {
            const inp = inputContainer.querySelector('.tag-input-field');
            if(inp) inp.focus();
        };

        const chipsContainer = document.createElement('div');
        chipsContainer.style.display = 'contents';
        chipsContainer.id = `chips-${m.id}`;
        inputContainer.appendChild(chipsContainer);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tag-input-field';
        input.placeholder = `+ ${m.name}を追加...`;
        input.autocomplete = 'off';
        input.id = `search-${m.id}`;
        inputContainer.appendChild(input);

        const dropdown = document.createElement('div');
        dropdown.className = 'tag-dropdown';
        dropdown.id = `dropdown-${m.id}`;
        inputContainer.appendChild(dropdown);

        wrapper.appendChild(inputContainer);
        container.appendChild(wrapper);

        renderChipsForMaster(m.id);
        setupDynamicTagSearch(m.id, input, dropdown);
    });
}

function renderChipsForMaster(masterId) {
    const container = document.getElementById(`chips-${masterId}`);
    if(!container) return;
    container.innerHTML = '';
    
    const relevantTags = editingTags
        .map(tId => tags.find(t => t.id === tId))
        .filter(t => t && t.masterId === masterId);
    
    relevantTags.forEach(t => {
        const badge = document.createElement('span');
        badge.className = 'badge badge-blue';
        badge.innerHTML = `${t.name} <i class="fa-solid fa-xmark" style="margin-left:4px;cursor:pointer"></i>`;
        badge.querySelector('i').onclick = (e) => { 
            e.stopPropagation(); 
            editingTags = editingTags.filter(id => id !== t.id);
            renderChipsForMaster(masterId);
            checkTagsChange(); // タグ変更を検知
        };
        container.appendChild(badge);
    });
}

function checkTagsChange() {
    const currentTags = [...editingTags].sort();
    const originalTags = [...originalAssetData.tags].sort();
    
    const changed = currentTags.length !== originalTags.length ||
                   currentTags.some((t, i) => t !== originalTags[i]);
    
    // すべてのタグ入力コンテナに対して変更を反映
    masters.forEach(m => {
        const container = document.getElementById(`chips-${m.id}`)?.parentElement;
        if(container) {
            if(changed) {
                addChangeHighlight(container);
            } else {
                removeChangeHighlight(container);
            }
        }
    });
}

function setupDynamicTagSearch(masterId, input, dropdown) {
    const showCandidates = (val) => {
        const needle = val.toLowerCase().trim();
        const matches = tags.filter(t => 
            t.masterId === masterId &&
            (needle === '' || t.name.toLowerCase().includes(needle)) && 
            !editingTags.includes(t.id)
        );

        dropdown.innerHTML = '';
        if(matches.length > 0) {
            const limit = needle === '' ? 20 : matches.length;
            matches.slice(0, limit).forEach(t => {
                const item = document.createElement('div');
                item.className = 'tag-dropdown-item';
                let parentName = '';
                if(t.parentIds.length > 0) {
                    const p = tags.find(pt => pt.id === t.parentIds[0]);
                    if(p) parentName = `<span class="tag-path">${p.name} / </span>`;
                }
                item.innerHTML = `<span>${t.name}</span> ${parentName}`;
                item.onclick = (e) => {
                    e.stopPropagation(); 
                    editingTags.push(t.id);
                    renderChipsForMaster(masterId);
                    checkTagsChange(); // タグ変更を検知
                    input.value = '';
                    dropdown.classList.remove('show');
                    input.focus();
                };
                dropdown.appendChild(item);
            });
            dropdown.classList.add('show');
        } else {
            dropdown.classList.remove('show');
        }
    };

    input.addEventListener('input', (e) => showCandidates(e.target.value));
    input.addEventListener('focus', () => showCandidates(input.value));
    
    document.addEventListener('click', (e) => {
        if(!e.target.closest('.tag-input-container')) {
            dropdown.classList.remove('show');
        }
    });
}

function createNewAsset() {
    isNewAsset = true;
    const newId = 'temp_' + Date.now(); // 一時ID
    editingAssetId = newId;
    
    // 仮の新規資産オブジェクトを作成してassetsに追加（編集中にデータを保持するため）
    const newAsset = { 
        id: newId, 
        name: '新規資産', 
        tags: [], 
        status: [], // ステータスなし
        date: new Date().toISOString().split('T')[0], 
        specs: '',
        image: '',
        images: [],
        parentId: null, // 親資産なし
        operations: { procedure: '', checkpoints: '' },
        risk: { assessment: '', measures: '' },
        maintenance: [],
        scheduledPlans: [],
        customAttributes: {} // カスタム属性の初期化
    };
    
    assets.push(newAsset); // 一時的に追加
    openAssetModalWithData(newAsset);
}

function saveAssetChanges() {
    if(!editingAssetId) return;
    
    // 現在編集中の一時資産(新規)または既存資産を取得
    const currentEditingAsset = assets.find(a => a.id === editingAssetId);
    if(!currentEditingAsset) return;

    // 現在の画像データを確保
    const currentImages = currentEditingAsset.images ? JSON.parse(JSON.stringify(currentEditingAsset.images)) : [];

    try {
        // 新規作成の場合
        if(isNewAsset) {
            // 一時資産をassetsから削除
            assets = assets.filter(a => a.id !== editingAssetId);
            
            // 正式なIDを発行（実際にはUUID等が望ましいが、簡易実装）
            // ※ nextAssetId 等を使うのが理想だが、ここでは簡易的にユニークID生成
            const newId = 'a' + Date.now();
            
            // 新しい資産オブジェクトを作成
            const newAsset = {
                id: newId,
                name: document.getElementById('editAssetName').value,
                date: document.getElementById('editAssetDate').value,
                status: Array.from(document.querySelectorAll('.status-checkbox:checked'))
                    .map(cb => cb.value),
                specs: document.getElementById('editAssetSpecs').value,
                // 互換性のためimageにもセット
                image: currentImages.length > 0 ? currentImages[0].url : '', 
                images: currentImages, 
                tags: [...editingTags],
                parentId: null, // 親資産は構成管理で設定
                operations: {
                    procedure: document.getElementById('editOperationsProcedure').value,
                    checkpoints: document.getElementById('editOperationsCheckpoints').value
                },
                risk: {
                    assessment: document.getElementById('editRiskAssessment').value,
                    measures: document.getElementById('editRiskMeasures').value
                },
                maintenance: currentEditingAsset.maintenance || [],
                scheduledPlans: currentEditingAsset.scheduledPlans || [],
                customAttributes: collectCustomFieldValues() // カスタムフィールド値を収集
            };
            
            // 全データに追加
            assets.push(newAsset);

            // ★重要: 現在表示中のリスト（フィルタ中など）にも追加して即座に見えるようにする
            // これがないと、フィルタ適用中に新規作成してもリストに出てこない場合がある
            if (window.currentAssetList) {
                window.currentAssetList.push(newAsset);
            }
            // 検索中の場合は検索の起点リストにも追加（検索解除時に消えないように）
            if (typeof searchBaseList !== 'undefined' && Array.isArray(searchBaseList) && searchBaseList !== window.currentAssetList) {
                searchBaseList.push(newAsset);
            }

            isNewAsset = false;
            showToast('新規資産を登録しました', 'success');

        } else {
            // 既存資産の更新（オブジェクトの参照を直接書き換える）
            const asset = currentEditingAsset; 
            
            asset.name = document.getElementById('editAssetName').value;
            asset.date = document.getElementById('editAssetDate').value;
            asset.status = Array.from(document.querySelectorAll('.status-checkbox:checked'))
                .map(cb => cb.value);
            asset.specs = document.getElementById('editAssetSpecs').value;
            asset.tags = [...editingTags];
            // parentIdは構成管理で設定するのでここでは触らない
            
            if (asset.images && asset.images.length > 0) {
                 const selected = asset.images.find(i => i.selected);
                 asset.image = selected ? selected.url : asset.images[0].url;
            } else {
                 asset.image = '';
            }
            
            asset.operations = {
                procedure: document.getElementById('editOperationsProcedure').value,
                checkpoints: document.getElementById('editOperationsCheckpoints').value
            };
            
            asset.risk = {
                assessment: document.getElementById('editRiskAssessment').value,
                measures: document.getElementById('editRiskMeasures').value
            };
            
            // カスタムフィールド値を保存
            asset.customAttributes = collectCustomFieldValues();
            
            showToast('資産情報を保存しました');
        }
        
        // ★重要: 画面の再描画
        // 更新されたデータ（assets または window.currentAssetList）を使ってリストを更新
        renderAssets(window.currentAssetList || assets);
        
        // ダッシュボード表示中ならダッシュボードも更新（数値の変化を反映）
        if (currentPage === 'dashboard') {
            renderDashboard();
        }
        
        closeModal('assetModal');
        autoSaveData(); // 自動保存
        
    } catch(error) {
        // バリデーションエラーの場合はモーダルを閉じない
        if(error.message === 'Validation failed') {
            return;
        }
        // その他のエラー
        console.error('保存エラー:', error);
        showToast('保存中にエラーが発生しました', 'error');
    }
}

function deleteCurrentAsset() {
    if(isNewAsset) {
        // 新規作成中の場合は一時資産を削除してキャンセル
        assets = assets.filter(a => a.id !== editingAssetId);
        closeModal('assetModal');
        showToast('登録をキャンセルしました', 'info');
        return;
    }
    
    if(confirm('この資産を削除してもよろしいですか？')) {
        // 1. 全データから削除
        assets = assets.filter(a => a.id !== editingAssetId);
        
        // 2. ★重要: 現在表示中のリスト（フィルタ結果）からも削除
        // これを行わないと、renderAssetsに古い配列（削除対象を含む）が渡されて表示が残る
        if (window.currentAssetList) {
            window.currentAssetList = window.currentAssetList.filter(a => a.id !== editingAssetId);
        }
        // 検索中の場合は検索の起点リストからも削除
        if (typeof searchBaseList !== 'undefined' && Array.isArray(searchBaseList)) {
            searchBaseList = searchBaseList.filter(a => a.id !== editingAssetId);
        }

        // 3. 画面再描画
        renderAssets(window.currentAssetList || assets);

        // ダッシュボード表示中ならダッシュボードも更新
        if (currentPage === 'dashboard') {
            renderDashboard();
        }

        closeModal('assetModal');
        showToast('資産を削除しました', 'success');
        autoSaveData(); // 自動保存
    }
}

// closeModal は js/ui.js で定義（旧版ではここに重複定義があったため統合）

function switchTab(el, tabId) {
    el.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    
    // 画像タブに切り替えた時はギャラリーを再描画＆ドロップゾーンをセットアップ
    if(tabId === 'tabImages') {
        renderImagesGallery();
        setupImageDropZone();
    }
    
    // 構成パーツタブに切り替えた時は子資産一覧を描画
    if(tabId === 'tabComponents') {
        renderComponentsList();
    }
}

/**
 * 親資産選択UIをレンダリング
 */
function renderParentAssetSelection(currentParentId) {
    const container = document.getElementById('parentAssetSelectContainer');
    if(!container) return;
    
    container.innerHTML = '';
    
    // 親資産情報の表示
    const parentAsset = getParentAsset(editingAssetId);
    
    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:12px; background:#f8fafc; border:1px solid var(--border); border-radius:var(--radius-md);';
    
    if(!parentAsset) {
        infoDiv.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; color:var(--text-sub);">
                <i class="fa-solid fa-sitemap" style="font-size:1.2rem; opacity:0.5;"></i>
                <span style="font-size:0.9rem;">親資産なし（トップレベル資産）</span>
            </div>
            <button class="btn btn-outline btn-sm" onclick="openAssetStructureModal()">
                <i class="fa-solid fa-diagram-project"></i> 構成管理で設定
            </button>
        `;
    } else {
        infoDiv.innerHTML = `
            <div style="flex:1;">
                <div style="font-size:0.75rem; color:var(--text-sub); margin-bottom:4px;">親資産</div>
                <div style="font-weight:600; font-size:0.95rem; color:var(--text); cursor:pointer;" 
                     onclick="openAssetModal('${parentAsset.id}')" 
                     title="クリックして親資産を表示">
                    <i class="fa-solid fa-arrow-up" style="margin-right:4px; font-size:0.8rem; opacity:0.6;"></i>
                    ${parentAsset.name} <span style="font-size:0.8rem; color:var(--text-sub);">(${parentAsset.id.toUpperCase()})</span>
                </div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="openAssetStructureModal()">
                <i class="fa-solid fa-diagram-project"></i> 構成管理で変更
            </button>
        `;
    }
    
    container.appendChild(infoDiv);
}

/**
 * 親資産の変更を検知
 */
function checkParentAssetChange() {
    // 構成管理で設定するため、この関数は不要になったが互換性のため残す
}

/**
 * 資産構成管理モーダルを開く
 */
function openAssetStructureModal() {
    closeModal('assetModal');
    openMasterModal();
    // 資産構成タブに切り替え
    setTimeout(() => {
        switchMasterTab('assets');
    }, 100);
}

/**
 * 構成パーツ（子資産）一覧を描画
 */
function renderComponentsList() {
    const container = document.getElementById('componentsListContainer');
    const parentContainer = document.getElementById('parentAssetInfoContainer');
    
    if(!container || !editingAssetId) return;
    
    const currentAsset = assets.find(a => a.id === editingAssetId);
    if(!currentAsset) return;
    
    // 子資産を取得
    const childAssets = getChildAssets(editingAssetId);
    
    if(childAssets.length === 0) {
        container.innerHTML = `
            <div style="padding:40px 20px; text-align:center; color:var(--text-sub);">
                <i class="fa-solid fa-box-open" style="font-size:2.5rem; opacity:0.3; display:block; margin-bottom:12px;"></i>
                <div style="font-size:0.95rem;">この資産には構成パーツ（子資産）が登録されていません</div>
                <div style="font-size:0.85rem; margin-top:8px; opacity:0.7;">
                    別の資産を編集して、その親資産にこの資産を指定することで構成パーツとして追加できます。
                </div>
            </div>
        `;
    } else {
        let html = '<div style="display:grid; gap:12px;">';
        
        childAssets.forEach(child => {
            const myTags = tags.filter(t => child.tags.includes(t.id));
            const statusBadges = renderStatusBadgesHTML(child.status);
            const thumbnailUrl = getAssetThumbnailUrl(child);

            html += `
                <div style="display:flex; gap:16px; padding:16px; background:#fff; border:1px solid var(--border); border-radius:var(--radius-md); cursor:pointer; transition:all 0.2s;" 
                     onmouseover="this.style.boxShadow='var(--shadow-md)'; this.style.borderColor='var(--primary)';" 
                     onmouseout="this.style.boxShadow=''; this.style.borderColor='var(--border)';"
                     onclick="openAssetModal('${child.id}')">
                    <div style="width:80px; height:80px; flex-shrink:0; background:#f8fafc; border-radius:var(--radius-md); display:flex; align-items:center; justify-content:center; overflow:hidden;">
                        ${thumbnailUrl ? `<img src="${thumbnailUrl}" style="width:100%; height:100%; object-fit:cover;">` : `<i class="fa-solid fa-cube" style="font-size:2rem; color:var(--text-sub); opacity:0.3;"></i>`}
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:600; font-size:1rem; margin-bottom:4px;">${child.name}</div>
                        <div style="font-size:0.85rem; color:var(--text-sub); margin-bottom:8px;">ID: ${child.id.toUpperCase()}</div>
                        <div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:8px;">
                            ${statusBadges}
                        </div>
                        <div style="display:flex; gap:4px; flex-wrap:wrap;">
                            ${myTags.slice(0, 4).map(t => `<span class="badge badge-gray" style="font-size:0.75rem;">${t.name}</span>`).join('')}
                            ${myTags.length > 4 ? `<span class="badge badge-gray" style="font-size:0.75rem;">+${myTags.length - 4}</span>` : ''}
                        </div>
                    </div>
                    <div style="display:flex; align-items:center;">
                        <i class="fa-solid fa-chevron-right" style="color:var(--text-sub); opacity:0.5;"></i>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
    }
    
    // 親資産の表示
    if(parentContainer) {
        const parentAsset = getParentAsset(editingAssetId);
        
        if(!parentAsset) {
            parentContainer.innerHTML = `
                <div style="padding:20px; text-align:center; color:var(--text-sub); font-size:0.9rem;">
                    <i class="fa-solid fa-sitemap" style="font-size:1.5rem; opacity:0.3; display:block; margin-bottom:8px;"></i>
                    この資産は親資産に所属していません（トップレベル資産）
                </div>
            `;
        } else {
            const myTags = tags.filter(t => parentAsset.tags.includes(t.id));
            const statusBadges = renderStatusBadgesHTML(parentAsset.status);
            const thumbnailUrl = getAssetThumbnailUrl(parentAsset);

            parentContainer.innerHTML = `
                <div style="display:flex; gap:16px; padding:16px; background:#f8fafc; border:1px solid var(--border); border-radius:var(--radius-md); cursor:pointer; transition:all 0.2s;" 
                     onmouseover="this.style.boxShadow='var(--shadow-md)'; this.style.borderColor='var(--primary)';" 
                     onmouseout="this.style.boxShadow=''; this.style.borderColor='var(--border)';"
                     onclick="openAssetModal('${parentAsset.id}')">
                    <div style="width:80px; height:80px; flex-shrink:0; background:#fff; border-radius:var(--radius-md); display:flex; align-items:center; justify-content:center; overflow:hidden;">
                        ${thumbnailUrl ? `<img src="${thumbnailUrl}" style="width:100%; height:100%; object-fit:cover;">` : `<i class="fa-solid fa-cube" style="font-size:2rem; color:var(--text-sub); opacity:0.3;"></i>`}
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:600; font-size:1rem; margin-bottom:4px;">${parentAsset.name}</div>
                        <div style="font-size:0.85rem; color:var(--text-sub); margin-bottom:8px;">ID: ${parentAsset.id.toUpperCase()}</div>
                        <div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:8px;">
                            ${statusBadges}
                        </div>
                        <div style="display:flex; gap:4px; flex-wrap:wrap;">
                            ${myTags.slice(0, 4).map(t => `<span class="badge badge-gray" style="font-size:0.75rem;">${t.name}</span>`).join('')}
                            ${myTags.length > 4 ? `<span class="badge badge-gray" style="font-size:0.75rem;">+${myTags.length - 4}</span>` : ''}
                        </div>
                    </div>
                    <div style="display:flex; align-items:center;">
                        <i class="fa-solid fa-chevron-right" style="color:var(--text-sub); opacity:0.5;"></i>
                    </div>
                </div>
            `;
        }
    }
}

/**
 * カスタムフィールド入力フォームを描画
 */
function renderCustomFieldInputs() {
    const container = document.getElementById('customFieldsContainer');
    if(!container) return;
    
    container.innerHTML = '';
    
    // 選択中のタグからカスタムフィールド定義を収集
    const customFieldsMap = new Map(); // tagId => {tag, customFields}
    
    editingTags.forEach(tagId => {
        const tag = tags.find(t => t.id === tagId);
        if(tag?.customFields && tag.customFields.length > 0) {
            customFieldsMap.set(tagId, {
                tag: tag,
                fields: tag.customFields
            });
        }
    });
    
    if(customFieldsMap.size === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    
    // 現在編集中の資産データ
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset.customAttributes) asset.customAttributes = {};
    
    customFieldsMap.forEach((data, tagId) => {
        const { tag, fields } = data;
        
        const groupDiv = document.createElement('div');
        groupDiv.style.cssText = 'margin-bottom:24px; padding:16px; background:#f8fafc; border:1px solid var(--border); border-radius:var(--radius-md);';
        
        const groupTitle = document.createElement('h4');
        groupTitle.style.cssText = 'margin:0 0 16px 0; font-size:1rem; font-weight:600; color:var(--text);';
        groupTitle.innerHTML = `<i class="fa-solid fa-tag" style="color:var(--primary); margin-right:8px; font-size:0.9rem;"></i>${tag.name}`;
        groupDiv.appendChild(groupTitle);
        
        const fieldsGrid = document.createElement('div');
        fieldsGrid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:16px;';
        
        fields.forEach(field => {
            const fieldGroup = document.createElement('div');
            fieldGroup.className = 'form-group';
            fieldGroup.style.margin = '0';
            
            const label = document.createElement('label');
            label.htmlFor = `custom_${tagId}_${field.key}`;
            label.innerHTML = `${field.label}${field.required ? '<span style="color:var(--danger);margin-left:4px;">*</span>' : ''}`;
            fieldGroup.appendChild(label);
            
            // 現在の値を取得
            const currentValue = asset.customAttributes[tagId]?.[field.key] ?? field.defaultValue ?? '';
            
            // データ型ごとに入力フィールドを生成
            let inputElement;
            
            switch(field.type) {
                case 'number':
                    inputElement = document.createElement('input');
                    inputElement.type = 'number';
                    inputElement.id = `custom_${tagId}_${field.key}`;
                    inputElement.value = currentValue;
                    if(field.validation?.min !== undefined) inputElement.min = field.validation.min;
                    if(field.validation?.max !== undefined) inputElement.max = field.validation.max;
                    if(field.required) inputElement.required = true;
                    
                    if(field.unit) {
                        const wrapper = document.createElement('div');
                        wrapper.style.cssText = 'display:flex; align-items:center; gap:8px;';
                        wrapper.appendChild(inputElement);
                        const unitSpan = document.createElement('span');
                        unitSpan.style.cssText = 'color:var(--text-sub); font-size:0.9rem;';
                        unitSpan.textContent = field.unit;
                        wrapper.appendChild(unitSpan);
                        fieldGroup.appendChild(wrapper);
                    } else {
                        fieldGroup.appendChild(inputElement);
                    }
                    break;
                    
                case 'date':
                    inputElement = document.createElement('input');
                    inputElement.type = 'date';
                    inputElement.id = `custom_${tagId}_${field.key}`;
                    inputElement.value = currentValue;
                    if(field.required) inputElement.required = true;
                    fieldGroup.appendChild(inputElement);
                    
                    if(field.alertDays) {
                        const hint = document.createElement('small');
                        hint.style.cssText = 'display:block; margin-top:4px; color:var(--text-sub); font-size:0.8rem;';
                        hint.innerHTML = `<i class="fa-solid fa-bell" style="color:var(--warning);"></i> ${field.alertDays}日前にアラート表示`;
                        fieldGroup.appendChild(hint);
                    }
                    break;
                    
                case 'select':
                    inputElement = document.createElement('select');
                    inputElement.id = `custom_${tagId}_${field.key}`;
                    if(field.required) inputElement.required = true;
                    
                    const emptyOption = document.createElement('option');
                    emptyOption.value = '';
                    emptyOption.textContent = '選択してください';
                    inputElement.appendChild(emptyOption);
                    
                    field.options.forEach(opt => {
                        const option = document.createElement('option');
                        option.value = opt;
                        option.textContent = opt;
                        if(currentValue === opt) option.selected = true;
                        inputElement.appendChild(option);
                    });
                    
                    fieldGroup.appendChild(inputElement);
                    break;
                    
                case 'checkbox':
                    const checkboxWrapper = document.createElement('label');
                    checkboxWrapper.style.cssText = 'display:flex; align-items:center; gap:8px; cursor:pointer;';
                    
                    inputElement = document.createElement('input');
                    inputElement.type = 'checkbox';
                    inputElement.id = `custom_${tagId}_${field.key}`;
                    inputElement.checked = !!currentValue;
                    
                    checkboxWrapper.appendChild(inputElement);
                    const checkboxLabel = document.createElement('span');
                    checkboxLabel.textContent = field.checkboxLabel || field.label;
                    checkboxWrapper.appendChild(checkboxLabel);
                    
                    fieldGroup.appendChild(checkboxWrapper);
                    break;
                    
                case 'textarea':
                    inputElement = document.createElement('textarea');
                    inputElement.id = `custom_${tagId}_${field.key}`;
                    inputElement.rows = 3;
                    inputElement.value = currentValue;
                    if(field.maxLength) inputElement.maxLength = field.maxLength;
                    if(field.required) inputElement.required = true;
                    fieldGroup.appendChild(inputElement);
                    break;
                    
                default: // text
                    inputElement = document.createElement('input');
                    inputElement.type = 'text';
                    inputElement.id = `custom_${tagId}_${field.key}`;
                    inputElement.value = currentValue;
                    if(field.maxLength) inputElement.maxLength = field.maxLength;
                    if(field.pattern) inputElement.pattern = field.pattern;
                    if(field.required) inputElement.required = true;
                    fieldGroup.appendChild(inputElement);
            }
            
            fieldsGrid.appendChild(fieldGroup);
        });
        
        groupDiv.appendChild(fieldsGrid);
        container.appendChild(groupDiv);
    });
}

/**
 * カスタムフィールドの値を収集してバリデーション
 */
function collectCustomFieldValues() {
    const customAttributes = {};
    let validationErrors = [];
    
    editingTags.forEach(tagId => {
        const tag = tags.find(t => t.id === tagId);
        if(!tag?.customFields || tag.customFields.length === 0) return;
        
        const tagAttributes = {};
        
        tag.customFields.forEach(field => {
            const inputId = `custom_${tagId}_${field.key}`;
            const inputEl = document.getElementById(inputId);
            
            if(!inputEl) return;
            
            let value;
            if(field.type === 'checkbox') {
                value = inputEl.checked;
            } else if(field.type === 'number') {
                value = inputEl.value ? parseFloat(inputEl.value) : null;
            } else {
                value = inputEl.value;
            }
            
            // 必須チェック
            if(field.required && (value === null || value === '' || value === undefined)) {
                validationErrors.push({
                    field: field,
                    tag: tag,
                    element: inputEl,
                    message: `「${tag.name}」の「${field.label}」は必須項目です`
                });
                return;
            }
            
            // バリデーション
            if(value !== null && value !== '' && value !== undefined) {
                const validator = FIELD_TYPES[field.type]?.validator;
                if(validator && !validator(value, field)) {
                    let errorMsg = `「${tag.name}」の「${field.label}」の入力値が正しくありません`;
                    
                    // より詳細なエラーメッセージ
                    if(field.type === 'number') {
                        if(field.validation?.min !== undefined && field.validation?.max !== undefined) {
                            errorMsg += `（${field.validation.min}〜${field.validation.max}の範囲で入力してください）`;
                        } else if(field.validation?.min !== undefined) {
                            errorMsg += `（${field.validation.min}以上で入力してください）`;
                        } else if(field.validation?.max !== undefined) {
                            errorMsg += `（${field.validation.max}以下で入力してください）`;
                        }
                    }
                    
                    validationErrors.push({
                        field: field,
                        tag: tag,
                        element: inputEl,
                        message: errorMsg
                    });
                    return;
                }
            }
            
            // 値を設定（空の場合はnullを保存）
            tagAttributes[field.key] = (value === '' || value === undefined) ? null : value;
        });
        
        customAttributes[tagId] = tagAttributes;
    });
    
    // バリデーションエラーがある場合
    if(validationErrors.length > 0) {
        // 最初のエラーフィールドにフォーカス
        const firstError = validationErrors[0];
        firstError.element.focus();
        
        // エラーメッセージを表示
        showToast(firstError.message, 'error');
        
        // エラーを投げて保存を中断
        throw new Error('Validation failed');
    }
    
    return customAttributes;
}

