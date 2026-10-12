
/**
 * ui.js
 * 基本UI操作（モーダル / メニュー / 表示密度 / ショートカット一覧）
 */

/**
 * モーダルを開く
 * @param {string} id
 */
function openModal(id) {
    const el = document.getElementById(id);
    if(el) el.classList.add('open');
}

/**
 * モーダルを閉じる
 * 資産モーダルに未保存の変更がある場合は、閉じる前に必ず確認する。
 * （作業内容が黙って消えることがない＝安心して触れる）
 */
function closeModal(id) {
    if(id === 'assetModal' && typeof hasUnsavedAssetChanges === 'function' && hasUnsavedAssetChanges()) {
        const label = isNewAsset ? 'この資産はまだ保存されていません。' : '未保存の変更があります。';
        if(!confirm(`${label}\n変更を破棄して閉じますか？\n\n（「キャンセル」を選ぶと編集に戻ります）`)) return;
    }

    const el = document.getElementById(id);
    if(el) el.classList.remove('open');

    if(id === 'assetModal') {
        // 新規作成中にモーダルを閉じた場合は一時資産を削除
        if(isNewAsset && editingAssetId) {
            assets = assets.filter(a => a.id !== editingAssetId);
        }
        isNewAsset = false;
        editingAssetId = null;
        if(typeof refreshCurrentView === 'function') refreshCurrentView();
    }
}

/* ============================================================
   情報密度の切り替え
   一覧で一度に見える件数を増やす「コンパクト」を既定とし、
   じっくり読みたい場面のために「ゆったり」も選べるようにする。
   ============================================================ */

/**
 * 保存されている密度設定を画面に反映する
 */
function applyDensity() {
    const density = (uiPrefs && uiPrefs.density === 'cozy') ? 'cozy' : 'compact';
    document.documentElement.setAttribute('data-density', density);

    // メニューのチェック表示を同期
    const compact = document.getElementById('menuDensityCompact');
    const cozy = document.getElementById('menuDensityCozy');
    if(compact) compact.classList.toggle('is-checked', density === 'compact');
    if(cozy) cozy.classList.toggle('is-checked', density === 'cozy');
    if(compact) compact.querySelector('i').style.visibility = density === 'compact' ? 'visible' : 'hidden';
    if(cozy) cozy.querySelector('i').style.visibility = density === 'cozy' ? 'visible' : 'hidden';
}

/**
 * 密度を変更して保存する
 * @param {'compact'|'cozy'} density
 */
function setDensity(density) {
    uiPrefs.density = density;
    applyDensity();
    closeMenus();
    autoSaveData();
    showToast(density === 'compact' ? '表示をコンパクトにしました' : '表示をゆったりにしました', 'info');
}

/**
 * 日付入力に今日の日付を入れる（入力補助）
 */
function setDateFieldToday(inputId) {
    const el = document.getElementById(inputId);
    if(!el) return;
    el.value = todayISO();
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

/* ============================================================
   ドロップダウンメニュー
   使用頻度の低い操作は、アイコンだけのボタンではなく
   ラベル付きのメニューに集約する（意味を推測させない）
   ============================================================ */

function toggleMenu(id, event) {
    if(event) event.stopPropagation();
    const menu = document.getElementById(id);
    if(!menu) return;
    const wasOpen = menu.classList.contains('open');
    closeMenus();
    closeFilterPopover();
    if(!wasOpen) {
        if(id === 'moreMenu') document.getElementById('tabBarMenu')?.classList.add('is-open');
        menu.classList.add('open');
        if(id === 'moreMenu') refreshStorageUsage();
    }
}

/**
 * 保存容量の内訳をデータ管理メニューに表示する
 * 画像を含めて端末に保存しているため、どれくらい使っているかを確認できるようにする。
 */
async function refreshStorageUsage() {
    const el = document.getElementById('storageUsageText');
    if(!el) return;

    const stats = await getStorageStats();
    const lines = [`画像 ${stats.count}枚 / ${formatBytes(stats.images)}`];
    if(stats.total !== null) {
        lines.push(stats.quota
            ? `このサイト全体 ${formatBytes(stats.total)}（上限の目安 ${formatBytes(stats.quota)}）`
            : `このサイト全体 ${formatBytes(stats.total)}`);
    }
    el.innerHTML = lines.map(escapeHTML).join('<br>');
}

function closeMenus() {
    document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
    document.getElementById('tabBarMenu')?.classList.remove('is-open');
}

/**
 * グラフビューの操作ガイドを折りたたみ／展開
 */
function toggleGraphLegend(type) {
    const content = document.getElementById(type === 'tags' ? 'tagsLegendContent' : 'assetsLegendContent');
    const chevron = document.getElementById(type === 'tags' ? 'tagsLegendChevron' : 'assetsLegendChevron');
    if(!content || !chevron) return;

    const willOpen = content.style.display === 'none';
    content.style.display = willOpen ? 'block' : 'none';
    chevron.style.transform = willOpen ? 'rotate(90deg)' : 'rotate(0deg)';
}

/* ============================================================
   ショートカット一覧（? キー）
   「思い出させない」ため、いつでも一覧を確認できるようにする
   ============================================================ */

const KEY_SHORTCUTS = [
    {
        group: '移動・検索',
        items: [
            { keys: ['Ctrl', 'K'], desc: '資産・タグ・操作を横断検索' },
            { keys: ['/'],         desc: '表示中の一覧を絞り込む' },
            { keys: ['G', 'D'],    desc: 'ダッシュボードへ移動' },
            { keys: ['G', 'A'],    desc: '資産一覧へ移動' }
        ]
    },
    {
        group: '登録・編集',
        items: [
            { keys: ['N'],          desc: '新規資産を登録' },
            { keys: ['Ctrl', 'V'],  desc: '画像を貼り付けて登録' },
            { keys: ['Ctrl', 'S'],  desc: '編集中の資産を保存' },
            { keys: ['Esc'],        desc: '閉じる / 取り消す' }
        ]
    },
    {
        group: '一覧',
        items: [
            { keys: ['↑', '↓'], desc: '行を選択（Enter で開く）' },
            { keys: ['1'],   desc: 'リスト表示' },
            { keys: ['2'],   desc: 'カード表示' },
            { keys: ['3'],   desc: 'カレンダー表示' }
        ]
    },
    {
        group: '資産詳細',
        items: [
            { keys: ['Alt', '←'], desc: '一覧の前の資産へ' },
            { keys: ['Alt', '→'], desc: '一覧の次の資産へ' },
            { keys: ['Del'],      desc: 'グラフで選択中のノード・接続を削除' }
        ]
    }
];

function openKeyHelp() {
    const container = document.getElementById('keyHelpContent');
    if(container) {
        container.innerHTML = KEY_SHORTCUTS.map(g => `
            <div>
                <div class="keyhelp-group-title">${escapeHTML(g.group)}</div>
                ${g.items.map(item => `
                    <div class="keyhelp-row">
                        <span>${escapeHTML(item.desc)}</span>
                        <span class="keyhelp-keys">${item.keys.map(k => `<span class="kbd">${escapeHTML(k)}</span>`).join('')}</span>
                    </div>`).join('')}
            </div>`).join('');
    }
    openModal('keyHelpModal');
}

/* ============================================================
   トグルボタン（セグメンテッド・コントロール）の状態
   ============================================================ */

/**
 * トグルボタンをアクティブに設定する
 */
function setToggleActive(btn) {
    if(!btn) return;
    btn.className = 'btn btn-sm toggle-btn-active';
    btn.setAttribute('aria-pressed', 'true');
}

/**
 * トグルボタンを非アクティブに設定する
 */
function setToggleInactive(btn) {
    if(!btn) return;
    btn.className = 'btn btn-sm toggle-btn-inactive';
    btn.setAttribute('aria-pressed', 'false');
}
