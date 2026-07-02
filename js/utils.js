
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
 */
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    const iconElement = t.querySelector('i');
    const msgElement = document.getElementById('toastMsg');
    
    // タイプに応じてアイコンと色を変更
    let icon = 'fa-circle-check';
    let color = '#4ade80';
    let duration = 3000;
    
    switch(type) {
        case 'success':
            icon = 'fa-circle-check';
            color = '#4ade80';
            duration = 3000;
            break;
        case 'warning':
            icon = 'fa-exclamation-triangle';
            color = '#f59e0b';
            duration = 4500;
            break;
        case 'error':
            icon = 'fa-circle-xmark';
            color = '#ef4444';
            duration = 5000;
            break;
        case 'info':
            icon = 'fa-info-circle';
            color = '#3b82f6';
            duration = 3000;
            break;
    }
    
    iconElement.className = `fa-solid ${icon}`;
    iconElement.style.color = color;
    msgElement.innerText = msg;
    
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration);
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
    
    // 新しいタイマーをセット
    autoSaveTimer = setTimeout(async () => {
        const success = await saveDataToDB();
        if(success) {
            console.log('データを自動保存しました (IndexedDB)');
        }
        autoSaveTimer = null;
    }, AUTO_SAVE_DELAY);
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
        const selected = asset.images.find(img => img.selected);
        return (selected || asset.images[0]).url;
    }
    return asset.image || '';
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

