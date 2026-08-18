
/**
 * import-export.js
 * バックアップの書き出し / 読み込み
 *
 * 設計:
 *   画像を含めて丸ごと持ち出せることを最優先にしている。
 *   画像の実体は IndexedDB の images ストアにあり、JSONには入らないため、
 *   バックアップは「data.json + 画像ファイル」をまとめたZIPを標準形式とする。
 *
 *   ZIPにすることで、
 *     - 画像がbase64で膨らまない（元のバイト数のまま格納される）
 *     - 解凍すれば画像を普通のファイルとして取り出せる
 *     - JSONだけ見たい場合も data.json を開けばよい
 *   という利点がある。
 *
 *   旧形式（画像をbase64で埋め込んだ単体JSON）も引き続き読み込める。
 */

/** ZIP内のレイアウト */
const BACKUP_DATA_FILE = 'data.json';
const BACKUP_IMAGE_DIR = 'images/';

/* ============================================================
   書き出し
   ============================================================ */

/**
 * データと画像をまとめてZIPで書き出す
 */
async function exportToZIP() {
    try {
        showToast('バックアップを作成しています…', 'info');

        // 資産は参照だけを持つので、そのままコピーしてファイル名に置き換える
        const payload = JSON.parse(JSON.stringify({
            masters,
            tags,
            assets: getPersistedAssets(),
            listDisplaySettings
        }));

        const files = [];
        const exported = new Map(); // imageId -> ZIP内のファイル名
        let missing = 0;

        for(const asset of payload.assets) {
            delete asset.image; // 旧形式の名残は書き出さない

            for(const entry of (asset.images || [])) {
                if(!entry.id) continue; // 外部URL参照の画像は実体を持たない

                if(!exported.has(entry.id)) {
                    const blob = await getImageBlob(entry.id);
                    if(!blob) { missing++; continue; }

                    const name = `${BACKUP_IMAGE_DIR}${entry.id}${extensionForMime(blob.type)}`;
                    exported.set(entry.id, name);
                    // 画像は既に圧縮済みなので、再圧縮せずそのまま格納する
                    files.push({ name, data: blob, compress: false });
                }

                entry.file = exported.get(entry.id);
                delete entry.id;
            }
        }

        const data = {
            version: DATA_FORMAT_VERSION,
            app: APP_VERSION,
            exportDate: new Date().toISOString(),
            imageCount: exported.size,
            ...payload
        };

        files.unshift({ name: BACKUP_DATA_FILE, data: JSON.stringify(data, null, 2) });
        files.push({ name: 'README.txt', data: buildBackupReadme(data, exported.size) });

        const zip = await createZip(files);
        downloadBlob(zip, `asset-manager_${todayISO()}.zip`);

        const detail = exported.size > 0 ? `（画像 ${exported.size}枚 / ${formatBytes(zip.size)}）` : `（${formatBytes(zip.size)}）`;
        showToast(`${payload.assets.length}件の資産を書き出しました${detail}`, 'success');
        if(missing > 0) showToast(`${missing}枚の画像が見つからず、書き出せませんでした`, 'warning');

    } catch(error) {
        console.error('エクスポートエラー:', error);
        showToast('バックアップの作成に失敗しました', 'error');
    }
}

/** ZIPを開いた人が中身を理解できるように説明を同梱する */
function buildBackupReadme(data, imageCount) {
    return [
        '統合資産管理システム バックアップ',
        '',
        `作成日時   : ${new Date(data.exportDate).toLocaleString('ja-JP')}`,
        `アプリ     : v${data.app}`,
        `データ形式 : ${data.version}`,
        '',
        '── 内容 ────────────────────────────',
        `${BACKUP_DATA_FILE}   資産・タグ・マスタ定義・表示設定（JSON）`,
        `${BACKUP_IMAGE_DIR}      登録画像 ${imageCount}枚`,
        '',
        `資産    : ${data.assets.length}件`,
        `タグ    : ${data.tags.length}件`,
        `マスタ  : ${data.masters.length}件`,
        '',
        '── 戻し方 ──────────────────────────',
        'アプリの「データ管理 → バックアップから復元」で、このZIPをそのまま',
        '選択してください。画面へのドラッグ&ドロップでも読み込めます。',
        '',
        `${BACKUP_DATA_FILE} の assets[].images[].file が ${BACKUP_IMAGE_DIR} 内の`,
        'ファイル名を指しています。画像だけ取り出したい場合は解凍してください。',
        ''
    ].join('\n');
}

/** Blobをファイルとして保存する */
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/* 旧名の互換（メニューやパレットからの呼び出しを壊さない） */
function exportToJSON() { return exportToZIP(); }

/* ============================================================
   読み込み
   ============================================================ */

/**
 * ファイル選択からの読み込み
 */
function importFromJSON(event) {
    const file = event.target.files[0];
    if(!file) return;
    importBackupFile(file);
    event.target.value = ''; // 同じファイルを再度選べるようにリセット
}

/**
 * バックアップファイルを読み込む（ZIP / JSON を自動判別）
 * @param {File|Blob} file
 */
async function importBackupFile(file) {
    try {
        if(await looksLikeZip(file)) {
            await importFromZIP(file);
        } else {
            await processJSONFile(file);
        }
    } catch(error) {
        console.error('インポートエラー:', error);
        showToast(`読み込みに失敗しました：${error.message}`, 'error');
    }
}

/**
 * ZIPバックアップから復元する
 */
async function importFromZIP(file) {
    const entries = await readZip(file);

    const dataEntry = entries.find(e => e.name === BACKUP_DATA_FILE)
                   || entries.find(e => e.name.endsWith('/' + BACKUP_DATA_FILE));
    if(!dataEntry) {
        showToast(`ZIPの中に ${BACKUP_DATA_FILE} が見つかりませんでした`, 'error');
        return;
    }

    const data = JSON.parse(await dataEntry.text());
    if(!data.assets || !Array.isArray(data.assets)) {
        showToast('❌ 無効なデータ形式です。資産データが見つかりません。', 'error');
        return;
    }

    // ZIP内の画像を、拡張子を除いたファイル名（=元の画像ID）で引けるようにする
    const imageEntries = new Map();
    entries.forEach(e => {
        if(e.isDirectory) return;
        const match = /(?:^|\/)images\/([^/]+)$/.exec(e.name);
        if(match) imageEntries.set(match[1], e);
    });

    if(!confirmImport(data, imageEntries.size, file.name)) return;

    // 画像を先に取り込む（途中で失敗したときに、参照だけが残らないようにする）
    await db.images.clear();
    imageUrlCache.forEach(url => URL.revokeObjectURL(url));
    imageUrlCache.clear();
    imageMetaCache.clear();

    let restoredImages = 0;
    const fileToId = new Map();

    for(const [filename, entry] of imageEntries) {
        const id = filename.replace(/\.[^.]+$/, '');
        const blob = await entry.blob(mimeForFilename(filename));
        await putImageBlob(id, blob, {});
        fileToId.set(`${BACKUP_IMAGE_DIR}${filename}`, id);
        restoredImages++;
    }

    // 資産側の参照をファイル名から画像IDへ戻す
    for(const asset of data.assets) {
        if(!Array.isArray(asset.images)) asset.images = [];
        asset.images = asset.images.map(entry => {
            if(entry.file) {
                const id = fileToId.get(entry.file) || fileToId.get(entry.file.replace(/^.*images\//, BACKUP_IMAGE_DIR));
                return id
                    ? { id, comment: entry.comment || '', selected: !!entry.selected }
                    : null; // ZIPに実体が無い画像は取り込まない
            }
            return entry; // 外部URL参照はそのまま
        }).filter(Boolean);

        for(const img of asset.images) {
            if(img.id) await db.images.update(img.id, { assetId: asset.id });
        }
    }

    applyImportedData(data);

    showToast(`${data.assets.length}件の資産と${restoredImages}枚の画像を復元しました`, 'success');
}

/**
 * 旧形式の単体JSONから復元する（画像はbase64で埋め込まれている）
 */
async function processJSONFile(file) {
    const text = await file.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch(_) {
        showToast('❌ JSONとして読み取れませんでした', 'error');
        return;
    }

    if(!data.assets || !Array.isArray(data.assets)) {
        showToast('❌ 無効なデータ形式です。資産データが見つかりません。', 'error');
        return;
    }

    // 埋め込まれた画像の枚数を数えて、確認ダイアログに出す
    const embedded = data.assets.reduce((sum, a) => {
        const list = Array.isArray(a.images) ? a.images : [];
        return sum + list.filter(i => i && typeof i.url === 'string' && i.url.startsWith('data:')).length
                   + (typeof a.image === 'string' && a.image.startsWith('data:') ? 1 : 0);
    }, 0);

    if(!confirmImport(data, embedded, file.name)) return;

    // 旧形式のリスト表示設定を現行形式に合わせる
    if(data.listDisplaySettings && data.listDisplaySettings.columns) {
        data.listDisplaySettings.columns.forEach(col => {
            if(col.width && typeof col.width === 'object') {
                col.width = col.width.type === 'fixed'
                    ? `${col.width.value || 150}px`
                    : (col.width.type || 'auto');
            }
            if(!col.align) col.align = 'left';
            if(col.visible === undefined) col.visible = true;
            if(col.order === undefined) col.order = 0;
        });
    }

    await db.images.clear();
    imageUrlCache.forEach(url => URL.revokeObjectURL(url));
    imageUrlCache.clear();
    imageMetaCache.clear();

    applyImportedData(data, { skipSave: true });

    // base64の画像を images ストアへ移してから保存する
    const migrated = await migrateEmbeddedImages();
    await saveDataToDB();
    refreshAfterImport();

    showToast(`${data.assets.length}件の資産を読み込みました（画像 ${migrated}枚を変換）`, 'success');
}

/**
 * 取り込み前の確認
 */
function confirmImport(data, imageCount, filename) {
    let warning = '';
    if(!data.version) {
        warning = '⚠️ バージョン情報がないデータです\n\n';
    } else if(data.version !== DATA_FORMAT_VERSION) {
        warning = `⚠️ 異なるデータ形式 (${data.version}) です。可能な範囲で変換して取り込みます\n\n`;
    }

    return confirm(
        `${warning}${filename}\n\n` +
        `以下の内容で現在のデータを置き換えます：\n\n` +
        `　マスタ定義: ${data.masters?.length || 0}件\n` +
        `　タグ: ${data.tags?.length || 0}件\n` +
        `　資産: ${data.assets.length}件\n` +
        `　画像: ${imageCount}枚\n` +
        `　表示設定: ${data.listDisplaySettings ? '含む' : '含まない'}\n\n` +
        `⚠️ 現在のデータは失われます。取り消せません。\n` +
        `続行しますか？`
    );
}

/**
 * 読み込んだデータをアプリに反映する
 */
function applyImportedData(data, options = {}) {
    if(Array.isArray(data.masters)) masters = data.masters;
    if(Array.isArray(data.tags)) tags = data.tags;
    assets = data.assets;
    if(data.listDisplaySettings) listDisplaySettings = data.listDisplaySettings;

    // 欠けているフィールドを補う（古いデータでも落ちないように）
    assets.forEach(asset => {
        if(!Array.isArray(asset.images)) asset.images = [];
        if(!Array.isArray(asset.scheduledPlans)) asset.scheduledPlans = [];
        if(!Array.isArray(asset.maintenance)) asset.maintenance = [];
        if(!asset.parentId) asset.parentId = null;
        if(!asset.customAttributes) asset.customAttributes = {};
        if(!Array.isArray(asset.status)) asset.status = asset.status ? [asset.status] : [];
    });
    tags.forEach(tag => { if(!tag.customFields) tag.customFields = []; });

    if(!options.skipSave) {
        saveDataToDB();
        refreshAfterImport();
    }
}

/** 取り込み後に画面を作り直す（列定義もタグ階層も入れ替わっているため） */
function refreshAfterImport() {
    addCustomFieldColumns();
    activeFilter = null;
    searchQuery = '';
    invalidateSuggestionCaches();
    renderSidebar();
    refreshCurrentView();
}

/* ============================================================
   画面へのドラッグ&ドロップ
   ============================================================ */

function setupGlobalDropZone() {
    const body = document.body;
    let dropOverlay = null;

    const createDropOverlay = () => {
        dropOverlay = document.createElement('div');
        dropOverlay.id = 'globalDropOverlay';
        dropOverlay.style.cssText = `
            position: fixed; inset: 0;
            background: rgba(39, 83, 136, 0.10);
            backdrop-filter: blur(3px);
            z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            pointer-events: none; opacity: 0; transition: opacity 0.2s;
        `;

        // ドロップできるものを明示する（何が起きるか推測させない）
        dropOverlay.innerHTML = `
            <div style="background:var(--surface); padding:32px 48px; border-radius:var(--radius-xl); box-shadow:var(--shadow-xl); border:2px dashed var(--primary); text-align:center;">
                <i class="fa-solid fa-hand-pointer" style="font-size:2rem; color:var(--primary); margin-bottom:12px; display:block;"></i>
                <div style="font-size:var(--text-lg); font-weight:700; color:var(--text-strong); margin-bottom:10px;">ここにドロップ</div>
                <div style="font-size:var(--text-sm); color:var(--text-sub); line-height:1.9; text-align:left;">
                    <div><i class="fa-solid fa-file-zipper" style="width:20px;"></i> ZIPバックアップ → データと画像を復元</div>
                    <div><i class="fa-solid fa-file-code" style="width:20px;"></i> JSON → 旧形式のデータを読み込む</div>
                    <div><i class="fa-solid fa-image" style="width:20px;"></i> 画像 → その画像で新規資産を作成</div>
                </div>
            </div>
        `;

        body.appendChild(dropOverlay);
        setTimeout(() => { if(dropOverlay) dropOverlay.style.opacity = '1'; }, 10);
    };

    const removeDropOverlay = () => {
        if(!dropOverlay) return;
        dropOverlay.style.opacity = '0';
        const target = dropOverlay;
        dropOverlay = null;
        setTimeout(() => target.remove(), 200);
    };

    let dragCounter = 0;
    const isModalOpen = () => document.querySelector('.modal-overlay.open') !== null;

    body.addEventListener('dragenter', (e) => {
        if(isModalOpen()) return; // モーダル内のドロップ（画像）を優先する
        e.preventDefault();
        dragCounter++;
        if(e.dataTransfer.types.includes('Files') && !dropOverlay) createDropOverlay();
    });

    body.addEventListener('dragleave', (e) => {
        if(isModalOpen()) return;
        e.preventDefault();
        dragCounter--;
        if(dragCounter <= 0) { dragCounter = 0; removeDropOverlay(); }
    });

    body.addEventListener('dragover', (e) => {
        if(isModalOpen()) return;
        e.preventDefault();
    });

    body.addEventListener('drop', async (e) => {
        if(isModalOpen()) return;

        e.preventDefault();
        dragCounter = 0;
        removeDropOverlay();

        const files = Array.from(e.dataTransfer.files);
        if(files.length === 0) return;

        // バックアップ（ZIP / JSON）
        const backup = files.find(f => /\.(zip|json)$/i.test(f.name));
        if(backup) {
            importBackupFile(backup);
            return;
        }

        // 画像ファイル（貼り付けと同じく、新規資産の下書きを作る）
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        if(imageFiles.length > 0) {
            receivePastedImages(imageFiles);
            return;
        }

        showToast('ZIP・JSON・画像ファイルのいずれかをドロップしてください', 'warning');
    });
}

/** 拡張子からMIMEタイプを推定する（ZIPには型情報が入っていないため） */
function mimeForFilename(filename) {
    const map = {
        webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml'
    };
    const ext = (filename.split('.').pop() || '').toLowerCase();
    return map[ext] || 'application/octet-stream';
}
