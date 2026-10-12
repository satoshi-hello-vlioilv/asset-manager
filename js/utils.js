
/**
 * utils.js
 * 汎用ユーティリティ関数
 */

/**
 * タグIDから全ての子孫IDを取得（再帰的）
 */
function getAllDescendantIds(tagId) {
    const result = [tagId];
    const queue = [tagId];
    
    while(queue.length > 0) {
        const currentId = queue.shift();
        const children = tags.filter(t => t.parentIds.includes(currentId));
        children.forEach(child => {
            if(!result.includes(child.id)) {
                result.push(child.id);
                queue.push(child.id);
            }
        });
    }
    
    return result;
}

/**
 * ancestorIdがdescendantIdの祖先かどうかを判定
 */
function isAncestor(ancestorId, descendantId) {
    const descendant = tags.find(t => t.id === descendantId);
    if(!descendant) return false;
    
    // 直接の親である場合
    if(descendant.parentIds.includes(ancestorId)) return true;
    
    // 再帰的に祖先をチェック
    for(let parentId of descendant.parentIds) {
        if(isAncestor(ancestorId, parentId)) return true;
    }
    
    return false;
}

/**
 * 編集中の下書き（未保存の新規資産）かどうか
 * 新規作成中の資産は一時IDで assets に置かれるため、
 * 一覧・件数・ダッシュボードなど「確定したデータ」を扱う場所からは除外する。
 */
function isDraftAsset(asset) {
    return !!asset && String(asset.id).startsWith('temp_');
}

/**
 * 保存済みの資産だけを返す（下書きを除く）
 */
function getPersistedAssets() {
    return assets.filter(a => !isDraftAsset(a));
}

/**
 * 今日の日付（YYYY-MM-DD）
 * new Date().toISOString() はUTC基準になり日本時間の朝はズレるため、ローカル日付で作る。
 */
function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 日付文字列に日数を足す
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} days
 * @returns {string} YYYY-MM-DD
 */
function addDaysISO(dateStr, days) {
    const d = new Date(dateStr);
    if(isNaN(d)) return dateStr;
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 今日から指定日までの日数（過去なら負の数）
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {number}
 */
function daysUntil(dateStr) {
    const target = new Date(dateStr);
    if(isNaN(target)) return NaN;
    target.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
}

/**
 * 日数差を「あと3日」「2日超過」のような自然な表現にする
 * 数字だけでは方向（未来／過去）を推測させてしまうため、必ず語を添える。
 * @param {number} days
 */
function formatDayDelta(days) {
    if(isNaN(days)) return '';
    if(days === 0) return '今日';
    if(days === 1) return '明日';
    if(days === -1) return '昨日';
    return days > 0 ? `あと${days}日` : `${Math.abs(days)}日超過`;
}

/**
 * 最新の履歴レコードを取得
 * @returns {{date:string, event:string}|null}
 */
function getLatestMaintenance(asset) {
    if(!asset.maintenance || asset.maintenance.length === 0) return null;
    return [...asset.maintenance].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
}

/**
 * 次に対応すべき周期計画を取得（期限超過を含め、最も早いもの）
 * @returns {{date:string, event:string, cycle?:number}|null}
 */
function getNextSchedule(asset) {
    if(!asset.scheduledPlans || asset.scheduledPlans.length === 0) return null;
    // 実施済みにすると次回日付へ進むため、過去日付のまま残っている計画は「未実施＝期限超過」。
    // 超過を除くと最も対応が必要なものが一覧から消えてしまうので、含めて最も早いものを返す。
    const pending = asset.scheduledPlans
        .filter(s => s.date && !isNaN(new Date(s.date)))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    return pending[0] || null;
}

/**
 * 期限を過ぎている周期計画をすべて取得
 * @returns {Array<{date:string, event:string, cycle?:number}>}
 */
function getOverdueSchedules(asset) {
    if(!asset.scheduledPlans || asset.scheduledPlans.length === 0) return [];
    return asset.scheduledPlans.filter(s => s.date && daysUntil(s.date) < 0);
}

/**
 * 日付を相対表記に変換
 */
function formatDateRelative(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const diffTime = today - date;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if(diffDays === 0) return '今日';
    if(diffDays === 1) return '昨日';
    if(diffDays < 7) return `${diffDays}日前`;
    if(diffDays < 30) return `${Math.floor(diffDays / 7)}週間前`;
    if(diffDays < 365) return `${Math.floor(diffDays / 30)}ヶ月前`;
    return `${Math.floor(diffDays / 365)}年前`;
}

/**
 * トースト通知を表示
 * @param {string} msg
 * @param {'success'|'warning'|'error'|'info'} [type]
 * @param {{label:string, onClick:Function}} [action] - 取り消しなどの後続操作
 */
let toastTimer = null;

function showToast(msg, type = 'success', action = null) {
    const t = document.getElementById('toast');
    if(!t) return;
    const iconElement = t.querySelector('i');
    const msgElement = document.getElementById('toastMsg');

    const styles = {
        success: { icon: 'fa-circle-check',         color: '#4ade80', duration: 3000 },
        warning: { icon: 'fa-triangle-exclamation', color: '#fbbf24', duration: 4500 },
        error:   { icon: 'fa-circle-xmark',         color: '#f87171', duration: 5000 },
        info:    { icon: 'fa-circle-info',          color: '#60a5fa', duration: 3000 }
    };
    const style = styles[type] || styles.success;

    iconElement.className = `fa-solid ${style.icon}`;
    iconElement.style.color = style.color;
    msgElement.innerText = msg;

    // 既存のアクションボタンを取り除いてから、必要なら付け直す
    t.querySelectorAll('.toast-action').forEach(btn => btn.remove());
    if(action) {
        const btn = document.createElement('button');
        btn.className = 'toast-action';
        btn.textContent = action.label;
        btn.onclick = () => {
            t.classList.remove('show');
            action.onClick();
        };
        t.appendChild(btn);
    }

    if(toastTimer) clearTimeout(toastTimer);
    t.classList.add('show');
    toastTimer = setTimeout(() => t.classList.remove('show'), action ? style.duration + 3000 : style.duration);
}

/**
 * データ変更時の自動保存（デバウンス付き）
 * IndexedDB対応版
 */
let autoSaveTimer = null;
const AUTO_SAVE_DELAY = 500; // 500ms後に自動保存

function autoSaveData() {
    // 既存のタイマーをキャンセル
    if(autoSaveTimer) {
        clearTimeout(autoSaveTimer);
    }
    
    setAutoSaveIndicator('saving');

    // 新しいタイマーをセット
    autoSaveTimer = setTimeout(async () => {
        const success = await saveDataToDB();
        setAutoSaveIndicator(success ? 'saved' : 'error');
        autoSaveTimer = null;
    }, AUTO_SAVE_DELAY);
}

/**
 * 自動保存の状態をヘッダー右側に表示する
 * 「保存したはずだが本当に保存されたか」を確かめる操作を不要にするため、
 * 状態を静かに、しかし常に見える場所に出しておく。
 * @param {'saving'|'saved'|'error'} state
 */
function setAutoSaveIndicator(state) {
    const el = document.getElementById('autoSaveIndicator');
    if(!el) return;

    if(state === 'saving') {
        el.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> 保存中';
        el.style.color = 'var(--text-faint)';
    } else if(state === 'saved') {
        const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        el.innerHTML = `<i class="fa-solid fa-check"></i> ${time} 保存済`;
        el.style.color = 'var(--success)';
    } else {
        el.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 保存に失敗';
        el.style.color = 'var(--danger)';
    }
}

/**
 * 資産IDから全ての子孫資産IDを取得（再帰的）
 */
function getAllChildAssetIds(assetId) {
    const result = [assetId];
    const queue = [assetId];
    
    while(queue.length > 0) {
        const currentId = queue.shift();
        const children = assets.filter(a => a.parentId === currentId);
        children.forEach(child => {
            if(!result.includes(child.id)) {
                result.push(child.id);
                queue.push(child.id);
            }
        });
    }
    
    return result;
}

/**
 * ancestorIdがdescendantIdの祖先資産かどうかを判定
 */
function isAncestorAsset(ancestorId, descendantId) {
    const descendant = assets.find(a => a.id === descendantId);
    if(!descendant || !descendant.parentId) return false;
    
    // 直接の親である場合
    if(descendant.parentId === ancestorId) return true;
    
    // 再帰的に祖先をチェック
    return isAncestorAsset(ancestorId, descendant.parentId);
}

/**
 * 指定資産の子資産を取得
 */
function getChildAssets(assetId) {
    return assets.filter(a => a.parentId === assetId);
}

/**
 * 指定資産の親資産を取得
 */
function getParentAsset(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if(!asset || !asset.parentId) return null;
    return assets.find(a => a.id === asset.parentId);
}

/**
 * カスタムフィールドのアラートをチェック
 */
function checkCustomFieldAlerts() {
    const alerts = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    assets.forEach(asset => {
        if(!asset.customAttributes) return;
        
        Object.keys(asset.customAttributes).forEach(tagId => {
            const tag = tags.find(t => t.id === parseInt(tagId));
            if(!tag?.customFields) return;
            
            const attrs = asset.customAttributes[tagId];
            
            tag.customFields.forEach(field => {
                if(field.type === 'date' && field.alertDays && attrs[field.key]) {
                    const targetDate = new Date(attrs[field.key]);
                    targetDate.setHours(0, 0, 0, 0);
                    const diffDays = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
                    
                    if(diffDays >= 0 && diffDays <= field.alertDays) {
                        alerts.push({
                            assetId: asset.id,
                            assetName: asset.name,
                            tagName: tag.name,
                            fieldLabel: field.label,
                            dueDate: attrs[field.key],
                            daysRemaining: diffDays,
                            severity: diffDays <= 7 ? 'high' : diffDays <= 14 ? 'medium' : 'low'
                        });
                    } else if(diffDays < 0) {
                        // 期限切れ
                        alerts.push({
                            assetId: asset.id,
                            assetName: asset.name,
                            tagName: tag.name,
                            fieldLabel: field.label,
                            dueDate: attrs[field.key],
                            daysRemaining: diffDays,
                            severity: 'overdue'
                        });
                    }
                }
            });
        });
    });
    
    return alerts;
}

/**
 * カスタムフィールド値を取得
 */
function getCustomFieldValue(asset, tagId, fieldKey, textOnly = false) {
    if(!asset.customAttributes || !asset.customAttributes[tagId]) {
        return textOnly ? '' : '-';
    }
    
    const value = asset.customAttributes[tagId][fieldKey];
    if(value === undefined || value === null || value === '') {
        return textOnly ? '' : '-';
    }
    
    const tag = tags.find(t => t.id === parseInt(tagId));
    if(!tag) return textOnly ? String(value) : value;
    
    const field = tag.customFields?.find(f => f.key === fieldKey);
    if(!field) return textOnly ? String(value) : value;
    
    if(textOnly) {
        if(field.type === 'checkbox') {
            return value ? '✓' : '';
        }
        if(field.type === 'number' && field.unit) {
            return `${value}${field.unit}`;
        }
        return String(value);
    }
    
    // HTML表示
    if(field.type === 'checkbox') {
        return value ? '<i class="fa-solid fa-check" style="color:var(--success);"></i>' : '<i class="fa-solid fa-xmark" style="color:var(--text-sub); opacity:0.3;"></i>';
    }
    
    if(field.type === 'number' && field.unit) {
        return `${value} ${field.unit}`;
    }
    
    if(field.type === 'date') {
        // 日付の表示（期限アラート付き）
        const targetDate = new Date(value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        targetDate.setHours(0, 0, 0, 0);
        
        const diffDays = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
        
        let colorStyle = '';
        let alertIcon = '';
        
        if(field.alertDays) {
            if(diffDays < 0) {
                colorStyle = 'color:var(--danger); font-weight:600;';
                alertIcon = '<i class="fa-solid fa-exclamation-triangle" style="margin-left:4px; color:var(--danger);"></i>';
            } else if(diffDays <= 7) {
                colorStyle = 'color:var(--danger);';
                alertIcon = '<i class="fa-solid fa-bell" style="margin-left:4px; color:var(--danger);"></i>';
            } else if(diffDays <= field.alertDays) {
                colorStyle = 'color:var(--warning);';
                alertIcon = '<i class="fa-solid fa-bell" style="margin-left:4px; color:var(--warning);"></i>';
            }
        }
        
        return `<span style="${colorStyle}">${value}${alertIcon}</span>`;
    }

    return value;
}

/**
 * HTMLエスケープ（表示崩れ・XSS防止用）
 */
function escapeHTML(str) {
    if(str === undefined || str === null) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * ステータス名からバッジ用CSSクラスを取得（STATUS_DEFSで一元管理）
 */
function getStatusBadgeClass(status) {
    const def = STATUS_DEFS.find(s => s.value === status);
    return def ? def.badge : 'badge-blue';
}

/**
 * 資産の状態を表す色（複数ある場合は STATUS_DEFS で後ろ＝深刻なものを優先）
 * 一覧の行頭ドットなど、文字を読まずに状態を見分けるための色。
 */
function getAssetStatusColor(asset) {
    const status = Array.isArray(asset.status) ? asset.status : [asset.status];
    const defs = STATUS_DEFS.filter(d => status.includes(d.value) && d.value !== '廃棄');
    if(defs.length > 0) return defs[defs.length - 1].nodeColor;
    if(status.includes('廃棄')) return STATUS_DEFS.find(d => d.value === '廃棄').nodeColor;
    return 'var(--n-300)';
}

/**
 * 期限までの日数を色付きのラベルにする（超過=赤 / 7日以内=琥珀 / それ以外=灰）
 * @param {number} days
 */
function renderDuePill(days) {
    if(isNaN(days)) return '';
    const tone = days < 0 ? 'danger' : days <= 7 ? 'warning' : 'neutral';
    return `<span class="due-pill" data-tone="${tone}">${escapeHTML(formatDayDelta(days))}</span>`;
}

/**
 * ステータス（配列または文字列）からバッジHTMLを生成
 * @param {string[]|string} status
 * @param {string} [extraStyle] - 各バッジに付与する追加style
 */
function renderStatusBadgesHTML(status, extraStyle = '') {
    const arr = Array.isArray(status) ? status : [status];
    const styleAttr = extraStyle ? ` style="${extraStyle}"` : '';
    return arr
        .map(s => `<span class="badge ${getStatusBadgeClass(s)}"${styleAttr}>${escapeHTML(s)}</span>`)
        .join('');
}

/**
 * 資産のサムネイルURLを取得（選択画像 > 先頭画像 > 旧image形式 の優先順）
 */
function getAssetThumbnailUrl(asset) {
    if(asset.images && asset.images.length > 0) {
        const selected = asset.images.find(img => img.selected) || asset.images[0];
        return getImageSrc(selected);
    }
    return asset.image || ''; // 旧形式のデータが残っている場合の保険
}

/**
 * 資産の代替アイコン（画像未設定時）のクラスを取得
 */
function getAssetIconClass(asset) {
    if(asset.tags.includes(12)) return 'fa-solid fa-truck';    // フォークリフト
    if(asset.tags.includes(13)) return 'fa-solid fa-gears';    // クレーン
    if(asset.tags.includes(11)) return 'fa-solid fa-industry'; // 生産設備
    return 'fa-solid fa-cube';
}

