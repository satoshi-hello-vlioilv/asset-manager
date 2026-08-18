
/**
 * maintenance.js
 * 履歴・周期計画管理
 */

function renderHistoryRecords() {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.maintenance) return;
    
    const container = document.getElementById('historyRecordsContainer');

    if(typeof updateAssetTabCounts === 'function') updateAssetTabCounts();

    // ソートボタンの状態を更新
    const sortDescBtn = document.getElementById('sortDescBtn');
    const sortAscBtn = document.getElementById('sortAscBtn');
    setToggleActive(historySortOrder === 'desc' ? sortDescBtn : sortAscBtn);
    setToggleInactive(historySortOrder === 'desc' ? sortAscBtn : sortDescBtn);
    
    if(asset.maintenance.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-regular fa-clock empty-state-icon"></i>
                <div class="empty-state-title">履歴はまだありません</div>
                <div class="empty-state-desc">上のフォームに実施内容を入力して追加してください</div>
            </div>`;
        return;
    }
    
    // ソート
    const sortedRecords = [...asset.maintenance].sort((a, b) => {
        if(historySortOrder === 'desc') {
            return new Date(b.date) - new Date(a.date);
        } else {
            return new Date(a.date) - new Date(b.date);
        }
    });
    
    // リスト表示（1行1件。編集中のみ入力欄に切り替える）
    container.innerHTML = sortedRecords.map(record => {
        const index = asset.maintenance.indexOf(record);
        const isEditing = record._editing;

        if(isEditing) {
            return `
                <div class="record-row" id="history-item-${index}">
                    <input type="date" id="edit-date-${index}" value="${escapeHTML(record.date)}" class="input" style="flex:0 0 140px;">
                    <input type="text" id="edit-event-${index}" class="input" style="flex:1;"
                           value="${escapeHTML(record.event)}" list="eventSuggestions">
                    <div style="display:flex; gap:4px; flex-shrink:0;">
                        <button class="btn btn-primary btn-sm" onclick="saveHistoryRecord(${index})" title="保存">
                            <i class="fa-solid fa-check"></i>
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="cancelEditHistory(${index})" title="取り消し">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>`;
        }

        return `
            <div class="record-row" id="history-item-${index}">
                <div class="record-date">
                    ${escapeHTML(record.date)}
                    <span class="record-rel">${escapeHTML(formatDateRelative(record.date))}</span>
                </div>
                <div class="record-body">${escapeHTML(record.event)}</div>
                <div class="record-actions">
                    <button class="btn btn-ghost btn-sm btn-icon-only" onclick="editHistoryRecord(${index})" title="編集">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-danger-ghost btn-sm btn-icon-only" onclick="deleteHistoryRecord(${index})" title="削除">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>`;
    }).join('');
}

function addHistoryRecord() {
    const date = document.getElementById('newHistoryDate').value;
    const event = document.getElementById('newHistoryEvent').value.trim();
    
    if(!date) {
        showToast('日付を入力してください', 'warning');
        return;
    }
    
    if(!event) {
        showToast('イベント内容を入力してください', 'warning');
        return;
    }
    
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset) return;
    
    if(!asset.maintenance) asset.maintenance = [];
    
    asset.maintenance.push({ date, event });
    recordUsage('events', event); // 次回の入力候補として学習

    // フォームをリセット（日付は今日のまま残し、続けて入力できるようにする）
    document.getElementById('newHistoryDate').value = todayISO();
    document.getElementById('newHistoryEvent').value = '';
    document.getElementById('newHistoryEvent').focus();

    renderHistoryRecords();
    refreshEventSuggestions();
    refreshCurrentView();
    showToast('履歴を追加しました');
    autoSaveData();
}

function editHistoryRecord(index) {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.maintenance[index]) return;
    
    // 編集モードフラグを設定
    asset.maintenance[index]._editing = true;
    // 元の値を保存（キャンセル用）
    asset.maintenance[index]._originalDate = asset.maintenance[index].date;
    asset.maintenance[index]._originalEvent = asset.maintenance[index].event;
    
    renderHistoryRecords();
}

function saveHistoryRecord(index) {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.maintenance[index]) return;
    
    const newDate = document.getElementById(`edit-date-${index}`).value;
    const newEvent = document.getElementById(`edit-event-${index}`).value.trim();
    
    if(!newDate) {
        showToast('日付を入力してください', 'warning');
        return;
    }
    
    if(!newEvent) {
        showToast('イベント内容を入力してください', 'warning');
        return;
    }
    
    asset.maintenance[index].date = newDate;
    asset.maintenance[index].event = newEvent;
    delete asset.maintenance[index]._editing;
    delete asset.maintenance[index]._originalDate;
    delete asset.maintenance[index]._originalEvent;
    
    renderHistoryRecords();
    showToast('履歴を更新しました');
    autoSaveData(); // 自動保存
}

function cancelEditHistory(index) {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.maintenance[index]) return;
    
    // 元の値に戻す
    asset.maintenance[index].date = asset.maintenance[index]._originalDate;
    asset.maintenance[index].event = asset.maintenance[index]._originalEvent;
    delete asset.maintenance[index]._editing;
    delete asset.maintenance[index]._originalDate;
    delete asset.maintenance[index]._originalEvent;
    
    renderHistoryRecords();
}

function deleteHistoryRecord(index) {
    if(!confirm('この履歴を削除しますか?')) return;
    
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.maintenance) return;
    
    asset.maintenance.splice(index, 1);
    renderHistoryRecords();
    refreshCurrentView();
    showToast('履歴を削除しました');
    autoSaveData();
}

function sortHistory(order) {
    historySortOrder = order;
    renderHistoryRecords();
}

function renderScheduleRecords() {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset) return;
    
    if(!asset.scheduledPlans) asset.scheduledPlans = [];
    
    const container = document.getElementById('scheduleRecordsContainer');

    if(typeof updateAssetTabCounts === 'function') updateAssetTabCounts();

    // ソートボタンの状態を更新
    const sortDescBtn = document.getElementById('sortScheduleDescBtn');
    const sortAscBtn = document.getElementById('sortScheduleAscBtn');
    setToggleActive(scheduleSortOrder === 'desc' ? sortDescBtn : sortAscBtn);
    setToggleInactive(scheduleSortOrder === 'desc' ? sortAscBtn : sortDescBtn);
    
    if(asset.scheduledPlans.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-regular fa-calendar-check empty-state-icon"></i>
                <div class="empty-state-title">周期計画はまだありません</div>
                <div class="empty-state-desc">点検や交換の予定を登録すると、ダッシュボードの「要対応」に自動で並びます</div>
            </div>`;
        return;
    }
    
    // ソート
    const sortedRecords = [...asset.scheduledPlans].sort((a, b) => {
        if(scheduleSortOrder === 'desc') {
            return new Date(b.date) - new Date(a.date);
        } else {
            return new Date(a.date) - new Date(b.date);
        }
    });
    
    // リスト表示（1行1件。期限の状態を左端の色と右側の残日数で示す）
    container.innerHTML = sortedRecords.map(record => {
        const index = asset.scheduledPlans.indexOf(record);
        const days = daysUntil(record.date);
        const isOverdue = days < 0;

        if(record._editing) {
            return `
                <div class="record-row" id="schedule-item-${index}">
                    <input type="date" id="edit-schedule-date-${index}" value="${escapeHTML(record.date)}" class="input" style="flex:0 0 140px;">
                    <input type="number" id="edit-schedule-cycle-${index}" value="${record.cycle || ''}" placeholder="周期" min="1" class="input" style="flex:0 0 90px;">
                    <input type="text" id="edit-schedule-event-${index}" value="${escapeHTML(record.event)}" class="input" style="flex:1;" list="eventSuggestions">
                    <div style="display:flex; gap:4px; flex-shrink:0;">
                        <button class="btn btn-primary btn-sm" onclick="saveScheduleRecord(${index})" title="保存">
                            <i class="fa-solid fa-check"></i>
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="cancelEditSchedule(${index})" title="取り消し">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>`;
        }

        const tone = isOverdue ? 'var(--danger)' : days <= 7 ? 'var(--warning)' : 'var(--text-sub)';

        return `
            <div class="record-row ${isOverdue ? 'is-overdue' : ''}" id="schedule-item-${index}">
                <div class="record-date">
                    ${escapeHTML(record.date)}
                    <span class="record-rel" style="color:${tone};">${escapeHTML(formatDayDelta(days))}</span>
                </div>
                <div class="record-body">
                    ${escapeHTML(record.event)}
                    ${record.cycle ? `<span class="record-meta"><i class="fa-solid fa-rotate"></i> ${record.cycle}日ごと</span>` : ''}
                </div>
                <div class="record-actions">
                    <button class="btn btn-outline btn-sm" onclick="completeScheduleRecord(${index})"
                            title="今日実施したものとして履歴に記録し、次回予定へ進めます">
                        <i class="fa-solid fa-check"></i> 実施済み
                    </button>
                    <button class="btn btn-ghost btn-sm btn-icon-only" onclick="editScheduleRecord(${index})" title="編集">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-danger-ghost btn-sm btn-icon-only" onclick="deleteScheduleRecord(${index})" title="削除">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>`;
    }).join('');
}

/**
 * 周期計画を「今日実施した」ものとして片付ける
 *
 * 実務では「点検した → 履歴に記録 → 次回予定を先に送る」が必ずセットで発生する。
 * 3画面を行き来する代わりに、1クリックで完了できるようにしている。
 * @param {number} index
 */
function completeScheduleRecord(index) {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.scheduledPlans[index]) return;

    const plan = asset.scheduledPlans[index];
    const before = { date: plan.date };

    // 1. 実施内容を履歴に残す
    if(!asset.maintenance) asset.maintenance = [];
    const historyRecord = { date: todayISO(), event: plan.event };
    asset.maintenance.push(historyRecord);
    recordUsage('events', plan.event);

    // 2. 周期があれば次回へ送り、無ければ予定そのものを消化する
    let message;
    if(plan.cycle) {
        plan.date = addDaysISO(todayISO(), plan.cycle);
        message = `履歴に記録し、次回を ${plan.date} に更新しました`;
    } else {
        asset.scheduledPlans.splice(index, 1);
        message = '履歴に記録し、予定を完了しました';
    }

    renderScheduleRecords();
    renderHistoryRecords();
    refreshEventSuggestions();
    refreshCurrentView();
    autoSaveData();

    showToast(message, 'success', {
        label: '元に戻す',
        onClick: () => {
            const hIndex = asset.maintenance.indexOf(historyRecord);
            if(hIndex >= 0) asset.maintenance.splice(hIndex, 1);
            if(plan.cycle) plan.date = before.date;
            else asset.scheduledPlans.splice(index, 0, plan);
            renderScheduleRecords();
            renderHistoryRecords();
            refreshCurrentView();
            autoSaveData();
        }
    });
}

function addScheduleRecord() {
    const date = document.getElementById('newScheduleDate').value;
    const event = document.getElementById('newScheduleEvent').value.trim();
    const cycle = document.getElementById('newScheduleCycle').value.trim();
    
    if(!date) {
        showToast('日時を入力してください', 'warning');
        return;
    }
    
    if(!event) {
        showToast('イベント内容を入力してください', 'warning');
        return;
    }
    
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset) return;
    
    if(!asset.scheduledPlans) asset.scheduledPlans = [];
    
    asset.scheduledPlans.push({
        date,
        event,
        cycle: cycle ? parseInt(cycle) : null
    });
    recordUsage('events', event);

    document.getElementById('newScheduleDate').value = todayISO();
    document.getElementById('newScheduleEvent').value = '';
    document.getElementById('newScheduleCycle').value = '';

    renderScheduleRecords();
    refreshEventSuggestions();
    refreshCurrentView();
    showToast('周期計画を追加しました');
    autoSaveData();
}

function editScheduleRecord(index) {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.scheduledPlans[index]) return;
    
    asset.scheduledPlans[index]._editing = true;
    asset.scheduledPlans[index]._originalDate = asset.scheduledPlans[index].date;
    asset.scheduledPlans[index]._originalEvent = asset.scheduledPlans[index].event;
    asset.scheduledPlans[index]._originalCycle = asset.scheduledPlans[index].cycle;
    
    renderScheduleRecords();
}

function saveScheduleRecord(index) {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.scheduledPlans[index]) return;
    
    const newDate = document.getElementById(`edit-schedule-date-${index}`).value;
    const newEvent = document.getElementById(`edit-schedule-event-${index}`).value.trim();
    const newCycle = document.getElementById(`edit-schedule-cycle-${index}`).value.trim();
    
    if(!newDate) {
        showToast('日時を入力してください', 'warning');
        return;
    }
    
    if(!newEvent) {
        showToast('イベント内容を入力してください', 'warning');
        return;
    }
    
    asset.scheduledPlans[index].date = newDate;
    asset.scheduledPlans[index].event = newEvent;
    asset.scheduledPlans[index].cycle = newCycle ? parseInt(newCycle) : null;
    delete asset.scheduledPlans[index]._editing;
    delete asset.scheduledPlans[index]._originalDate;
    delete asset.scheduledPlans[index]._originalEvent;
    delete asset.scheduledPlans[index]._originalCycle;
    
    renderScheduleRecords();
    refreshCurrentView();
    showToast('周期計画を更新しました');
    autoSaveData();
}

function cancelEditSchedule(index) {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.scheduledPlans[index]) return;
    
    asset.scheduledPlans[index].date = asset.scheduledPlans[index]._originalDate;
    asset.scheduledPlans[index].event = asset.scheduledPlans[index]._originalEvent;
    asset.scheduledPlans[index].cycle = asset.scheduledPlans[index]._originalCycle;
    delete asset.scheduledPlans[index]._editing;
    delete asset.scheduledPlans[index]._originalDate;
    delete asset.scheduledPlans[index]._originalEvent;
    delete asset.scheduledPlans[index]._originalCycle;
    
    renderScheduleRecords();
}

function deleteScheduleRecord(index) {
    if(!confirm('この周期計画を削除しますか?')) return;
    
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.scheduledPlans) return;
    
    asset.scheduledPlans.splice(index, 1);
    renderScheduleRecords();
    refreshCurrentView();
    showToast('周期計画を削除しました');
    autoSaveData();
}

function sortSchedule(order) {
    scheduleSortOrder = order;
    renderScheduleRecords(); // ボタンの状態も renderScheduleRecords 側で同期される
}



