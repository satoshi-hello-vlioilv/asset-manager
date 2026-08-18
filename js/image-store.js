
/**
 * image-store.js
 * 画像の実体（Blob）を IndexedDB で管理する層
 *
 * 設計:
 *   以前は画像を base64 の data URL にして資産レコードの中に持っていた。
 *   この方式には次の問題がある。
 *     - base64 は元のバイト数より約33%大きくなる
 *     - 資産レコードが数MBになり、一覧の読み込み・保存のたびに巨大な文字列を扱うことになる
 *     - 保存のたびに全資産を書き直すため、画像が増えるほど自動保存が重くなる
 *
 *   そこで画像は images ストアに Blob のまま置き、資産側は参照（id）だけを持つ。
 *   資産レコードは軽いままで、画像は必要なときにだけ読み出せる。
 *
 *   表示には Object URL を使う。Blob 自体はブラウザが管理しているため、
 *   URLを作ってもデータがまるごとメモリに載るわけではない。
 */

/** 画像IDの接頭辞（ZIP内のファイル名にもそのまま使う） */
const IMAGE_ID_PREFIX = 'img_';

/** imageId -> Object URL。描画は同期的に行うため、URLは事前に用意しておく */
const imageUrlCache = new Map();

/** imageId -> { type, size }。容量表示や書き出しの拡張子判定に使う */
const imageMetaCache = new Map();

/**
 * 新しい画像IDを発行する
 */
function newImageId() {
    return IMAGE_ID_PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Object URL を作り直してキャッシュする
 */
function cacheImageUrl(id, blob) {
    const previous = imageUrlCache.get(id);
    if(previous) URL.revokeObjectURL(previous);
    imageUrlCache.set(id, URL.createObjectURL(blob));
    imageMetaCache.set(id, { type: blob.type, size: blob.size });
}

/**
 * 画像を保存する
 * @param {string} id
 * @param {Blob} blob
 * @param {{assetId?: string}} [meta]
 */
async function putImageBlob(id, blob, meta = {}) {
    await db.images.put({
        id,
        assetId: meta.assetId || null,
        blob,
        type: blob.type || 'image/webp',
        size: blob.size,
        created: Date.now()
    });
    cacheImageUrl(id, blob);
}

/**
 * 保存済みの画像をすべて読み、表示用のURLを用意する
 * 起動時に一度だけ呼ぶ。
 */
async function loadImageUrlCache() {
    imageUrlCache.forEach(url => URL.revokeObjectURL(url));
    imageUrlCache.clear();
    imageMetaCache.clear();

    const rows = await db.images.toArray();
    rows.forEach(row => {
        if(row.blob) cacheImageUrl(row.id, row.blob);
    });
    return rows.length;
}

/**
 * 資産に紐づく画像エントリから、表示に使うURLを得る
 * エントリは次のいずれか:
 *   { id, comment, selected }  … IndexedDBに実体がある画像
 *   { url, comment, selected } … 外部URLを参照しているだけの画像
 */
function getImageSrc(entry) {
    if(!entry) return '';
    if(entry.id) return imageUrlCache.get(entry.id) || '';
    return entry.url || '';
}

/**
 * 画像の実体を取得する（書き出し用）
 */
async function getImageBlob(id) {
    const row = await db.images.get(id);
    return row ? row.blob : null;
}

/**
 * 画像を1件削除する
 */
async function deleteImageBlob(id) {
    const url = imageUrlCache.get(id);
    if(url) URL.revokeObjectURL(url);
    imageUrlCache.delete(id);
    imageMetaCache.delete(id);
    await db.images.delete(id);
}

/**
 * 資産に紐づく画像をまとめて削除する（資産の削除時）
 */
async function deleteImagesOfAsset(asset) {
    const ids = (asset.images || []).map(img => img.id).filter(Boolean);
    for(const id of ids) await deleteImageBlob(id);
}

/**
 * どの資産からも参照されていない画像を掃除する
 *
 * 画像の削除は「元に戻す」を出すため、その場では実体を消さずに参照だけ外している。
 * 取り消されなかった分は、次回の起動時にここでまとめて片付ける。
 * @returns {Promise<number>} 削除した件数
 */
async function cleanupOrphanImages() {
    const referenced = new Set();
    assets.forEach(asset => {
        (asset.images || []).forEach(img => { if(img.id) referenced.add(img.id); });
    });

    const ids = await db.images.toCollection().primaryKeys();
    const orphans = ids.filter(id => !referenced.has(id));
    for(const id of orphans) await deleteImageBlob(id);
    return orphans.length;
}

/* ============================================================
   旧形式（base64を資産レコードに埋め込む方式）からの移行
   ============================================================ */

/**
 * data URL を Blob に変換する
 */
function dataUrlToBlob(dataUrl) {
    const match = /^data:([^;,]+)?(;base64)?,/.exec(dataUrl);
    if(!match) throw new Error('data URL として解釈できません');

    const mime = match[1] || 'application/octet-stream';
    const body = dataUrl.slice(match[0].length);

    if(match[2]) {
        const binary = atob(body);
        const bytes = new Uint8Array(binary.length);
        for(let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(body)], { type: mime });
}

/**
 * 資産レコードに埋め込まれた画像を images ストアへ移す
 *
 * 旧バージョンのデータ、および旧形式のJSONを読み込んだ直後に実行する。
 * 外部URLを参照しているだけの画像はそのまま残す（実体を持っていないため）。
 * @returns {Promise<number>} 移行した枚数
 */
async function migrateEmbeddedImages() {
    let migrated = 0;

    for(const asset of assets) {
        if(!Array.isArray(asset.images)) asset.images = [];

        // さらに古い形式: 単一の image プロパティしか持たない
        if(asset.image && asset.images.length === 0) {
            asset.images.push({ url: asset.image, comment: '', selected: true });
        }
        delete asset.image;

        for(let i = 0; i < asset.images.length; i++) {
            const entry = asset.images[i];
            if(!entry || entry.id) continue;                       // すでに移行済み
            if(!entry.url || !String(entry.url).startsWith('data:')) continue; // 外部URLはそのまま

            try {
                const blob = dataUrlToBlob(entry.url);
                const id = newImageId();
                await putImageBlob(id, blob, { assetId: asset.id });
                asset.images[i] = {
                    id,
                    comment: entry.comment || '',
                    selected: !!entry.selected
                };
                migrated++;
            } catch(error) {
                console.warn('画像の移行に失敗しました:', error);
            }
        }
    }

    return migrated;
}

/* ============================================================
   保存容量
   ============================================================ */

/**
 * 画像の合計サイズ（バイト）
 */
function getTotalImageBytes() {
    let total = 0;
    imageMetaCache.forEach(meta => { total += meta.size || 0; });
    return total;
}

/**
 * 人が読める容量表記にする
 */
function formatBytes(bytes) {
    if(!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / Math.pow(1024, index);
    return `${value >= 100 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

/**
 * ブラウザに保存されている容量の概算を返す
 * @returns {Promise<{images:number, total:number|null, quota:number|null}>}
 */
async function getStorageStats() {
    const images = getTotalImageBytes();
    let total = null, quota = null;

    if(navigator.storage && navigator.storage.estimate) {
        try {
            const estimate = await navigator.storage.estimate();
            total = estimate.usage ?? null;
            quota = estimate.quota ?? null;
        } catch(_) { /* 取得できない環境では概算を出さない */ }
    }
    return { images, total, quota, count: imageMetaCache.size };
}

/**
 * MIMEタイプから拡張子を決める（ZIPに書き出すときのファイル名用）
 */
function extensionForMime(mime) {
    const map = {
        'image/webp': '.webp',
        'image/jpeg': '.jpg',
        'image/jpg':  '.jpg',
        'image/png':  '.png',
        'image/gif':  '.gif',
        'image/bmp':  '.bmp',
        'image/svg+xml': '.svg'
    };
    return map[(mime || '').toLowerCase()] || '.bin';
}
