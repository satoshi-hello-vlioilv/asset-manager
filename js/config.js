
/**
 * config.js
 * 初期データとグローバル設定、データ永続化機能 (IndexedDB対応版)
 */

// アプリケーションバージョン（セマンティックバージョニング）
// サイドバーのアプリ名横に表示される。更新時はここを変更するだけでよい。
const APP_VERSION = '1.1.0';

// Dexie.js データベース定義
const DB_NAME = 'AssetManagerDB';
const db = new Dexie(DB_NAME);

// DBスキーマ定義
// assets: 資産データ
// tags: タグ（ノード）データ
// masters: マスタ定義データ
// system: 設定やカウンターなどのシステムデータ

// バージョン1: 基本スキーマ
db.version(1).stores({
    assets: 'id, name, date, parentId, *tags',
    tags: 'id, masterId, parentIds',
    masters: 'id',
    system: 'key'
});

// バージョン2: カスタムフィールド対応
// tagsテーブルにcustomFields配列を追加（スキーマ定義は不要、データとして保存）
// assetsテーブルにcustomAttributes配列を追加（スキーマ定義は不要、データとして保存）
db.version(2).stores({
    assets: 'id, name, date, parentId, *tags',
    tags: 'id, masterId, parentIds',
    masters: 'id',
    system: 'key'
});

// カスタムフィールドのデータ型定義
const FIELD_TYPES = {
    text: {
        inputType: 'text',
        label: 'テキスト',
        validator: (value, field) => {
            if(!value) return true;
            if(field.pattern) return new RegExp(field.pattern).test(value);
            if(field.maxLength) return value.length <= field.maxLength;
            return true;
        }
    },
    number: {
        inputType: 'number',
        label: '数値',
        validator: (value, field) => {
            if(!value && value !== 0) return true;
            const num = parseFloat(value);
            if(isNaN(num)) return false;
            if(field.validation?.min !== undefined && num < field.validation.min) return false;
            if(field.validation?.max !== undefined && num > field.validation.max) return false;
            return true;
        }
    },
    date: {
        inputType: 'date',
        label: '日付',
        validator: (value) => !value || !isNaN(Date.parse(value))
    },
    select: {
        inputType: 'select',
        label: '選択肢',
        validator: (value, field) => !value || field.options?.includes(value)
    },
    checkbox: {
        inputType: 'checkbox',
        label: 'チェックボックス',
        validator: () => true
    },
    textarea: {
        inputType: 'textarea',
        label: '複数行テキスト',
        validator: (value, field) => {
            if(!value) return true;
            if(field.maxLength) return value.length <= field.maxLength;
            return true;
        }
    }
};

// 資産ステータス定義
// ここに1行追加するだけで、資産編集画面のチェックボックス・一覧のバッジ色・
// 資産構成グラフのノード色に自動反映されます（定義順 = グラフ色分けの優先順）
const STATUS_DEFS = [
    { value: '稼働中', badge: 'badge-green', nodeColor: '#10b981' },
    { value: '停止中', badge: 'badge-red',   nodeColor: '#ef4444' },
    { value: '修理中', badge: 'badge-red',   nodeColor: '#ef4444' },
    { value: '点検中', badge: 'badge-blue',  nodeColor: '#f59e0b' },
    { value: '廃棄',   badge: 'badge-gray',  nodeColor: '#64748b' }
];

// マスタ定義 (初期データ)
let masters = [
    { id: 'loc', name: '設置場所・組織' },
    { id: 'cat', name: '資産分類・属性' },
    { id: 'spec', name: '仕様' },
];

// タグ定義 (初期データ)
let tags = [
    // Location (7階層のテスト含む)
    { id: 1, masterId: 'loc', name: '東京本社', parentIds: [] },
    { id: 2, masterId: 'loc', name: '大阪支店', parentIds: [] },
    { id: 3, masterId: 'loc', name: '第1工場', parentIds: [1] },
    { id: 4, masterId: 'loc', name: '物流センター', parentIds: [1] },
    { id: 5, masterId: 'loc', name: 'Aライン', parentIds: [3] },
    { id: 6, masterId: 'loc', name: 'A1エリア', parentIds: [5] },
    { id: 7, masterId: 'loc', name: '組立ステーション1', parentIds: [6] },
    { id: 8, masterId: 'loc', name: 'ワークベンチ1-A', parentIds: [7] },
    { id: 9, masterId: 'loc', name: 'ツールボックス1-A-01', parentIds: [8] },
    // Category
    { id: 10, masterId: 'cat', name: '車両・運搬具', parentIds: [] },
    { id: 11, masterId: 'cat', name: '生産設備', parentIds: [] },
    { 
        id: 12, 
        masterId: 'cat', 
        name: 'フォークリフト', 
        parentIds: [10],
        customFields: [
            {
                key: 'mileage',
                label: '走行距離',
                type: 'number',
                unit: 'km',
                required: false,
                defaultValue: null,
                validation: {
                    min: 0,
                    max: 999999
                }
            },
            {
                key: 'inspectionDate',
                label: '車検満了日',
                type: 'date',
                required: true,
                alertDays: 30
            },
            {
                key: 'licensePlate',
                label: 'ナンバープレート',
                type: 'text',
                required: false,
                maxLength: 20
            }
        ]
    },
    { id: 13, masterId: 'cat', name: 'クレーン', parentIds: [11] },
    { id: 14, masterId: 'cat', name: 'バッテリー部品', parentIds: [12] },
    // Spec (仕様)
    { id: 20, masterId: 'spec', name: '最大荷重', parentIds: [] },
    { id: 21, masterId: 'spec', name: '2.5t', parentIds: [20] },
    { id: 22, masterId: 'spec', name: '5t', parentIds: [20] },
    { id: 23, masterId: 'spec', name: '動力源', parentIds: [] },
    { id: 24, masterId: 'spec', name: 'バッテリー式', parentIds: [23] },
    { id: 25, masterId: 'spec', name: 'ディーゼル式', parentIds: [23] },
    { id: 26, masterId: 'spec', name: 'メーカー', parentIds: [] },
    { id: 27, masterId: 'spec', name: 'トヨタL&F', parentIds: [26] },
    { id: 28, masterId: 'spec', name: 'コマツ', parentIds: [26] }
];

// 資産データ (初期データ)
let assets = [
    { 
        id: 'a1', 
        name: 'フォークリフト No.101', 
        tags: [3, 12, 21, 24, 27],
        status: ['稼働中'], 
        date: '2022-04-01', 
        specs: '',
        image: '',
        images: [],
        parentId: null, // 親資産なし
        operations: { procedure: '', checkpoints: '' },
        risk: { assessment: '', measures: '' },
        customAttributes: {
            12: {  // フォークリフト
                mileage: 50000,
                inspectionDate: '2025-08-15',
                licensePlate: 'あ 12-34'
            }
        },
        maintenance: [
            { date: '2024-01-15', event: 'バッテリー交換実施' },
            { date: '2023-12-10', event: '定期点検完了。異常なし' }
        ],
        scheduledPlans: [
            { date: '2025-03-15', event: '定期点検', cycle: 180 },
            { date: '2025-05-01', event: 'バッテリー点検', cycle: 90 }
        ]
    },
    { 
        id: 'a2', 
        name: '天井クレーン C-05', 
        tags: [2, 13, 22],
        status: ['点検中'], 
        date: '2020-11-15', 
        specs: '定期メンテナンスのため一時停止中',
        image: '',
        images: [],
        parentId: null, // 親資産なし
        operations: { procedure: '', checkpoints: '' },
        risk: { assessment: '', measures: '' },
        customAttributes: {},
        maintenance: [
            { date: '2024-01-20', event: 'ワイヤーロープ交換作業中' }
        ],
        scheduledPlans: []
    },
    { 
        id: 'a3', 
        name: '搬送ロボット AGV-01', 
        tags: [4, 10],
        status: ['稼働中'], 
        date: '2023-01-20', 
        specs: '',
        image: '',
        images: [],
        parentId: null, // 親資産なし
        operations: { procedure: '', checkpoints: '' },
        risk: { assessment: '', measures: '' },
        customAttributes: {},
        maintenance: [],
        scheduledPlans: []
    },
    { 
        id: 'a4', 
        name: 'プレス機 P-200', 
        tags: [5, 11],
        status: ['停止中', '修理中'], 
        date: '2019-08-10', 
        specs: '油圧系統の不具合により運転停止中。部品発注済み',
        image: '',
        images: [],
        parentId: null, // 親資産なし
        operations: { procedure: '', checkpoints: '' },
        risk: { assessment: '', measures: '' },
        customAttributes: {},
        maintenance: [
            { date: '2024-01-18', event: '油圧ユニット故障診断' }
        ],
        scheduledPlans: []
    }
];

// グローバル状態管理
let currentPage = 'dashboard';
let currentMasterId = 'loc';
let currentView = 'list';
let currentMasterMode = 'tags'; // 'tags' or 'assets'
let assetViewMode = 'list';
let editingAssetId = null;
let editingTags = [];
let isNewAsset = false;
let originalAssetData = {};
let historySortOrder = 'desc';
let scheduleSortOrder = 'desc';
let currentCalendarDate = new Date();
let calendarState = {
    year: new Date().getFullYear(),
    month: new Date().getMonth()
};

// リスト表示設定
let listDisplaySettings = {
    columns: [
        { key: 'name', label: '資産名称', visible: true, order: 0, align: 'left', width: 'auto' },
        { key: 'id', label: '資産ID', visible: false, order: 1, align: 'left', width: 'auto' },
        { key: 'date', label: '導入日', visible: true, order: 2, align: 'left', width: 'auto' },
        { key: 'tags-loc', label: '設置場所・組織', visible: true, order: 3, align: 'left', width: 'auto' },
        { key: 'tags-cat', label: '資産分類・属性', visible: true, order: 4, align: 'left', width: 'auto' },
        { key: 'tags-spec', label: '仕様', visible: true, order: 5, align: 'left', width: 'auto' },
        { key: 'status', label: 'ステータス', visible: true, order: 6, align: 'right', width: 'auto' }
    ]
};

// グラフ状態管理（タグ用）
let graphState = {
    offsetX: 0,
    offsetY: 0,
    panX: 0,
    panY: 0,
    scale: 1,
    isPanning: false,
    panStartX: 0,
    panStartY: 0
};

// グラフ状態管理（資産用）
let assetsGraphState = {
    offsetX: 0,
    offsetY: 0,
    panX: 0,
    panY: 0,
    scale: 1,
    isPanning: false,
    panStartX: 0,
    panStartY: 0
};

let selectedElement = null;
let nextTagId = 100;
let nextAssetId = 'a' + 100;

/* --- リスト表示のソート状態 --- */
let listSortState = { key: null, direction: null };

/**
 * ソート状態をリセットする
 */
function resetListSortState() {
    listSortState.key = null;
    listSortState.direction = null;
}

/**
 * トグルボタンをアクティブに設定する
 * @param {HTMLElement} btn
 */
function setToggleActive(btn) {
    btn.className = 'btn btn-sm toggle-btn-active';
    btn.style.background = '';
    btn.style.boxShadow = '';
    btn.style.color = '';
}

/**
 * トグルボタンを非アクティブに設定する
 * @param {HTMLElement} btn
 */
function setToggleInactive(btn) {
    btn.className = 'btn btn-sm toggle-btn-inactive';
    btn.style.background = '';
    btn.style.boxShadow = '';
    btn.style.color = '';
}

/**
 * データをIndexedDBに保存
 * "Load-and-Sync" 戦略: メモリ上のグローバル変数をDBに一括同期します
 */
async function saveDataToDB() {
    try {
        // メモリ上のデータをDBテーブルに一括保存
        await db.transaction('rw', db.assets, db.tags, db.masters, db.system, async () => {
            // 安全のためテーブルをクリアしてから現在のメモリ状態を保存
            await db.assets.clear();
            await db.assets.bulkPut(assets);

            await db.tags.clear();
            await db.tags.bulkPut(tags);

            await db.masters.clear();
            await db.masters.bulkPut(masters);

            // システム設定の保存
            await db.system.put({ key: 'listDisplaySettings', value: listDisplaySettings });
            await db.system.put({ key: 'nextTagId', value: nextTagId });
            await db.system.put({ key: 'nextAssetId', value: nextAssetId });
            await db.system.put({ key: 'version', value: '2.0' });
            await db.system.put({ key: 'saveDate', value: new Date().toISOString() });
        });
        
        return true;
    } catch(error) {
        console.error('DB保存エラー:', error);
        showToast('データの保存に失敗しました', 'error');
        return false;
    }
}

/**
 * IndexedDBからデータを読み込み
 * アプリ起動時に実行され、グローバル変数を初期化します
 */
async function loadDataFromDB() {
    try {
        // DBが空かどうかチェック（バージョン情報で判断）
        const versionEntry = await db.system.get('version');
        
        if (!versionEntry) {
            console.log('DBは空です。初期データを投入します。');
            // 初期データ（このファイルの上部で定義された変数）をDBに保存して初期化
            await saveDataToDB();
            return true;
        }

        // DBからデータを取得してグローバル変数にセット
        const loadedAssets = await db.assets.toArray();
        const loadedTags = await db.tags.toArray();
        const loadedMasters = await db.masters.toArray();
        
        // 設定値の取得
        const settingsEntry = await db.system.get('listDisplaySettings');
        const tagIdEntry = await db.system.get('nextTagId');
        const assetIdEntry = await db.system.get('nextAssetId');

        // グローバル変数を更新
        assets = loadedAssets;
        tags = loadedTags;
        masters = loadedMasters;

        if (settingsEntry) listDisplaySettings = settingsEntry.value;
        if (tagIdEntry) nextTagId = tagIdEntry.value;
        if (assetIdEntry) nextAssetId = assetIdEntry.value;

        // データ互換性チェック（念のため）
        assets.forEach(asset => {
            if(!asset.images) asset.images = [];
            if(!asset.scheduledPlans) asset.scheduledPlans = [];
            if(!asset.maintenance) asset.maintenance = [];
            if(!asset.parentId) asset.parentId = null; // 親子関係の初期化
            if(!asset.customAttributes) asset.customAttributes = {}; // カスタム属性の初期化
        });
        
        // タグのカスタムフィールド互換性チェック
        tags.forEach(tag => {
            if(!tag.customFields) tag.customFields = [];
        });

        console.log('DBからデータを読み込みました:', {
            masters: masters.length,
            tags: tags.length,
            assets: assets.length
        });
        
        return true;

    } catch(error) {
        console.error('DB読み込みエラー:', error);
        showToast('データの読み込みに失敗しました。', 'error');
        return false;
    }
}

/**
 * データを全消去（DBクリア）
 */
async function clearDatabase() {
    if(confirm('すべてのデータをクリアして初期状態に戻しますか？\nこの操作は取り消せません。')) {
        await db.delete(); // DBごと削除
        location.reload(); // リロードして再初期化
    }
}

