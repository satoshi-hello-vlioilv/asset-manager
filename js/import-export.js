
/**
 * import-export.js
 * データインポート/エクスポート、画像管理
 */

function exportToJSON() {
    const data = {
        version: '2.0', // バージョンアップ
        exportDate: new Date().toISOString(),
        masters: masters,
        tags: tags,
        assets: assets,
        listDisplaySettings: listDisplaySettings // リスト表示設定を追加
    };
    
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `asset_data_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('データをエクスポートしました', 'success');
}

function importFromJSON(event) {
    const file = event.target.files[0];
    if(!file) return;
    
    processJSONFile(file);
    
    // ファイル選択をリセット（同じファイルを再度選択可能にする）
    event.target.value = '';
}

function processJSONFile(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            // バージョンチェック
            let versionWarning = '';
            if(!data.version) {
                versionWarning = '⚠️ バージョン情報がないデータです\n';
            } else if(data.version !== '2.0') {
                versionWarning = `⚠️ 異なるバージョン (${data.version}) のデータです\n`;
            }
            
            // データの検証
            if(!data.assets || !Array.isArray(data.assets)) {
                showToast('❌ 無効なデータ形式です。資産データが見つかりません。', 'error');
                return;
            }
            
            // データ互換性処理（旧形式から新形式へ）
            data.assets.forEach(asset => {
                // imagesフィールドがない場合は追加
                if(!asset.images) {
                    asset.images = [];
                    // 旧形式のimageフィールドがあればimagesに移行
                    if(asset.image) {
                        asset.images.push({
                            url: asset.image,
                            comment: '',
                            selected: true
                        });
                    }
                }
                // scheduledPlansがない場合は追加
                if(!asset.scheduledPlans) {
                    asset.scheduledPlans = [];
                }
            });
            
            // 確認ダイアログ
            const message = `${versionWarning}` +
                           `以下のデータをインポートします：\n\n` +
                           `📁 マスタ定義: ${data.masters?.length || 0}件\n` +
                           `🏷️ タグ: ${data.tags?.length || 0}件\n` +
                           `📦 資産: ${data.assets.length}件\n` +
                           `⚙️ 表示設定: ${data.listDisplaySettings ? '含む' : '含まない'}\n\n` +
                           `⚠️ 現在のデータは上書きされます。\n` +
                           `本当にインポートしますか？`;
            
            if(!confirm(message)) {
                showToast('インポートをキャンセルしました', 'info');
                return;
            }
            
            // データをインポート
            if(data.masters && Array.isArray(data.masters)) {
                masters = data.masters;
            }
            if(data.tags && Array.isArray(data.tags)) {
                tags = data.tags;
            }
            assets = data.assets;
            
            // リスト表示設定をインポート（存在する場合）
            if(data.listDisplaySettings) {
                // 互換性処理：旧形式（width: { type, value }）から新形式（width: 'auto'など）に変換
                if(data.listDisplaySettings.columns) {
                    data.listDisplaySettings.columns.forEach(col => {
                        if(col.width && typeof col.width === 'object') {
                            // 旧形式
                            if(col.width.type === 'auto') {
                                col.width = 'auto';
                            } else if(col.width.type === 'equal') {
                                col.width = 'equal';
                            } else if(col.width.type === 'flex') {
                                col.width = 'flex';
                            } else if(col.width.type === 'fixed') {
                                col.width = `${col.width.value || 150}px`;
                            } else {
                                col.width = 'auto';
                            }
                        }
                        // align, visible, order, key, labelがない場合はデフォルト値を設定
                        if(!col.align) col.align = 'left';
                        if(col.visible === undefined) col.visible = true;
                        if(col.order === undefined) col.order = 0;
                    });
                }
                listDisplaySettings = data.listDisplaySettings;
            }
            
            // UIを更新
            renderSidebar();
            renderAssets(assets);
            switchAssetView(assetViewMode); // 現在のビューモードを維持
            
            showToast(`✓ ${data.assets.length}件の資産をインポートしました`, 'success');
            autoSaveData(); // インポート後に自動保存
        } catch(error) {
            console.error('Import error:', error);
            showToast('❌ データの読み込みに失敗しました。JSONファイルを確認してください。', 'error');
        }
    };
    
    reader.onerror = () => {
        showToast('❌ ファイルの読み込みに失敗しました', 'error');
    };
    
    reader.readAsText(file);
}

function setupGlobalDropZone() {
    const body = document.body;
    let dropOverlay = null;
    
    // ドラッグオーバーレイを作成
    const createDropOverlay = () => {
        dropOverlay = document.createElement('div');
        dropOverlay.id = 'globalDropOverlay';
        dropOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(37, 99, 235, 0.1);
            backdrop-filter: blur(4px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
        `;
        
        dropOverlay.innerHTML = `
            <div style="background: white; padding: 60px 80px; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); border: 3px dashed var(--primary); text-align: center;">
                <i class="fa-solid fa-file-import" style="font-size: 4rem; color: var(--primary); margin-bottom: 20px; display: block;"></i>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--text); margin-bottom: 8px;">JSONファイルをドロップ</div>
                <div style="font-size: 1rem; color: var(--text-sub);">データをインポートします</div>
            </div>
        `;
        
        body.appendChild(dropOverlay);
        
        // アニメーション
        setTimeout(() => {
            dropOverlay.style.opacity = '1';
        }, 10);
    };
    
    const removeDropOverlay = () => {
        if(dropOverlay) {
            dropOverlay.style.opacity = '0';
            setTimeout(() => {
                if(dropOverlay && dropOverlay.parentNode) {
                    dropOverlay.parentNode.removeChild(dropOverlay);
                }
                dropOverlay = null;
            }, 200);
        }
    };
    
    let dragCounter = 0;

    // ヘルパー: モーダルが開いているかチェック
    const isModalOpen = () => {
        return document.querySelector('.modal-overlay.open') !== null;
    };
    
    body.addEventListener('dragenter', (e) => {
        // モーダルが開いている場合は何もしない（画像のドロップなどを優先）
        if(isModalOpen()) return;

        e.preventDefault();
        dragCounter++;
        
        // ファイルのドラッグかどうかをチェック
        if(e.dataTransfer.types.includes('Files')) {
            if(!dropOverlay) {
                createDropOverlay();
            }
        }
    });
    
    body.addEventListener('dragleave', (e) => {
        // モーダルが開いている場合は何もしない
        if(isModalOpen()) return;

        e.preventDefault();
        dragCounter--;
        
        if(dragCounter === 0) {
            removeDropOverlay();
        }
    });
    
    body.addEventListener('dragover', (e) => {
        // モーダルが開いている場合は何もしない
        if(isModalOpen()) return;

        e.preventDefault();
    });
    
    body.addEventListener('drop', (e) => {
        // モーダルが開いている場合は何もしない
        if(isModalOpen()) return;

        e.preventDefault();
        dragCounter = 0;
        removeDropOverlay();
        
        const files = e.dataTransfer.files;
        if(files.length === 0) return;
        
        // JSONファイルを探す
        const jsonFile = Array.from(files).find(file => 
            file.name.endsWith('.json') || file.type === 'application/json'
        );
        
        if(jsonFile) {
            // 確認ダイアログ
            if(confirm(`📄 ${jsonFile.name}\n\nこのファイルをインポートしますか？`)) {
                processJSONFile(jsonFile);
            } else {
                showToast('インポートをキャンセルしました', 'info');
            }
        } else {
            showToast('❌ JSONファイルが見つかりませんでした', 'warning');
        }
    });
}

function renderImagesGallery() {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset) return;
    
    if(!asset.images) asset.images = [];
    
    const container = document.getElementById('imagesGalleryContainer');
    
    if(asset.images.length === 0) {
        container.innerHTML = `
            <div style="padding:60px 20px; text-align:center; color:var(--text-sub);">
                <i class="fa-regular fa-images" style="font-size:3rem; margin-bottom:12px; display:block; opacity:0.3;"></i>
                <div style="font-size:0.95rem;">画像はまだ登録されていません</div>
                <div style="font-size:0.85rem; margin-top:4px; opacity:0.7;">上のフォームからURLを追加してください</div>
            </div>
        `;
        return;
    }
    
    let html = '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:16px;">';
    
    asset.images.forEach((img, index) => {
        const isSelected = img.selected || false;
        const borderStyle = isSelected ? 'border:3px solid var(--primary); box-shadow:0 0 0 3px rgba(37, 99, 235, 0.2);' : 'border:1px solid var(--border);';
        
        html += `
            <div style="position:relative; ${borderStyle} border-radius:var(--radius-md); overflow:hidden; transition:all 0.2s; cursor:pointer;" 
                 onclick="selectImageAsThumbnail(${index})"
                 title="${isSelected ? '選択中（サムネイル）' : 'クリックしてサムネイルに設定'}">
                ${isSelected ? '<div style="position:absolute; top:8px; right:8px; background:var(--primary); color:white; padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:600; z-index:2;"><i class="fa-solid fa-check"></i> 選択中</div>' : ''}
                <div style="aspect-ratio:16/9; background:#f1f5f9; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                    <img src="${img.url}" alt="Asset Image" style="width:100%; height:100%; object-fit:cover;" 
                         onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fa-solid fa-image-slash\\' style=\\'font-size:2rem; color:#cbd5e1;\\'></i>';">
                </div>
                ${img.comment ? `<div style="padding:8px; font-size:0.85rem; color:var(--text-sub); background:#fafafa;">${img.comment}</div>` : ''}
                <div style="padding:8px; display:flex; gap:4px; justify-content:flex-end; background:#fff;">
                    <button class="btn btn-ghost btn-sm btn-icon-only" onclick="event.stopPropagation(); editImageComment(${index})" title="コメント編集">
                        <i class="fa-solid fa-edit"></i>
                    </button>
                    <button class="btn btn-danger-ghost btn-sm btn-icon-only" onclick="event.stopPropagation(); deleteImage(${index})" title="削除">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function setupImageDropZone() {
    const dropZone = document.getElementById('imageDropZone');
    const fileInput = document.getElementById('imageFileInput');
    
    if(!dropZone) return;
    
    // クリックでファイル選択
    dropZone.onclick = () => fileInput.click();
    
    // ドラッグオーバー
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = 'var(--primary)';
        dropZone.style.background = '#eff6ff';
    });
    
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = 'var(--border)';
        dropZone.style.background = '#fff';
    });
    
    // ドロップ
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = 'var(--border)';
        dropZone.style.background = '#fff';
        
        const files = e.dataTransfer.files;
        handleImageFiles(files);
    });
}

function handleImageFiles(files) {
    if(!files || files.length === 0) return;
    
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset) return;
    
    if(!asset.images) asset.images = [];
    
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    
    if(imageFiles.length === 0) {
        showToast('画像ファイルが見つかりませんでした', 'warning');
        return;
    }
    
    let processedCount = 0;
    const totalCount = imageFiles.length;
    
    imageFiles.forEach((file, index) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const base64 = e.target.result;
            
            // 初回画像は自動的に選択状態にする
            const selected = asset.images.length === 0 && index === 0;
            
            asset.images.push({
                url: base64,
                comment: file.name || '',
                selected: selected
            });
            
            processedCount++;
            
            if(processedCount === totalCount) {
                renderImagesGallery();
                showToast(`${totalCount}個の画像を追加しました`, 'success');
                // 親画面（リスト/カード）も更新してサムネイルを反映
                renderAssets(window.currentAssetList || assets);
                // 追加: ダッシュボード表示中なら更新
                if (typeof currentPage !== 'undefined' && currentPage === 'dashboard') {
                    renderDashboard();
                }
                autoSaveData(); // 自動保存
            }
        };
        
        reader.onerror = () => {
            processedCount++;
            showToast(`${file.name}の読み込みに失敗しました`, 'error');
        };
        
        reader.readAsDataURL(file);
    });
}

function addImageFromUrl() {
    const url = document.getElementById('newImageUrl').value.trim();
    const comment = document.getElementById('newImageComment').value.trim();
    
    if(!url) {
        showToast('画像URLを入力してください', 'warning');
        return;
    }
    
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset) return;
    
    if(!asset.images) asset.images = [];
    
    // 初回画像は自動的に選択状態にする
    const selected = asset.images.length === 0;
    
    asset.images.push({
        url: url,
        comment: comment,
        selected: selected
    });
    
    document.getElementById('newImageUrl').value = '';
    document.getElementById('newImageComment').value = '';
    
    renderImagesGallery();
    // 親画面（リスト/カード）も更新してサムネイルを反映
    renderAssets(window.currentAssetList || assets);
    // 追加: ダッシュボード表示中なら更新
    if (typeof currentPage !== 'undefined' && currentPage === 'dashboard') {
        renderDashboard();
    }
    showToast('画像を追加しました', 'success');
    autoSaveData(); // 自動保存
}

function selectImageAsThumbnail(index) {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.images) return;
    
    // 全ての画像の選択を解除
    asset.images.forEach(img => img.selected = false);
    
    // 指定された画像を選択
    asset.images[index].selected = true;
    
    renderImagesGallery();
    // 親画面（リスト/カード）も更新してサムネイルを反映
    renderAssets(window.currentAssetList || assets);
    // 追加: ダッシュボード表示中なら更新
    if (typeof currentPage !== 'undefined' && currentPage === 'dashboard') {
        renderDashboard();
    }
    showToast('サムネイル画像を設定しました', 'success');
    autoSaveData(); // 自動保存
}

function editImageComment(index) {
    // (変更なしですが、contextのために記載)
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.images || !asset.images[index]) return;
    
    const currentComment = asset.images[index].comment || '';
    const newComment = prompt('画像のコメントを入力:', currentComment);
    
    if(newComment !== null) {
        asset.images[index].comment = newComment.trim();
        renderImagesGallery();
        showToast('コメントを更新しました', 'success');
        autoSaveData(); // 自動保存
    }
}

function deleteImage(index) {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.images) return;
    
    if(!confirm('この画像を削除しますか？')) return;
    
    const wasSelected = asset.images[index].selected;
    asset.images.splice(index, 1);
    
    // 削除した画像が選択されていた場合、最初の画像を選択
    if(wasSelected && asset.images.length > 0) {
        asset.images[0].selected = true;
    }
    
    renderImagesGallery();
    // 親画面（リスト/カード）も更新してサムネイルを反映
    renderAssets(window.currentAssetList || assets);
    // 追加: ダッシュボード表示中なら更新
    if (typeof currentPage !== 'undefined' && currentPage === 'dashboard') {
        renderDashboard();
    }
    showToast('画像を削除しました', 'success');
    autoSaveData(); // 自動保存
}

