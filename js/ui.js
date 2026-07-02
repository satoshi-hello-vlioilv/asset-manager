
/**
 * ui.js
 * 基本UI操作
 */

/**
 * モーダルを閉じる
 */
function closeModal(id) {
    document.getElementById(id).classList.remove('open');
    if(id === 'assetModal') {
        // 新規作成中にモーダルを閉じた場合は一時資産を削除
        if(isNewAsset && editingAssetId) {
            assets = assets.filter(a => a.id !== editingAssetId);
            if(window.currentAssetList) {
                window.currentAssetList = window.currentAssetList.filter(a => a.id !== editingAssetId);
            }
        }
        isNewAsset = false;    // 新規作成フラグをリセット
        editingAssetId = null; // 編集中IDをリセット
    }
}

/**
 * サイドバーの開閉（モバイル表示用）
 * @param {boolean} [force] - true:開く / false:閉じる / 省略:トグル
 */
function toggleSidebar(force) {
    if(force === undefined) {
        document.body.classList.toggle('sidebar-open');
    } else {
        document.body.classList.toggle('sidebar-open', force);
    }
}

/**
 * アコーディオンの開閉
 */
function toggleAccordion(el) { 
    const item = el.parentElement;
    const body = item.querySelector('.accordion-body');
    const chevron = el.querySelector('.chevron');
    
    // openクラスのトグル
    item.classList.toggle('open');
    
    // accordion-bodyの表示切り替え
    if(body) {
        if(item.classList.contains('open')) {
            body.style.display = 'block';
        } else {
            body.style.display = 'none';
        }
    }
    
    // chevronの回転
    if(chevron) {
        if(item.classList.contains('open')) {
            chevron.style.transform = 'rotate(180deg)';
        } else {
            chevron.style.transform = 'rotate(0deg)';
        }
    }
}

/**
 * グラフビューの操作ガイドを折りたたみ／展開
 */
function toggleGraphLegend(type) {
    const contentId = type === 'tags' ? 'tagsLegendContent' : 'assetsLegendContent';
    const chevronId = type === 'tags' ? 'tagsLegendChevron' : 'assetsLegendChevron';
    
    const content = document.getElementById(contentId);
    const chevron = document.getElementById(chevronId);
    
    if(!content || !chevron) return;
    
    if(content.style.display === 'none') {
        content.style.display = 'block';
        chevron.style.transform = 'rotate(90deg)';
    } else {
        content.style.display = 'none';
        chevron.style.transform = 'rotate(0deg)';
    }
}


