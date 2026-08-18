
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
        assets: getPersistedAssets(), // 編集中の下書きは書き出さない
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
            
            // UIを更新（列定義とタグ階層が入れ替わるため、絞り込みは解除する）
            addCustomFieldColumns();
            activeFilter = null;
            searchQuery = '';
            renderSidebar();
            refreshCurrentView();

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
            background: rgba(39, 83, 136, 0.1);
            backdrop-filter: blur(4px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
        `;
        
        // ドロップできるものを明示する（何が起きるか推測させない）
        dropOverlay.innerHTML = `
            <div style="background:var(--surface); padding:48px 64px; border-radius:var(--radius-xl); box-shadow:var(--shadow-xl); border:3px dashed var(--primary); text-align:center;">
                <i class="fa-solid fa-hand-pointer" style="font-size:3rem; color:var(--primary); margin-bottom:16px; display:block;"></i>
                <div style="font-size:1.3rem; font-weight:700; color:var(--text-strong); margin-bottom:12px;">ここにドロップ</div>
                <div style="font-size:0.9rem; color:var(--text-sub); line-height:1.8;">
                    <div><i class="fa-solid fa-file-code" style="width:20px;"></i> JSONファイル → データを読み込む</div>
                    <div><i class="fa-solid fa-image" style="width:20px;"></i> 画像ファイル → その画像で新規資産を作成</div>
                </div>
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
        
        const files = Array.from(e.dataTransfer.files);
        if(files.length === 0) return;

        // JSONファイル（データの読み込み）
        const jsonFile = files.find(file => file.name.endsWith('.json') || file.type === 'application/json');
        if(jsonFile) {
            if(confirm(`📄 ${jsonFile.name}\n\nこのファイルをインポートしますか？`)) {
                processJSONFile(jsonFile);
            } else {
                showToast('インポートをキャンセルしました', 'info');
            }
            return;
        }

        // 画像ファイル（貼り付けと同じく、新規資産の下書きを作る）
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        if(imageFiles.length > 0) {
            receivePastedImages(imageFiles);
            return;
        }

        showToast('JSONまたは画像ファイルをドロップしてください', 'warning');
    });
}
