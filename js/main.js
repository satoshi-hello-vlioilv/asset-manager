
/**
 * main.js
 * 初期化処理とグローバルイベント
 */

// リスト表示で利用可能なすべての列
const availableColumns = [
    // 基本情報
    { key: 'name', label: '資産名称', category: '基本情報' },
    { key: 'id', label: '資産ID', category: '基本情報' },
    { key: 'date', label: '導入日', category: '基本情報' },
    { key: 'tags', label: 'タグ（すべて）', category: '基本情報' },
    { key: 'status', label: 'ステータス', category: '基本情報' },
    { key: 'specs', label: '備考・特記事項', category: '基本情報' },
    { key: 'parentAsset', label: '親資産', category: '基本情報' },
    
    // タグ（マスタ別）は addCustomFieldColumns() で動的に生成
    
    // 運用基準・手順
    { key: 'operations.procedure', label: '標準操作手順', category: '運用基準・手順' },
    { key: 'operations.checkpoints', label: '点検項目', category: '運用基準・手順' },
    
    // リスク管理・安全
    { key: 'risk.assessment', label: 'リスク評価', category: 'リスク管理・安全' },
    { key: 'risk.measures', label: '安全対策', category: 'リスク管理・安全' },
    
    // 履歴
    { key: 'maintenance.count', label: '履歴件数', category: '履歴' },
    { key: 'maintenance.latest', label: '最新履歴日', category: '履歴' },
    { key: 'maintenance.latestEvent', label: '最新履歴内容', category: '履歴' },
    
    // 周期計画
    { key: 'scheduledPlans.count', label: '計画件数', category: '周期計画' },
    { key: 'scheduledPlans.next', label: '次回予定日', category: '周期計画' },
    { key: 'scheduledPlans.nextEvent', label: '次回予定内容', category: '周期計画' },
    
    // 画像
    { key: 'images.count', label: '画像枚数', category: '画像' }
];

/**
 * アプリケーション初期化 (非同期)
 */
document.addEventListener('DOMContentLoaded', async () => {
    // バージョン表示（config.js の APP_VERSION を単一の情報源として反映）
    const versionBadge = document.getElementById('appVersionBadge');
    if(versionBadge) versionBadge.textContent = `v${APP_VERSION}`;

    // DBからデータを読み込み (非同期待機)
    await loadDataFromDB();

    // カスタムフィールド列を動的に追加
    addCustomFieldColumns();

    // UIの描画
    renderSidebar();
    showDashboard(); // デフォルトでダッシュボードを表示
    setupGlobalEvents();
    setupGlobalDropZone(); // JSONファイルのグローバルドラッグアンドドロップを設定
});

/**
 * カスタムフィールド列を動的に追加
 */
function addCustomFieldColumns() {
    // 既存の動的列（カスタム属性 + マスタ別タグ）を削除（再読み込み時の重複を防ぐ）
    for(let i = availableColumns.length - 1; i >= 0; i--) {
        if(availableColumns[i].category === 'カスタム属性' || availableColumns[i].category === 'タグ（マスタ別）') {
            availableColumns.splice(i, 1);
        }
    }
    
    // マスタごとにタグ列を動的に生成
    masters.forEach(m => {
        availableColumns.push({
            key: `tags-${m.id}`,
            label: m.name,
            category: 'タグ（マスタ別）',
            masterId: m.id
        });
    });
    
    // 全タグからカスタムフィールドを収集
    tags.forEach(tag => {
        if(!tag.customFields || tag.customFields.length === 0) return;
        
        tag.customFields.forEach(field => {
            availableColumns.push({
                key: `custom.${tag.id}.${field.key}`,
                label: `${tag.name}: ${field.label}`,
                category: 'カスタム属性',
                tagId: tag.id,
                fieldKey: field.key,
                fieldType: field.type
            });
        });
    });
}

/**
 * グローバルイベントのセットアップ（キーボード、マウスホイール）
 */
function setupGlobalEvents() {
    // Keyboard Delete
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElement && currentView === 'graph' && document.getElementById('masterModal').classList.contains('open')) {
            // Ignore if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if(currentMasterMode === 'assets') {
                // 資産モード
                if (selectedElement.type === 'asset-link') {
                    // 親子関係を解除
                    unlinkAssetParent(selectedElement.id);
                    selectedElement = null;
                } else if (selectedElement.type === 'asset-node') {
                    // 資産ノードを削除
                    deleteAssetNodeFromGraph(selectedElement.id);
                }
            } else {
                // タグモード
                if (selectedElement.type === 'node') {
                    deleteTag(selectedElement.id);
                } else if (selectedElement.type === 'link') {
                    removeLink(selectedElement.childId, selectedElement.parentId);
                }
                selectedElement = null;
            }
        }
    });

    // キーボードショートカット
    // - Esc: 最前面のモーダル（またはモバイルサイドバー）を閉じる
    // - Ctrl(⌘)+K: 検索ボックスへフォーカス
    document.addEventListener('keydown', (e) => {
        if(e.isComposing) return; // 日本語入力の変換中は無視

        if(e.key === 'Escape') {
            const openModals = document.querySelectorAll('.modal-overlay.open');
            if(openModals.length > 0) {
                closeModal(openModals[openModals.length - 1].id);
                return;
            }
            if(document.body.classList.contains('sidebar-open')) {
                toggleSidebar(false);
            }
            return;
        }

        if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if(currentPage !== 'assets') showAssets();
            const searchInput = document.getElementById('searchInput');
            if(searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
    });

    // モバイル表示時：サイドバー内の項目を選択したら自動で閉じる
    const sidebarNav = document.getElementById('sidebarNav');
    if(sidebarNav) {
        sidebarNav.addEventListener('click', (e) => {
            if(window.innerWidth > 900) return;
            if(e.target.classList.contains('chevron')) return; // 折り畳み操作は除外
            if(e.target.closest('.nav-item, .accordion-header-content, .nav-label, .tree-link')) {
                toggleSidebar(false);
            }
        });
    }

    // Mouse Wheel Zoom on Graph Area (タグ用)
    const graphView = document.getElementById('graphView');
    if(graphView) {
        graphView.addEventListener('wheel', (e) => {
            if(currentView === 'graph' && currentMasterMode === 'tags') {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                updateZoom(delta);
            }
        }, { passive: false });
    }
    
    // Mouse Wheel Zoom on Graph Area (資産用)
    const assetsGraphView = document.getElementById('assetsGraphView');
    if(assetsGraphView) {
        assetsGraphView.addEventListener('wheel', (e) => {
            if(currentView === 'graph' && currentMasterMode === 'assets') {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                updateAssetsZoom(delta);
            }
        }, { passive: false });
    }
}

