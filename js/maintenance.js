
/**
 * maintenance.js
 * 履歴・周期計画管理
 */

function renderHistoryRecords() {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.maintenance) return;
    
    const container = document.getElementById('historyRecordsContainer');
    
    // ソートボタンの状態を更新
    const sortDescBtn = document.getElementById('sortDescBtn');
    const sortAscBtn = document.getElementById('sortAscBtn');
    if(historySortOrder === 'desc') {
        sortDescBtn.className = 'btn btn-outline btn-sm';
        sortDescBtn.style.background = '#fff';
        sortDescBtn.style.boxShadow = 'var(--shadow-sm)';
        sortAscBtn.className = 'btn btn-ghost btn-sm';
        sortAscBtn.style.background = 'transparent';
        sortAscBtn.style.boxShadow = 'none';
    } else {
        sortAscBtn.className = 'btn btn-outline btn-sm';
        sortAscBtn.style.background = '#fff';
        sortAscBtn.style.boxShadow = 'var(--shadow-sm)';
        sortDescBtn.className = 'btn btn-ghost btn-sm';
        sortDescBtn.style.background = 'transparent';
        sortDescBtn.style.boxShadow = 'none';
    }
    
    if(asset.maintenance.length === 0) {
        container.innerHTML = `
            <div style="padding:60px 20px; text-align:center; color:var(--text-sub);">
                <i class="fa-regular fa-calendar-xmark" style="font-size:3rem; margin-bottom:12px; display:block; opacity:0.3;"></i>
                <div style="font-size:0.95rem;">履歴はまだ登録されていません</div>
                <div style="font-size:0.85rem; margin-top:4px; opacity:0.7;">上のフォームから追加してください</div>
            </div>
        `;
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
    
    // リスト表示
    let html = '<div style="padding:0;">';
    sortedRecords.forEach((record, originalIndex) => {
        // 元のインデックスを取得
        const index = asset.maintenance.indexOf(record);
        const isEditing = record._editing;
        
        html += `
            <div style="padding:16px 20px; border-bottom:1px solid #f1f5f9; display:flex; gap:16px; align-items:start;" id="history-item-${index}">
                <div style="flex:0 0 160px;">
                    ${isEditing ? `
                        <input type="date" id="edit-date-${index}" value="${record.date}" class="input" style="width:100%; font-size:0.9rem;">
                    ` : `
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <div style="font-size:0.95rem; font-weight:600; color:var(--text-main);">${record.date}</div>
                            <div style="font-size:0.75rem; color:var(--text-sub);">${formatDateRelative(record.date)}</div>
                        </div>
                    `}
                </div>
                <div style="flex:1;">
                    ${isEditing ? `
                        <textarea id="edit-event-${index}" class="input" rows="3" style="font-size:0.9rem;">${record.event}</textarea>
                    ` : `
                        <div style="font-size:0.9rem; color:var(--text-main); line-height:1.6; white-space:pre-wrap;">${record.event}</div>
                    `}
                </div>
                <div style="flex:0 0 auto; display:flex; gap:4px;">
                    ${isEditing ? `
                        <button class="btn btn-primary btn-sm" onclick="saveHistoryRecord(${index})" title="保存">
                            <i class="fa-solid fa-check"></i>
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="cancelEditHistory(${index})" title="キャンセル">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    ` : `
                        <button class="btn btn-ghost btn-icon-only" onclick="editHistoryRecord(${index})" title="編集">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-ghost btn-icon-only" style="color:var(--danger);" onclick="deleteHistoryRecord(${index})" title="削除">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    `}
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
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
    
    asset.maintenance.push({
        date: date,
        event: event
    });
    
    // フォームをリセット
    document.getElementById('newHistoryDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('newHistoryEvent').value = '';
    
    renderHistoryRecords();
    showToast('履歴を追加しました');
    autoSaveData(); // 自動保存
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
    showToast('履歴を削除しました');
    autoSaveData(); // 自動保存
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
    
    // ソートボタンの状態を更新
    const sortDescBtn = document.getElementById('sortScheduleDescBtn');
    const sortAscBtn = document.getElementById('sortScheduleAscBtn');
    if(scheduleSortOrder === 'desc') {
        sortDescBtn.className = 'btn btn-outline btn-sm';
        sortDescBtn.style.background = '#fff';
        sortDescBtn.style.boxShadow = 'var(--shadow-sm)';
        sortAscBtn.className = 'btn btn-ghost btn-sm';
        sortAscBtn.style.background = 'transparent';
        sortAscBtn.style.boxShadow = 'none';
    } else {
        sortAscBtn.className = 'btn btn-outline btn-sm';
        sortAscBtn.style.background = '#fff';
        sortAscBtn.style.boxShadow = 'var(--shadow-sm)';
        sortDescBtn.className = 'btn btn-ghost btn-sm';
        sortDescBtn.style.background = 'transparent';
        sortDescBtn.style.boxShadow = 'none';
    }
    
    if(asset.scheduledPlans.length === 0) {
        container.innerHTML = `
            <div style="padding:60px 20px; text-align:center; color:var(--text-sub);">
                <i class="fa-regular fa-calendar-check" style="font-size:3rem; margin-bottom:12px; display:block; opacity:0.3;"></i>
                <div style="font-size:0.95rem;">周期計画はまだ登録されていません</div>
                <div style="font-size:0.85rem; margin-top:4px; opacity:0.7;">上のフォームから追加してください</div>
            </div>
        `;
        return;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // ソート
    const sortedRecords = [...asset.scheduledPlans].sort((a, b) => {
        if(scheduleSortOrder === 'desc') {
            return new Date(b.date) - new Date(a.date);
        } else {
            return new Date(a.date) - new Date(b.date);
        }
    });
    
    // リスト表示
    let html = '<div style="padding:0;">';
    sortedRecords.forEach((record, originalIndex) => {
        const index = asset.scheduledPlans.indexOf(record);
        const isEditing = record._editing;
        const planDate = new Date(record.date);
        planDate.setHours(0, 0, 0, 0);
        
        let statusInfo = '';
        let isOverdue = false;
        
        if(record.cycle && planDate <= today) {
            const daysPassed = Math.floor((today - planDate) / (1000 * 60 * 60 * 24));
            if(daysPassed > record.cycle) {
                const overdueDays = daysPassed - record.cycle;
                statusInfo = `<span style="color: var(--danger); font-weight: 600; font-size:0.85rem;"><i class="fa-solid fa-exclamation-triangle"></i> 周期遅れ: ${overdueDays}日</span>`;
                isOverdue = true;
            } else {
                const remainingDays = record.cycle - daysPassed;
                statusInfo = `<span style="color: var(--success); font-size:0.85rem;"><i class="fa-solid fa-check-circle"></i> 残り: ${remainingDays}日</span>`;
            }
        } else if(planDate > today) {
            const daysUntil = Math.floor((planDate - today) / (1000 * 60 * 60 * 24));
            statusInfo = `<span style="color: var(--primary); font-size:0.85rem;"><i class="fa-solid fa-clock"></i> 予定まで: ${daysUntil}日</span>`;
        }
        
        const borderStyle = isOverdue ? 'border-left:4px solid var(--danger);' : '';
        
        html += `
            <div style="padding:16px 20px; ${borderStyle} border-bottom:1px solid #f1f5f9; display:flex; gap:16px; align-items:start;" id="schedule-item-${index}">
                ${isEditing ? `
                    <div style="flex:1;">
                        <div style="display:grid; grid-template-columns: 180px 150px 1fr; gap:12px;">
                            <div>
                                <label style="font-size:0.8rem; font-weight:600; color:var(--text-sub); display:block; margin-bottom:4px;">日時</label>
                                <input type="date" id="edit-schedule-date-${index}" value="${record.date}" class="input" style="font-size:0.9rem;">
                            </div>
                            <div>
                                <label style="font-size:0.8rem; font-weight:600; color:var(--text-sub); display:block; margin-bottom:4px;">周期 (日)</label>
                                <input type="number" id="edit-schedule-cycle-${index}" value="${record.cycle || ''}" placeholder="例: 30" min="1" class="input" style="font-size:0.9rem;">
                            </div>
                            <div>
                                <label style="font-size:0.8rem; font-weight:600; color:var(--text-sub); display:block; margin-bottom:4px;">イベント内容</label>
                                <input type="text" id="edit-schedule-event-${index}" value="${record.event}" class="input" style="font-size:0.9rem;">
                            </div>
                        </div>
                    </div>
                    <div style="flex:0 0 auto; display:flex; gap:4px;">
                        <button class="btn btn-primary btn-sm" onclick="saveScheduleRecord(${index})" title="保存">
                            <i class="fa-solid fa-check"></i>
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="cancelEditSchedule(${index})" title="キャンセル">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                ` : `
                    <div style="flex:0 0 160px;">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <div style="font-size:0.95rem; font-weight:600; color:var(--text-main);">${record.date}</div>
                            <div style="font-size:0.75rem; color:var(--text-sub);">${formatDateRelative(record.date)}</div>
                        </div>
                    </div>
                    <div style="flex:1;">
                        <div style="font-size:0.9rem; color:var(--text-main); margin-bottom:4px;">${record.event}</div>
                        ${record.cycle ? `
                            <div style="font-size:0.8rem; color:var(--text-sub); margin-top:6px;">
                                <i class="fa-solid fa-redo" style="margin-right:4px;"></i> 周期: ${record.cycle}日 / ${statusInfo}
                            </div>
                        ` : ''}
                    </div>
                    <div style="flex:0 0 auto; display:flex; gap:4px;">
                        <button class="btn btn-ghost btn-icon-only" onclick="editScheduleRecord(${index})" title="編集">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-ghost btn-icon-only" style="color:var(--danger);" onclick="deleteScheduleRecord(${index})" title="削除">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                `}
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
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
        date: date,
        event: event,
        cycle: cycle ? parseInt(cycle) : null
    });
    
    document.getElementById('newScheduleDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('newScheduleEvent').value = '';
    document.getElementById('newScheduleCycle').value = '';
    
    renderScheduleRecords();
    showToast('周期計画を追加しました');
    
    // カレンダービューの場合は更新
    if(assetViewMode === 'calendar') {
        renderAssets(window.currentAssetList || assets);
    }
    autoSaveData(); // 自動保存
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
    showToast('周期計画を更新しました');
    
    // カレンダービューの場合は更新
    if(assetViewMode === 'calendar') {
        renderAssets(window.currentAssetList || assets);
    }
    autoSaveData(); // 自動保存
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
    showToast('周期計画を削除しました');
    
    // カレンダービューの場合は更新
    if(assetViewMode === 'calendar') {
        renderAssets(window.currentAssetList || assets);
    }
    autoSaveData(); // 自動保存
}

function sortSchedule(order) {
    scheduleSortOrder = order;
    
    const btnDesc = document.getElementById('sortScheduleDescBtn');
    const btnAsc = document.getElementById('sortScheduleAscBtn');
    
    if(order === 'desc') {
        btnDesc.className = 'btn btn-outline btn-sm';
        btnAsc.className = 'btn btn-ghost btn-sm';
    } else {
        btnAsc.className = 'btn btn-outline btn-sm';
        btnDesc.className = 'btn btn-ghost btn-sm';
    }
    
    renderScheduleRecords();
}



