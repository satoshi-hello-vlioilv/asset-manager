
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
    const logo = document.getElementById('appLogo');
    if(logo) logo.title = `AssetManager v${APP_VERSION}`;

    // DBからデータを読み込み (非同期待機)
    await loadDataFromDB();

    // 保存されている表示密度を反映（描画前に当てて、ちらつきを避ける）
    applyDensity();

    // カスタムフィールド列を動的に追加
    addCustomFieldColumns();

    // UIの描画
    renderSidebar();
    showDashboard(); // デフォルトでダッシュボードを表示

    setupGlobalEvents();
    setupGlobalDropZone();     // JSON / 画像のグローバルドラッグ&ドロップ
    setupImagePasteHandler();  // Ctrl+V での画像貼り付け
    setupPaletteEvents();      // コマンドパレット
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

/* ============================================================
   グローバルイベント
   ============================================================ */

/** 入力中かどうか（ショートカットを誤爆させないための判定） */
function isTypingContext(target) {
    if(!target) return false;
    return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

/** 最前面に開いているモーダルのID（なければ null） */
function getTopModalId() {
    const openModals = document.querySelectorAll('.modal-overlay.open');
    return openModals.length > 0 ? openModals[openModals.length - 1].id : null;
}

/* 連続キー（G → D など）の待ち受け状態 */
let pendingChord = null;
let pendingChordTimer = null;

function setupGlobalEvents() {
    /* --- グラフビューでの Delete キー --- */
    document.addEventListener('keydown', (e) => {
        if((e.key === 'Delete' || e.key === 'Backspace') && selectedElement && currentView === 'graph'
           && document.getElementById('masterModal').classList.contains('open')) {
            if(isTypingContext(e.target)) return;

            if(currentMasterMode === 'assets') {
                if(selectedElement.type === 'asset-link') {
                    unlinkAssetParent(selectedElement.id);
                    selectedElement = null;
                } else if(selectedElement.type === 'asset-node') {
                    deleteAssetNodeFromGraph(selectedElement.id);
                }
            } else {
                if(selectedElement.type === 'node') {
                    deleteTag(selectedElement.id);
                } else if(selectedElement.type === 'link') {
                    removeLink(selectedElement.childId, selectedElement.parentId);
                }
                selectedElement = null;
            }
        }
    });

    /* --- アプリ全体のキーボードショートカット --- */
    document.addEventListener('keydown', (e) => {
        if(e.isComposing) return; // 日本語入力の変換中は無視

        const typing = isTypingContext(e.target);
        const modKey = e.ctrlKey || e.metaKey;

        /* Esc: 開いているものを内側から順に閉じる */
        if(e.key === 'Escape') {
            if(isLightboxOpen()) { closeLightbox(); return; }
            if(isPaletteOpen())  { closePalette();  return; }
            if(document.querySelector('.menu.open')) { closeMenus(); return; }
            if(isFilterPopoverOpen()) { closeFilterPopover(); return; }

            const topModal = getTopModalId();
            if(topModal) { closeModal(topModal); return; }
            return;
        }

        /* ライトボックス表示中は左右キーで送る */
        if(isLightboxOpen()) {
            if(e.key === 'ArrowLeft')  { e.preventDefault(); stepLightbox(-1); return; }
            if(e.key === 'ArrowRight') { e.preventDefault(); stepLightbox(1);  return; }
        }

        /* 資産詳細を開いている間は Alt+←/→ で一覧の前後へ移動できる
           （閉じて別の行を探して開き直す往復をなくす） */
        if(e.altKey && document.getElementById('assetModal').classList.contains('open')) {
            if(e.key === 'ArrowLeft')  { e.preventDefault(); stepAsset(-1); return; }
            if(e.key === 'ArrowRight') { e.preventDefault(); stepAsset(1);  return; }
        }

        /* Ctrl/⌘ + K: コマンドパレット（どこからでも） */
        if(modKey && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            isPaletteOpen() ? closePalette() : openPalette();
            return;
        }

        /* Ctrl/⌘ + S: 編集中の資産を保存 */
        if(modKey && e.key.toLowerCase() === 's') {
            if(document.getElementById('assetModal').classList.contains('open')) {
                e.preventDefault();
                saveAssetChanges();
            }
            return;
        }

        // ここから先は、入力中・モーダル表示中には反応させない
        if(typing || isPaletteOpen() || getTopModalId()) return;

        /* 連続キー（G のあとに D / A） */
        if(pendingChord === 'g') {
            clearTimeout(pendingChordTimer);
            pendingChord = null;
            if(e.key.toLowerCase() === 'd') { e.preventDefault(); showDashboard(); return; }
            if(e.key.toLowerCase() === 'a') { e.preventDefault(); showAssets();    return; }
        }

        /* 一覧を ↑↓ で辿り、Enter で開く（マウスに持ち替えずに確認していける） */
        if(currentPage === 'assets' && assetViewMode === 'list') {
            if(e.key === 'ArrowDown') { e.preventDefault(); moveListCursor(1);  return; }
            if(e.key === 'ArrowUp')   { e.preventDefault(); moveListCursor(-1); return; }
            if(e.key === 'Enter' && listCursorId) { e.preventDefault(); openListCursor(); return; }
        }

        switch(e.key) {
            case '/':
                e.preventDefault();
                if(currentPage !== 'assets') showAssets();
                const searchInput = document.getElementById('searchInput');
                if(searchInput) { searchInput.focus(); searchInput.select(); }
                return;
            case 'n': case 'N':
                e.preventDefault();
                createNewAsset();
                return;
            case '?':
                e.preventDefault();
                openKeyHelp();
                return;
            case 'g': case 'G':
                pendingChord = 'g';
                clearTimeout(pendingChordTimer);
                pendingChordTimer = setTimeout(() => { pendingChord = null; }, 1200);
                return;
            case '1': case '2': case '3':
                if(currentPage === 'assets') {
                    e.preventDefault();
                    switchAssetView({ '1': 'list', '2': 'card', '3': 'calendar' }[e.key]);
                }
                return;
        }
    });

    /* --- メニュー・絞り込みポップオーバーは外側クリックで閉じる --- */
    document.addEventListener('click', (e) => {
        if(!e.target.closest('.menu-wrap')) closeMenus();
        if(isFilterPopoverOpen() && !e.target.closest('#filterPopover, .filter-btn')) closeFilterPopover();
    });
    // 位置がずれたポップオーバーは残さない
    window.addEventListener('resize', closeFilterPopover);
    document.querySelector('.content-scroll').addEventListener('scroll', closeFilterPopover, { passive: true });

    /* --- グラフのホイールズーム --- */
    const graphView = document.getElementById('graphView');
    if(graphView) {
        graphView.addEventListener('wheel', (e) => {
            if(currentView === 'graph' && currentMasterMode === 'tags') {
                e.preventDefault();
                updateZoom(e.deltaY > 0 ? -0.1 : 0.1);
            }
        }, { passive: false });
    }

    const assetsGraphView = document.getElementById('assetsGraphView');
    if(assetsGraphView) {
        assetsGraphView.addEventListener('wheel', (e) => {
            if(currentView === 'graph' && currentMasterMode === 'assets') {
                e.preventDefault();
                updateAssetsZoom(e.deltaY > 0 ? -0.1 : 0.1);
            }
        }, { passive: false });
    }
}
