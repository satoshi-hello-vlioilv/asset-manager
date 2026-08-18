
/**
 * asset-modal.js
 * 資産詳細モーダル機能
 */

/**
 * 資産の詳細モーダルを開く
 * @param {string} assetId
 * @param {string} [initialTabId] - 'tabImages' などを渡すと、そのタブから開く
 */
function openAssetModal(assetId, initialTabId) {
    const asset = assets.find(a => a.id === assetId);
    if(!asset) return;

    // 別の資産を編集中なら、破棄してよいか先に確認する
    if(editingAssetId && editingAssetId !== assetId && hasUnsavedAssetChanges()) {
        if(!confirm('編集中の内容が未保存です。\n破棄して別の資産を開きますか？')) return;
        if(isNewAsset) assets = assets.filter(a => a.id !== editingAssetId);
    }

    isNewAsset = false;
    recordUsage('assets', assetId); // 「最近開いた資産」の学習
    openAssetModalWithData(asset, initialTabId);
}

function openAssetModalWithData(asset, initialTabId) {
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
    nameInput.oninput = () => {
        checkFieldChange(nameInput, originalAssetData.name);
        updateNameSuggestions();
    };
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
    document.getElementById('newHistoryDate').value = todayISO();
    document.getElementById('newHistoryEvent').value = '';
    historySortOrder = 'desc';
    renderHistoryRecords();

    // 周期計画タブ
    if(!asset.scheduledPlans) asset.scheduledPlans = [];
    document.getElementById('newScheduleDate').value = todayISO();
    document.getElementById('newScheduleEvent').value = '';
    document.getElementById('newScheduleCycle').value = '';
    scheduleSortOrder = 'desc';
    renderScheduleRecords();

    // 入力候補（過去の入力から自動生成）を最新化
    refreshEventSuggestions();
    
    // 画像タブ
    document.getElementById('newImageUrl').value = '';
    document.getElementById('newImageComment').value = '';
    document.getElementById('imageUrlForm').style.display = 'none';
    renderImagesGallery();
    setupImageDropZone(); // ドロップゾーンをセットアップ

    // 新規作成時は削除ボタンを「キャンセル」に変更
    const deleteBtn = document.getElementById('deleteAssetBtn');
    if(isNewAsset) {
        deleteBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> 破棄';
        deleteBtn.className = 'btn btn-ghost btn-sm';
    } else {
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i> 削除';
        deleteBtn.className = 'btn btn-danger-ghost btn-sm';
    }

    // 見出し下の補助情報（登録日・画像枚数など、開く前に知りたい概要）
    const metaEl = document.getElementById('modalAssetMeta');
    if(metaEl) {
        const childCount = getChildAssets(asset.id).length;
        const parts = [];
        if(asset.date) parts.push(`導入 ${asset.date}`);
        if(asset.images.length > 0) parts.push(`画像 ${asset.images.length}枚`);
        if(childCount > 0) parts.push(`構成パーツ ${childCount}件`);
        metaEl.textContent = parts.length ? '· ' + parts.join(' · ') : '';
    }

    renderDynamicMasterInputs();
    renderCustomFieldInputs(); // カスタムフィールド入力フォームを描画
    updateAssetTabCounts();
    updateUnsavedFlag();
    updateNameSuggestions();
    updateTagSetSuggestion();
    updateRecordNav();

    // 指定が無ければ基本情報タブから開始する（前回開いたタブが残っていると現在地を見失う）
    openModalTab(initialTabId || 'tabBasic');

    document.getElementById('assetModal').classList.add('open');

    // 新規作成時は最初の入力欄にカーソルを置く（次に何をすべきかを示す）
    if(isNewAsset) {
        setTimeout(() => {
            const nameEl = document.getElementById('editAssetName');
            if(nameEl) { nameEl.focus(); nameEl.select(); }
        }, 50);
    }
}

function checkFieldChange(element, originalValue) {
    if(element.value !== originalValue) {
        addChangeHighlight(element);
    } else {
        removeChangeHighlight(element);
    }
    updateUnsavedFlag();
}

function checkStatusChange() {
    const currentStatus = Array.from(document.querySelectorAll('.status-checkbox:checked'))
        .map(cb => cb.value).sort();
    const originalStatus = [...(originalAssetData.status || [])].sort();

    const changed = currentStatus.length !== originalStatus.length ||
                   currentStatus.some((s, i) => s !== originalStatus[i]);

    const container = document.getElementById('statusCheckboxContainer');
    if(container) {
        if(changed) addChangeHighlight(container);
        else removeChangeHighlight(container);
    }
    updateUnsavedFlag();
}

function addChangeHighlight(element) {
    if(element) element.classList.add('is-changed');
}

function removeChangeHighlight(element) {
    if(element) element.classList.remove('is-changed');
}

/**
 * 未保存の変更があるかどうかを判定する
 * 保存前に閉じようとしたときの確認と、ヘッダーの未保存表示に使う。
 */
function hasUnsavedAssetChanges() {
    if(!editingAssetId) return false;
    if(isNewAsset) return true; // 新規作成中は常に「未保存」
    if(!originalAssetData || !originalAssetData.tags) return false;

    const val = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : '';
    };

    if(val('editAssetName') !== originalAssetData.name) return true;
    if(val('editAssetDate') !== originalAssetData.date) return true;
    if(val('editAssetSpecs') !== (originalAssetData.specs || '')) return true;
    if(val('editOperationsProcedure') !== originalAssetData.operations.procedure) return true;
    if(val('editOperationsCheckpoints') !== originalAssetData.operations.checkpoints) return true;
    if(val('editRiskAssessment') !== originalAssetData.risk.assessment) return true;
    if(val('editRiskMeasures') !== originalAssetData.risk.measures) return true;

    const currentStatus = Array.from(document.querySelectorAll('.status-checkbox:checked')).map(cb => cb.value).sort();
    const originalStatus = [...(originalAssetData.status || [])].sort();
    if(currentStatus.join('|') !== originalStatus.join('|')) return true;

    const currentTags = [...editingTags].sort().join('|');
    const originalTags = [...originalAssetData.tags].sort().join('|');
    if(currentTags !== originalTags) return true;

    return false;
}

/**
 * ヘッダーの「未保存の変更があります」表示を更新する
 */
function updateUnsavedFlag() {
    const flag = document.getElementById('assetUnsavedFlag');
    if(!flag) return;
    flag.classList.toggle('show', !isNewAsset && hasUnsavedAssetChanges());
}

/**
 * タブのラベルに件数を出す
 * 中身があるタブが一目で分かれば、順番に開いて確かめる必要がなくなる。
 */
function updateAssetTabCounts() {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset) return;

    const set = (id, count) => {
        const el = document.getElementById(id);
        if(!el) return;
        el.textContent = count;
        const tab = el.closest('.tab');
        if(tab) tab.classList.toggle('is-empty', count === 0);
    };

    set('tabCountImages', asset.images?.length || 0);
    set('tabCountComponents', getChildAssets(asset.id).length);
    set('tabCountSchedule', asset.scheduledPlans?.length || 0);
    set('tabCountMaint', asset.maintenance?.length || 0);
}

/**
 * タブIDを指定してタブを開く
 */
function openModalTab(tabId) {
    const tabEl = Array.from(document.querySelectorAll('#assetModal .tabs .tab'))
        .find(t => (t.getAttribute('onclick') || '').includes(`'${tabId}'`));
    if(tabEl) switchTab(tabEl, tabId);
}

/* ============================================================
   入力サジェスト
   ============================================================ */

/**
 * 資産名の入力補助
 * - 同名の資産が既にある場合は、保存前に気づけるよう警告する
 * - 末尾が数字なら次の連番を提案する（No.101 → No.102）
 * - 新規で未入力なら、直前に登録した資産の連番を提案する
 */
function updateNameSuggestions() {
    const row = document.getElementById('nameSuggestRow');
    const input = document.getElementById('editAssetName');
    if(!row || !input) return;

    const name = input.value.trim();
    const parts = [];
    const chips = [];

    if(name) {
        if(findDuplicateAssetName(name, editingAssetId)) {
            parts.push(`<span class="suggest-row-label" style="color:var(--warning-fg);">
                <i class="fa-solid fa-triangle-exclamation"></i> 同じ名前の資産が既にあります</span>`);
            const next = buildNextSerialName(name);
            if(next && !findDuplicateAssetName(next, editingAssetId)) chips.push(next);
        }
    } else if(isNewAsset) {
        // 直前に登録した資産、無ければ最後に追加された資産を基準にする
        const base = assets.find(a => a.id === lastCreatedAssetId)
                  || getPersistedAssets().slice(-1)[0];
        if(base) {
            const next = buildNextSerialName(base.name);
            if(next && !findDuplicateAssetName(next, editingAssetId)) {
                parts.push(`<span class="suggest-row-label"><i class="fa-solid fa-lightbulb"></i> 連番で登録:</span>`);
                chips.push(next);
            }
        }
    }

    if(parts.length === 0 && chips.length === 0) {
        row.style.display = 'none';
        row.innerHTML = '';
        return;
    }

    row.style.display = 'flex';
    row.innerHTML = parts.join('') + chips
        .map(c => `<button type="button" class="suggest-chip" data-name="${escapeHTML(c)}">
                       <i class="fa-solid fa-arrow-turn-down" style="transform:rotate(90deg);"></i>${escapeHTML(c)}
                   </button>`)
        .join('');

    row.querySelectorAll('[data-name]').forEach(btn => {
        btn.onclick = () => {
            input.value = btn.dataset.name;
            input.focus();
            checkFieldChange(input, originalAssetData.name);
            updateNameSuggestions();
        };
    });
}

/**
 * 「前回と同じタグ構成を適用」の提案
 * 同種の資産をまとめて登録するとき、タグ選択の繰り返しをまるごと省略できる。
 */
function updateTagSetSuggestion() {
    const row = document.getElementById('tagSetSuggestRow');
    if(!row) return;

    const suggestion = getLastCreatedTagSet();
    const alreadySame = suggestion &&
        [...editingTags].sort().join('|') === [...suggestion.tagIds].sort().join('|');

    if(!isNewAsset || !suggestion || alreadySame) {
        row.style.display = 'none';
        row.innerHTML = '';
        return;
    }

    const names = suggestion.tagIds
        .map(id => tags.find(t => t.id === id))
        .filter(Boolean).map(t => t.name);

    row.style.display = 'flex';
    row.innerHTML = `
        <span class="suggest-row-label"><i class="fa-solid fa-clone"></i> 直前の登録と同じタグ:</span>
        <button type="button" class="suggest-chip" id="applyLastTagSetBtn" title="${escapeHTML(names.join('、'))}">
            <i class="fa-solid fa-plus"></i>${escapeHTML(suggestion.asset.name)} と同じ（${names.length}件）
        </button>`;
    document.getElementById('applyLastTagSetBtn').onclick = () => applyLastTagSet();
}

function applyLastTagSet() {
    const suggestion = getLastCreatedTagSet();
    if(!suggestion) return;

    suggestion.tagIds.forEach(id => {
        if(!editingTags.includes(id)) editingTags.push(id);
    });
    masters.forEach(m => renderChipsForMaster(m.id));
    checkTagsChange();
    updateTagSetSuggestion();
    showToast(`「${suggestion.asset.name}」と同じタグを設定しました`, 'success');
}

/**
 * 履歴・周期計画の実施内容の候補を datalist に流し込む
 */
function refreshEventSuggestions() {
    const datalist = document.getElementById('eventSuggestions');
    const texts = getFrequentEventTexts(12);
    if(datalist) {
        datalist.innerHTML = texts.map(t => `<option value="${escapeHTML(t)}"></option>`).join('');
    }

    // よく使う実施内容をワンクリックで入れられるチップも出す
    renderEventChips('historySuggestRow', 'newHistoryEvent', texts.slice(0, 5));
    renderEventChips('scheduleSuggestRow', 'newScheduleEvent', texts.slice(0, 4), true);
}

function renderEventChips(rowId, inputId, texts, withCyclePresets = false) {
    const row = document.getElementById(rowId);
    if(!row) return;

    const parts = [];
    if(texts.length > 0) {
        parts.push('<span class="suggest-row-label"><i class="fa-solid fa-clock-rotate-left"></i> よく使う:</span>');
        parts.push(...texts.map(t =>
            `<button type="button" class="suggest-chip" data-event="${escapeHTML(t)}">${escapeHTML(t)}</button>`));
    }
    if(withCyclePresets) {
        parts.push('<span class="suggest-row-label" style="margin-left:var(--space-2);">周期:</span>');
        parts.push(...[30, 90, 180, 365].map(d =>
            `<button type="button" class="suggest-chip" data-cycle="${d}">${d === 365 ? '1年' : d + '日'}</button>`));
    }

    row.style.display = parts.length ? 'flex' : 'none';
    row.innerHTML = parts.join('');

    row.querySelectorAll('[data-event]').forEach(btn => {
        btn.onclick = () => {
            const input = document.getElementById(inputId);
            input.value = btn.dataset.event;
            input.focus();
            recordUsage('events', btn.dataset.event);
        };
    });
    row.querySelectorAll('[data-cycle]').forEach(btn => {
        btn.onclick = () => {
            document.getElementById('newScheduleCycle').value = btn.dataset.cycle;
            updateScheduleDateFromCycle();
        };
    });
}

/**
 * 周期を入力したら、次回予定日を「今日 + 周期」で自動的に埋める
 * 手で日付を選び直す手間をなくす。すでに未来日が入っている場合は触らない。
 */
function updateScheduleDateFromCycle() {
    const cycleEl = document.getElementById('newScheduleCycle');
    const dateEl = document.getElementById('newScheduleDate');
    if(!cycleEl || !dateEl) return;

    const cycle = parseInt(cycleEl.value, 10);
    if(!cycle || cycle < 1) return;

    // 既定値（今日）のままなら、周期から計算した日付に置き換える
    if(!dateEl.value || dateEl.value === todayISO()) {
        dateEl.value = addDaysISO(todayISO(), cycle);
    }
}

/* ============================================================
   一覧の前後移動
   ============================================================ */

/**
 * ヘッダーの「◀ n / m ▶」を更新する
 */
function updateRecordNav() {
    const nav = document.getElementById('assetRecordNav');
    const pos = document.getElementById('assetRecordPos');
    if(!nav || !pos) return;

    if(isNewAsset || !editingAssetId) { nav.style.display = 'none'; return; }

    const list = getDisplayedAssets();
    const index = list.findIndex(a => a.id === editingAssetId);
    if(index < 0 || list.length < 2) { nav.style.display = 'none'; return; }

    nav.style.display = 'inline-flex';
    pos.textContent = `${index + 1} / ${list.length}`;
}

/**
 * 一覧の順序で前後の資産に移動する（閉じて開き直す手間をなくす）
 * @param {number} delta -1 or 1
 */
function stepAsset(delta) {
    if(isNewAsset || !editingAssetId) return;

    const list = getDisplayedAssets();
    const index = list.findIndex(a => a.id === editingAssetId);
    if(index < 0 || list.length < 2) return;

    const next = list[(index + delta + list.length) % list.length];
    if(!next || next.id === editingAssetId) return;

    if(hasUnsavedAssetChanges()) {
        if(!confirm('未保存の変更があります。\n破棄して次の資産に移動しますか？')) return;
        originalAssetData = {};
    }
    openAssetModal(next.id);
}

/**
 * ステータスチェックボックスをSTATUS_DEFSから動的に生成
 * 当たり判定の広いチップ型にして、選択中は色で分かるようにする。
 */
function renderStatusCheckboxes() {
    const container = document.getElementById('statusCheckboxContainer');
    if(!container) return;

    container.innerHTML = STATUS_DEFS.map(def => `
        <label class="choice">
            <input type="checkbox" class="status-checkbox" value="${escapeHTML(def.value)}">
            <span style="display:inline-flex; align-items:center; gap:6px;">
                <span style="width:8px; height:8px; border-radius:50%; background:${def.nodeColor};"></span>
                ${escapeHTML(def.value)}
            </span>
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
        label.className = 'field-label';
        label.style.marginBottom = '6px';
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

        // よく使うタグをワンクリックで足せる行（入力しなくても済む導線）
        const quickRow = document.createElement('div');
        quickRow.className = 'suggest-row';
        quickRow.id = `quick-${m.id}`;
        quickRow.style.marginTop = '4px';
        wrapper.appendChild(quickRow);

        container.appendChild(wrapper);

        renderChipsForMaster(m.id);
        setupDynamicTagSearch(m.id, input, dropdown);
    });
}

/**
 * そのマスタの「よく使うタグ」チップを描画する
 */
function renderQuickTagsForMaster(masterId) {
    const row = document.getElementById(`quick-${masterId}`);
    if(!row) return;

    const frequent = getFrequentTags(masterId, editingTags, 4);
    if(frequent.length === 0) {
        row.style.display = 'none';
        row.innerHTML = '';
        return;
    }

    row.style.display = 'flex';
    row.innerHTML = frequent
        .map(t => `<button type="button" class="suggest-chip" data-add-tag="${t.id}">
                       <i class="fa-solid fa-plus"></i>${escapeHTML(t.name)}
                   </button>`)
        .join('');

    row.querySelectorAll('[data-add-tag]').forEach(btn => {
        btn.onclick = () => addTagToEditing(Number(btn.dataset.addTag), masterId);
    });
}

/**
 * 編集中の資産にタグを追加する（候補選択・チップ・提案から共通で呼ぶ）
 */
function addTagToEditing(tagId, masterId) {
    if(editingTags.includes(tagId)) return;
    editingTags.push(tagId);
    recordUsage('tags', tagId); // 使用頻度の学習
    renderChipsForMaster(masterId);
    checkTagsChange();
    rerenderCustomFields();     // タグ固有のカスタム項目を出し分ける
    updateTagSetSuggestion();
}

/**
 * カスタムフィールド欄を作り直す
 * 入力途中の値を消さないよう、画面上の値を先に資産へ退避してから描き直す。
 * （バリデーションはここでは行わない。保存時にまとめて検証する）
 */
function rerenderCustomFields() {
    const asset = assets.find(a => a.id === editingAssetId);
    if(asset) {
        if(!asset.customAttributes) asset.customAttributes = {};
        editingTags.forEach(tagId => {
            const tag = tags.find(t => t.id === tagId);
            if(!tag?.customFields) return;
            tag.customFields.forEach(field => {
                const el = document.getElementById(`custom_${tagId}_${field.key}`);
                if(!el) return;
                if(!asset.customAttributes[tagId]) asset.customAttributes[tagId] = {};
                asset.customAttributes[tagId][field.key] =
                    field.type === 'checkbox' ? el.checked :
                    field.type === 'number'   ? (el.value ? parseFloat(el.value) : null) :
                    el.value;
            });
        });
    }
    renderCustomFieldInputs();
}

function renderChipsForMaster(masterId) {
    const container = document.getElementById(`chips-${masterId}`);
    if(!container) return;
    container.innerHTML = '';

    const relevantTags = editingTags
        .map(tId => tags.find(t => t.id === tId))
        .filter(t => t && t.masterId === masterId);

    relevantTags.forEach(t => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.innerHTML = `<span>${escapeHTML(t.name)}</span><i class="fa-solid fa-xmark" title="外す"></i>`;
        chip.querySelector('i').onclick = (e) => {
            e.stopPropagation();
            editingTags = editingTags.filter(id => id !== t.id);
            renderChipsForMaster(masterId);
            checkTagsChange();
            rerenderCustomFields();
            updateTagSetSuggestion();
        };
        container.appendChild(chip);
    });

    renderQuickTagsForMaster(masterId);
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
    updateUnsavedFlag();
}

/**
 * タグ入力のオートコンプリート
 *
 * - 候補は「使いそうな順」（使用実績 → 付与件数 → 名前）に並べる
 * - ↑↓ で候補を移動し、Enter で確定できる（マウスに持ち替えなくてよい）
 * - 付与済みの件数を添えて、どれが定番なのかを推測させない
 */
function setupDynamicTagSearch(masterId, input, dropdown) {
    let activeIndex = -1;

    const getItems = () => Array.from(dropdown.querySelectorAll('.tag-dropdown-item'));

    const setActive = (index) => {
        const items = getItems();
        if(items.length === 0) return;
        activeIndex = (index + items.length) % items.length;
        items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
        items[activeIndex].scrollIntoView({ block: 'nearest' });
    };

    const commit = (tagId) => {
        addTagToEditing(tagId, masterId);
        input.value = '';
        dropdown.classList.remove('show');
        activeIndex = -1;
        input.focus();
    };

    const showCandidates = (val) => {
        const needle = val.toLowerCase().trim();
        const matches = sortTagsBySuggestion(tags.filter(t =>
            t.masterId === masterId &&
            (needle === '' || t.name.toLowerCase().includes(needle)) &&
            !editingTags.includes(t.id)
        ));

        dropdown.innerHTML = '';
        activeIndex = -1;

        if(matches.length > 0) {
            const attachCount = getTagAttachCounts();
            matches.slice(0, needle === '' ? 12 : 30).forEach(t => {
                const item = document.createElement('div');
                item.className = 'tag-dropdown-item';

                // 階層の位置（親の名前）を添えて、同名タグの取り違えを防ぐ
                let parentName = '';
                if(t.parentIds.length > 0) {
                    const p = tags.find(pt => pt.id === t.parentIds[0]);
                    if(p) parentName = `<span class="tag-path">${escapeHTML(p.name)} の下</span>`;
                }
                const n = attachCount.get(t.id) || 0;
                item.innerHTML = `
                    <span style="min-width:0; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(t.name)}</span>
                    <span style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                        ${parentName}${n > 0 ? `<span class="tag-freq">${n}件</span>` : ''}
                    </span>`;
                item.onmousemove = () => setActive(getItems().indexOf(item));
                item.onclick = (e) => { e.stopPropagation(); commit(t.id); };
                dropdown.appendChild(item);
            });
            dropdown.classList.add('show');
            setActive(0);
        } else if(needle !== '') {
            // 候補ゼロを黙って閉じると「壊れている」と受け取られる。理由と次の手を示す。
            dropdown.innerHTML = `
                <div class="tag-dropdown-empty">
                    「${escapeHTML(val)}」に一致するタグはありません。<br>
                    タグの追加は「マスタ・タグ設定」から行えます。
                </div>`;
            dropdown.classList.add('show');
        } else {
            dropdown.classList.remove('show');
        }
    };

    input.addEventListener('input', (e) => showCandidates(e.target.value));
    input.addEventListener('focus', () => showCandidates(input.value));

    input.addEventListener('keydown', (e) => {
        if(e.isComposing) return; // 日本語入力の変換中は無視
        if(!dropdown.classList.contains('show')) return;

        const items = getItems();
        if(e.key === 'ArrowDown')      { e.preventDefault(); setActive(activeIndex + 1); }
        else if(e.key === 'ArrowUp')   { e.preventDefault(); setActive(activeIndex - 1); }
        else if(e.key === 'Enter' && items[activeIndex]) {
            e.preventDefault();
            items[activeIndex].click();
        } else if(e.key === 'Escape') {
            dropdown.classList.remove('show');
        }
    });

    document.addEventListener('click', (e) => {
        if(!e.target.closest('.tag-input-container')) {
            dropdown.classList.remove('show');
        }
    });
}

/**
 * 新規資産の下書きを作って編集モーダルを開く
 * 下書きは一時IDで assets に置かれ、保存するまで一覧・統計には現れない。
 */
function createNewAsset() {
    // 別の資産を編集中に上書きしてしまわないよう、先に確認する
    if(document.getElementById('assetModal').classList.contains('open')) {
        closeModal('assetModal');
        if(document.getElementById('assetModal').classList.contains('open')) return; // 閉じるのを取り消した
    }

    isNewAsset = true;
    const newId = 'temp_' + Date.now(); // 一時ID
    editingAssetId = newId;
    
    // 仮の新規資産オブジェクトを作成してassetsに追加（編集中にデータを保持するため）
    const newAsset = {
        id: newId,
        name: '',
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
    
    // 絞り込み中の分類をそのまま引き継ぐ（見ていた文脈で登録するのが自然）
    const initial = getInitialTagsForNewAsset();
    newAsset.tags = [...initial.autoTags];

    assets.push(newAsset); // 一時的に追加
    openAssetModalWithData(newAsset);

    // 見出しは「資産詳細」ではなく、これから何をするかを示す
    document.getElementById('modalTitle').innerText = '新規資産の登録';
    document.getElementById('modalAssetId').innerText = '保存すると資産IDが発行されます';
    const metaEl = document.getElementById('modalAssetMeta');
    if(metaEl) metaEl.textContent = '';

    if(initial.reason) showToast(initial.reason, 'info');
}

function saveAssetChanges() {
    if(!editingAssetId) return;

    // 現在編集中の一時資産(新規)または既存資産を取得
    const currentEditingAsset = assets.find(a => a.id === editingAssetId);
    if(!currentEditingAsset) return;

    // 資産名は一覧・検索・グラフのすべてで識別子として使われるため必須
    const nameInput = document.getElementById('editAssetName');
    if(!nameInput.value.trim()) {
        const basicTab = document.querySelector('#assetModal .tabs .tab');
        if(basicTab) switchTab(basicTab, 'tabBasic');
        nameInput.focus();
        addChangeHighlight(nameInput);
        showToast('資産名称を入力してください', 'warning');
        return;
    }

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
                name: document.getElementById('editAssetName').value.trim(),
                date: document.getElementById('editAssetDate').value,
                status: Array.from(document.querySelectorAll('.status-checkbox:checked'))
                    .map(cb => cb.value),
                specs: document.getElementById('editAssetSpecs').value,
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
            // 表示リストは applyFilters() が assets から再計算するため、
            // 個別のリストへ手で足し込む必要はない。
            assets.push(newAsset);

            // 下書き用の一時IDで保存していた画像を、正式な資産IDに結び付け直す
            // （表示には影響しない情報なので、失敗しても保存自体は止めない）
            newAsset.images.forEach(img => {
                if(img.id) db.images.update(img.id, { assetId: newId }).catch(() => {});
            });

            isNewAsset = false;
            // 次の登録で「前回と同じタグ」を提案できるよう覚えておく
            lastCreatedAssetId = newId;
            newAsset.tags.forEach(id => recordUsage('tags', id));
            invalidateSuggestionCaches();
            showToast(`「${newAsset.name}」を登録しました`, 'success');

        } else {
            // 既存資産の更新（オブジェクトの参照を直接書き換える）
            const asset = currentEditingAsset;

            asset.name = document.getElementById('editAssetName').value.trim();
            asset.date = document.getElementById('editAssetDate').value;
            asset.status = Array.from(document.querySelectorAll('.status-checkbox:checked'))
                .map(cb => cb.value);
            asset.specs = document.getElementById('editAssetSpecs').value;
            asset.tags = [...editingTags];
            // parentIdは構成管理で設定するのでここでは触らない
            
            // 画像の実体は images ストアにあるため、資産側は参照のみを保持する
            delete asset.image;


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
            
            invalidateSuggestionCaches();
            showToast(`「${asset.name}」を保存しました`, 'success');
        }

        // 保存が完了したので、閉じる際の未保存確認は出さない
        originalAssetData = {};
        editingAssetId = null;
        document.getElementById('assetModal').classList.remove('open');

        // 現在の絞り込み条件で画面を再構築（タグを変えた結果も正しく反映される）
        renderSidebar();
        refreshCurrentView();
        autoSaveData();

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
        // 新規作成中の場合は一時資産を破棄（貼り付けた画像も残さない）
        const draft = assets.find(a => a.id === editingAssetId);
        if(draft) deleteImagesOfAsset(draft);
        assets = assets.filter(a => a.id !== editingAssetId);
        isNewAsset = false;
        editingAssetId = null;
        originalAssetData = {};
        document.getElementById('assetModal').classList.remove('open');
        refreshCurrentView();
        showToast('入力内容を破棄しました', 'info');
        return;
    }

    const target = assets.find(a => a.id === editingAssetId);
    if(!target) return;

    // 影響範囲（子資産）を事前に伝える。削除して初めて気づく事態を避ける。
    const children = getChildAssets(target.id);
    const warning = children.length > 0
        ? `\n\nこの資産には構成パーツが${children.length}件あります。\nそれらの「所属先」は未設定になります。`
        : '';

    if(!confirm(`「${target.name}」を削除しますか？${warning}\n\nこの操作は取り消せません。`)) return;

    // 子資産の親参照を外してから削除する（存在しない親を指したままにしない）
    children.forEach(child => { child.parentId = null; });
    deleteImagesOfAsset(target); // 画像の実体も一緒に片付ける
    assets = assets.filter(a => a.id !== editingAssetId);

    isNewAsset = false;
    editingAssetId = null;
    originalAssetData = {};
    document.getElementById('assetModal').classList.remove('open');

    renderSidebar();
    refreshCurrentView();
    showToast(`「${target.name}」を削除しました`, 'success');
    autoSaveData();
}

// closeModal は js/ui.js で定義（旧版ではここに重複定義があったため統合）

function switchTab(el, tabId) {
    el.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.querySelectorAll('#assetModal .tab-pane').forEach(p => p.classList.remove('active'));
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
    
    const parentAsset = getParentAsset(editingAssetId);

    if(!parentAsset) {
        container.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:var(--space-3); padding:var(--space-3); background:var(--surface-sunken); border:1px solid var(--border); border-radius:var(--radius-md);">
                <span style="display:flex; align-items:center; gap:var(--space-2); color:var(--text-sub); font-size:var(--text-sm);">
                    <i class="fa-solid fa-sitemap" style="opacity:0.5;"></i>
                    どの資産にも属していません（最上位の資産です）
                </span>
                <button class="btn btn-outline btn-sm" onclick="openAssetStructureModal()">
                    <i class="fa-solid fa-diagram-project"></i> 所属先を設定
                </button>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:var(--space-3); padding:var(--space-3); background:var(--surface-sunken); border:1px solid var(--border); border-radius:var(--radius-md);">
            <div style="min-width:0;">
                <div class="field-label" style="margin-bottom:2px;">所属先</div>
                <div style="font-weight:600; cursor:pointer; color:var(--primary);"
                     onclick="openAssetModal('${parentAsset.id}')" title="クリックして親資産を開く">
                    <i class="fa-solid fa-arrow-turn-up" style="font-size:0.75rem; opacity:0.7;"></i>
                    ${escapeHTML(parentAsset.name)}
                    <span style="font-size:var(--text-xs); color:var(--text-sub); font-family:var(--font-mono);">${escapeHTML(parentAsset.id.toUpperCase())}</span>
                </div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="openAssetStructureModal()">
                <i class="fa-solid fa-diagram-project"></i> 変更
            </button>
        </div>`;
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
            <div class="empty-state" style="padding:var(--space-8) var(--space-5);">
                <i class="fa-solid fa-cubes-stacked empty-state-icon"></i>
                <div class="empty-state-title">構成パーツはまだありません</div>
                <div class="empty-state-desc">
                    「構成を編集」から、この資産の下にぶら下げる資産をつなげられます
                </div>
                <button class="btn btn-primary btn-sm" onclick="openAssetStructureModal()">
                    <i class="fa-solid fa-diagram-project"></i> 構成を編集
                </button>
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
                    <div style="width:80px; height:80px; flex-shrink:0; background:var(--surface-sunken); border-radius:var(--radius-md); display:flex; align-items:center; justify-content:center; overflow:hidden;">
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
                <div class="hint hint-neutral">
                    <i class="fa-solid fa-circle-info"></i>
                    <span>この資産はどこにも属していない最上位の資産です。「構成を編集」から所属先を設定できます。</span>
                </div>
            `;
        } else {
            const myTags = tags.filter(t => parentAsset.tags.includes(t.id));
            const statusBadges = renderStatusBadgesHTML(parentAsset.status);
            const thumbnailUrl = getAssetThumbnailUrl(parentAsset);

            parentContainer.innerHTML = `
                <div style="display:flex; gap:16px; padding:16px; background:var(--surface-sunken); border:1px solid var(--border); border-radius:var(--radius-md); cursor:pointer; transition:all 0.2s;" 
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
        groupDiv.style.cssText = 'margin-bottom:var(--space-3); padding:var(--d-card-pad); background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg);';
        
        const groupTitle = document.createElement('h4');
        groupTitle.style.cssText = 'margin:0 0 var(--space-3) 0; font-size:var(--text-md); font-weight:650; color:var(--text-strong);';
        groupTitle.innerHTML = `<i class="fa-solid fa-tag" style="color:var(--primary); margin-right:8px; font-size:0.9rem;"></i>${tag.name}`;
        groupDiv.appendChild(groupTitle);
        
        const fieldsGrid = document.createElement('div');
        fieldsGrid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px var(--space-4);';
        
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

