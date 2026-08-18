
/**
 * image-input.js
 * 画像の登録（Ctrl+V 貼り付け / ドラッグ&ドロップ / ファイル選択 / URL）と表示
 *
 * 設計:
 *   画像登録は「スクリーンショットを撮る → 貼る」で完結するのが最短。
 *   そのため Ctrl+V を最優先の経路として、アプリのどこにいても効くようにしている。
 *
 *   - 資産編集中に貼る  → その資産の画像として追加し、画像タブへ自動で移動
 *   - 一覧・ダッシュボードで貼る → その画像を持つ新規資産の下書きを開く
 *   どちらの場合も、何が起きたかを画面中央のフィードバックとトーストで即座に伝える。
 */

/* 画像の保存前圧縮の設定
   スクリーンショットは数MBになることがあり、そのまま IndexedDB に入れると
   読み込みが目に見えて遅くなる。表示用途に十分な解像度まで落として保存する。 */
const IMAGE_MAX_DIMENSION = 1600;  // 長辺の最大ピクセル
const IMAGE_QUALITY       = 0.85;  // 再エンコード品質
const IMAGE_SKIP_BYTES    = 300 * 1024; // これ以下かつ小さい画像は無加工で保存

/* ============================================================
   貼り付け（Ctrl+V）
   ============================================================ */

/**
 * アプリ全体の貼り付けハンドラを設定する
 */
function setupImagePasteHandler() {
    document.addEventListener('paste', async (e) => {
        // 入力欄でのテキスト貼り付けは邪魔しない
        const target = e.target;
        const isTextField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

        const imageFiles = extractImageFiles(e.clipboardData);

        if(imageFiles.length > 0) {
            e.preventDefault();
            await receivePastedImages(imageFiles);
            return;
        }

        // 画像URLの貼り付け（入力欄以外で行われた場合のみ）
        if(!isTextField) {
            const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
            if(isProbablyImageUrl(text) && document.getElementById('assetModal').classList.contains('open')) {
                e.preventDefault();
                addImageObjectToAsset({ url: text.trim(), comment: '貼り付けたURL' });
                showToast('URLから画像を追加しました', 'success');
            }
        }
    });
}

/**
 * クリップボードから画像ファイルだけを取り出す
 * @param {DataTransfer} clipboardData
 * @returns {File[]}
 */
function extractImageFiles(clipboardData) {
    if(!clipboardData) return [];
    const files = [];

    if(clipboardData.files && clipboardData.files.length > 0) {
        Array.from(clipboardData.files).forEach(f => { if(f.type.startsWith('image/')) files.push(f); });
    }
    if(files.length === 0 && clipboardData.items) {
        Array.from(clipboardData.items).forEach(item => {
            if(item.kind === 'file' && item.type.startsWith('image/')) {
                const f = item.getAsFile();
                if(f) files.push(f);
            }
        });
    }
    return files;
}

function isProbablyImageUrl(text) {
    if(!text) return false;
    const t = text.trim();
    if(!/^https?:\/\//i.test(t)) return false;
    return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(t) || t.startsWith('data:image/');
}

/**
 * 貼り付けられた画像を、今の文脈にふさわしい形で受け取る
 * @param {File[]} files
 */
async function receivePastedImages(files) {
    const modalOpen = document.getElementById('assetModal').classList.contains('open');

    // 資産編集以外のモーダル（マスタ設定など）を触っている最中に
    // 勝手に新規資産が作られると、何が起きたか分からなくなる
    const otherModalOpen = Array.from(document.querySelectorAll('.modal-overlay.open'))
        .some(m => m.id !== 'assetModal');
    if(!modalOpen && otherModalOpen) {
        showToast('画像を登録するには、先に資産を開いてください', 'info');
        return;
    }

    if(modalOpen && editingAssetId) {
        // 編集中の資産に追加し、結果が見える画像タブへ移動する
        const added = await handleImageFiles(files, { silent: true });
        if(added > 0) {
            focusImagesTab();
            flashPasteFeedback(`画像を${added}枚追加しました`);
            showToast(`画像を${added}枚追加しました`, 'success');
        }
        return;
    }

    // モーダルが開いていない場合：その画像を持つ新規資産の下書きを開く
    createNewAsset();
    if(!editingAssetId) return; // 直前の編集を閉じるのを取り消した場合
    const added = await handleImageFiles(files, { silent: true });
    if(added > 0) {
        focusImagesTab();
        flashPasteFeedback(`画像から新規資産を作成`);
        showToast('貼り付けた画像で新規資産の下書きを作成しました。\n資産名を入力して保存してください。', 'info');
    } else {
        // 画像を取り込めなかったときは下書きを残さない
        closeModal('assetModal');
    }
}

/** 画像タブへ切り替える（貼り付け結果をその場で確認できるように） */
function focusImagesTab() {
    openModalTab('tabImages');
}

/** 貼り付けが効いたことを画面中央で一瞬だけ知らせる */
function flashPasteFeedback(text) {
    const el = document.createElement('div');
    el.className = 'paste-flash';
    el.innerHTML = `
        <div class="paste-flash-badge">
            <i class="fa-solid fa-paste"></i> ${escapeHTML(text)}
        </div>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 520);
}

/* ============================================================
   画像の追加（共通経路）
   ============================================================ */

/**
 * 画像ファイル群を編集中の資産に追加する
 * @param {FileList|File[]} files
 * @param {{silent?: boolean}} [options]
 * @returns {Promise<number>} 追加できた枚数
 */
async function handleImageFiles(files, options = {}) {
    if(!files || files.length === 0) return 0;

    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset) {
        showToast('先に資産を開いてから画像を追加してください', 'warning');
        return 0;
    }
    if(!asset.images) asset.images = [];

    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if(imageFiles.length === 0) {
        showToast('画像ファイルが見つかりませんでした', 'warning');
        return 0;
    }

    let added = 0;
    for(const file of imageFiles) {
        try {
            const blob = await compressImage(file);
            const id = newImageId();
            await putImageBlob(id, blob, { assetId: asset.id });
            asset.images.push({
                id,
                comment: buildImageComment(file),
                selected: asset.images.length === 0 // 最初の1枚は自動で代表画像にする
            });
            added++;
        } catch(error) {
            console.error('画像の読み込みに失敗:', error);
            showToast(`${file.name || '画像'} を読み込めませんでした`, 'error');
        }
    }

    if(added > 0) {
        afterImagesChanged();
        if(!options.silent) showToast(`画像を${added}枚追加しました`, 'success');
    }
    return added;
}

/**
 * 画像の説明を組み立てる
 * クリップボード由来のファイルは名前が image.png などで意味を持たないため、
 * 日時を添えて後から識別できるようにする。
 */
function buildImageComment(file) {
    const stamp = new Date().toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    if(!file.name || /^image\.(png|jpe?g|webp)$/i.test(file.name)) return `貼り付け ${stamp}`;
    return file.name;
}

/**
 * 画像オブジェクトを直接追加する（URL指定など）
 */
function addImageObjectToAsset(image) {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset) return;
    if(!asset.images) asset.images = [];

    asset.images.push({
        url: image.url,
        comment: image.comment || '',
        selected: asset.images.length === 0
    });
    afterImagesChanged();
}

/**
 * 画像の増減後に必要な更新をまとめて行う
 */
function afterImagesChanged() {
    renderImagesGallery();
    updateAssetTabCounts();
    refreshCurrentView();
    autoSaveData();
}

/**
 * 画像を保存に適したサイズへ縮小する
 * base64ではなくBlobのまま返し、そのまま IndexedDB に格納する。
 * @param {File|Blob} file
 * @returns {Promise<Blob>}
 */
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();

        img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('decode failed')); };
        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            const longest = Math.max(img.width, img.height);

            // 小さい画像はそのまま保存（無駄な再エンコードで劣化させない）
            if(file.size <= IMAGE_SKIP_BYTES && longest <= IMAGE_MAX_DIMENSION) {
                resolve(file);
                return;
            }

            const scale = Math.min(1, IMAGE_MAX_DIMENSION / longest);
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);

            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const mime = supportsWebP() ? 'image/webp' : 'image/jpeg';
            canvas.toBlob(blob => {
                if(!blob) { reject(new Error('encode failed')); return; }
                // 圧縮しても小さくならない場合は元のデータを使う
                resolve(blob.size < file.size ? blob : file);
            }, mime, IMAGE_QUALITY);
        };

        img.src = objectUrl;
    });
}

let _webpSupport = null;
function supportsWebP() {
    if(_webpSupport !== null) return _webpSupport;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    _webpSupport = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    return _webpSupport;
}

/* ============================================================
   ドロップゾーン
   ============================================================ */

/**
 * 画像タブのドロップゾーンと、モーダル全体へのドロップを設定する
 */
function setupImageDropZone() {
    const dropZone = document.getElementById('imageDropZone');
    const fileInput = document.getElementById('imageFileInput');
    if(!dropZone || dropZone.dataset.bound === '1') return;
    dropZone.dataset.bound = '1';

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', (e) => {
        if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });

    const setDragState = (on) => dropZone.classList.toggle('is-dragover', on);

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); setDragState(true); });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); setDragState(false); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation();
        setDragState(false);
        handleImageFiles(e.dataTransfer.files);
    });

    // 画像タブのどこにドロップしても受け付ける（狙いを外しても失敗しない）
    const pane = document.getElementById('tabImages');
    if(pane && pane.dataset.bound !== '1') {
        pane.dataset.bound = '1';
        pane.addEventListener('dragover', (e) => {
            if(e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
                e.preventDefault(); setDragState(true);
            }
        });
        pane.addEventListener('dragleave', (e) => { if(e.target === pane) setDragState(false); });
        pane.addEventListener('drop', (e) => {
            if(e.dataTransfer && e.dataTransfer.files.length > 0) {
                e.preventDefault(); e.stopPropagation();
                setDragState(false);
                handleImageFiles(e.dataTransfer.files);
            }
        });
    }
}

/* ============================================================
   URLからの追加
   ============================================================ */

function toggleImageUrlForm() {
    const form = document.getElementById('imageUrlForm');
    if(!form) return;
    const willShow = form.style.display === 'none';
    form.style.display = willShow ? 'block' : 'none';
    if(willShow) document.getElementById('newImageUrl').focus();
}

function addImageFromUrl() {
    const urlInput = document.getElementById('newImageUrl');
    const commentInput = document.getElementById('newImageComment');
    const url = urlInput.value.trim();
    const comment = commentInput.value.trim();

    if(!url) {
        showToast('画像URLを入力してください', 'warning');
        urlInput.focus();
        return;
    }

    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset) return;

    addImageObjectToAsset({ url, comment });
    urlInput.value = '';
    commentInput.value = '';
    showToast('画像を追加しました', 'success');
}

/* ============================================================
   ギャラリー表示
   ============================================================ */

function renderImagesGallery() {
    const asset = assets.find(a => a.id === editingAssetId);
    const container = document.getElementById('imagesGalleryContainer');
    if(!asset || !container) return;
    if(!asset.images) asset.images = [];

    if(asset.images.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding:var(--space-8) var(--space-5);">
                <i class="fa-regular fa-images empty-state-icon"></i>
                <div class="empty-state-title">画像はまだありません</div>
                <div class="empty-state-desc">
                    上のエリアに <span class="kbd">Ctrl</span><span class="kbd">V</span> で貼り付けるか、ファイルをドロップしてください
                </div>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="image-gallery">
            ${asset.images.map((img, index) => {
                const isSelected = !!img.selected;
                return `
                <div class="image-tile ${isSelected ? 'is-thumb' : ''}">
                    ${isSelected ? '<span class="image-tile-badge"><i class="fa-solid fa-star"></i> 代表</span>' : ''}
                    <div class="image-tile-figure" onclick="openLightbox(${index})" title="クリックで拡大">
                        <img src="${escapeHTML(getImageSrc(img))}" alt="${escapeHTML(img.comment || '登録画像')}" loading="lazy"
                             onerror="this.closest('.image-tile-figure').innerHTML='<i class=\\'fa-regular fa-image\\' style=\\'font-size:1.6rem; color:var(--slate-300);\\'></i>';">
                    </div>
                    <div class="image-tile-caption" title="${escapeHTML(img.comment || '')}">${escapeHTML(img.comment || '説明なし')}</div>
                    <div class="image-tile-actions">
                        ${isSelected
                            ? '<span style="font-size:var(--text-xs); color:var(--primary); font-weight:600; padding-left:4px;">一覧のサムネイル</span>'
                            : `<button class="btn btn-ghost btn-sm" onclick="selectImageAsThumbnail(${index})" title="一覧のサムネイルに設定">
                                   <i class="fa-regular fa-star"></i> 代表にする
                               </button>`}
                        <span class="spacer"></span>
                        <button class="btn btn-ghost btn-sm btn-icon-only" onclick="editImageComment(${index})" title="説明を編集" aria-label="説明を編集">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-danger-ghost btn-sm btn-icon-only" onclick="deleteImage(${index})" title="削除" aria-label="削除">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
}

function selectImageAsThumbnail(index) {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.images || !asset.images[index]) return;

    asset.images.forEach(img => img.selected = false);
    asset.images[index].selected = true;

    afterImagesChanged();
    showToast('一覧に表示するサムネイルを変更しました', 'success');
}

function editImageComment(index) {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.images || !asset.images[index]) return;

    const newComment = prompt('画像の説明を入力:', asset.images[index].comment || '');
    if(newComment !== null) {
        asset.images[index].comment = newComment.trim();
        renderImagesGallery();
        autoSaveData();
    }
}

function deleteImage(index) {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.images || !asset.images[index]) return;

    // 取り消せるようにしておけば、削除前の確認ダイアログは不要になる
    const removed = asset.images.splice(index, 1)[0];
    if(removed.selected && asset.images.length > 0) asset.images[0].selected = true;

    afterImagesChanged();
    showToast('画像を削除しました', 'info', {
        label: '元に戻す',
        onClick: () => {
            asset.images.splice(index, 0, removed);
            if(removed.selected) asset.images.forEach((img, i) => img.selected = (i === index));
            afterImagesChanged();
        }
    });
}

/* ============================================================
   拡大表示（ライトボックス）
   ============================================================ */

let lightboxIndex = 0;

function openLightbox(index) {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.images || asset.images.length === 0) return;

    lightboxIndex = index;
    updateLightbox();
    document.getElementById('lightbox').classList.add('open');
}

function updateLightbox() {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.images[lightboxIndex]) return;

    const img = asset.images[lightboxIndex];
    document.getElementById('lightboxImg').src = getImageSrc(img);
    document.getElementById('lightboxCaption').textContent =
        `${lightboxIndex + 1} / ${asset.images.length}　${img.comment || ''}`;
}

function stepLightbox(delta) {
    const asset = assets.find(a => a.id === editingAssetId);
    if(!asset || !asset.images || asset.images.length === 0) return;

    lightboxIndex = (lightboxIndex + delta + asset.images.length) % asset.images.length;
    updateLightbox();
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
}

function isLightboxOpen() {
    const el = document.getElementById('lightbox');
    return !!el && el.classList.contains('open');
}
