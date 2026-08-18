
/**
 * zip.js
 * ZIPアーカイブの読み書き（外部ライブラリ不要の最小実装）
 *
 * 設計:
 *   バックアップに画像の実体を含めるため、JSONと画像ファイルを1つのZIPにまとめる。
 *   ライブラリを追加せずに済むよう、ZIPの仕様のうち必要な部分だけを自前で実装している。
 *
 *   - 圧縮は標準の CompressionStream('deflate-raw') を使う（追加の実装が不要）
 *   - 画像は既に圧縮済みなので無圧縮（store）で格納し、書き出しを速くする
 *   - ファイル名はUTF-8（汎用フラグのbit 11を立てる）
 *
 *   対応するのは 4GB 未満・ZIP64なし・暗号化なしの通常のZIP。
 *   このアプリが書き出したZIPと、一般的な解凍ソフトが作るZIPの読み書きができる。
 */

/* ============================================================
   CRC-32（ZIPのチェックサム）
   ============================================================ */
const ZIP_CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for(let i = 0; i < 256; i++) {
        let c = i;
        for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c >>> 0;
    }
    return table;
})();

function zipCrc32(bytes) {
    let crc = 0xFFFFFFFF;
    for(let i = 0; i < bytes.length; i++) {
        crc = ZIP_CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

/* ============================================================
   圧縮・展開（ブラウザ標準のストリームAPIを利用）
   ============================================================ */

async function zipDeflate(bytes) {
    if(typeof CompressionStream === 'undefined') return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function zipInflate(bytes) {
    if(typeof DecompressionStream === 'undefined') {
        throw new Error('このブラウザは圧縮されたZIPの展開に対応していません');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** ZIPが使うMS-DOS形式の日時に変換する */
function zipDosDateTime(date = new Date()) {
    const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f);
    const day  = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
    return { time, day };
}

/** 入力（文字列 / Blob / Uint8Array）をバイト列に揃える */
async function zipToBytes(data) {
    if(data instanceof Uint8Array) return data;
    if(typeof data === 'string') return new TextEncoder().encode(data);
    if(data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
    if(data instanceof ArrayBuffer) return new Uint8Array(data);
    throw new Error('ZIPに追加できない形式のデータです');
}

/* ============================================================
   書き出し
   ============================================================ */

/**
 * ZIPアーカイブを組み立てる
 * @param {Array<{name:string, data:string|Blob|Uint8Array, compress?:boolean}>} files
 *        compress を false にすると無圧縮で格納する（圧縮済みの画像など）
 * @returns {Promise<Blob>}
 */
async function createZip(files) {
    const encoder = new TextEncoder();
    const { time, day } = zipDosDateTime();
    const bodyParts = [];   // ローカルヘッダ + データ
    const directory = [];   // セントラルディレクトリ用の情報
    let offset = 0;

    for(const file of files) {
        const nameBytes = encoder.encode(file.name);
        const source = await zipToBytes(file.data);
        const crc = zipCrc32(source);

        // 小さいデータや圧縮済みのデータは、そのまま格納したほうが速く小さい
        let method = 0;
        let stored = source;
        if(file.compress !== false && source.length > 256) {
            const deflated = await zipDeflate(source);
            if(deflated && deflated.length < source.length) {
                method = 8;
                stored = deflated;
            }
        }

        const header = new Uint8Array(30 + nameBytes.length);
        const view = new DataView(header.buffer);
        view.setUint32(0, 0x04034b50, true); // ローカルファイルヘッダ
        view.setUint16(4, 20, true);         // 展開に必要なバージョン
        view.setUint16(6, 0x0800, true);     // 汎用フラグ: ファイル名はUTF-8
        view.setUint16(8, method, true);
        view.setUint16(10, time, true);
        view.setUint16(12, day, true);
        view.setUint32(14, crc, true);
        view.setUint32(18, stored.length, true);
        view.setUint32(22, source.length, true);
        view.setUint16(26, nameBytes.length, true);
        view.setUint16(28, 0, true);         // 拡張フィールドなし
        header.set(nameBytes, 30);

        bodyParts.push(header, stored);
        directory.push({ nameBytes, method, crc, compressedSize: stored.length, size: source.length, offset });
        offset += header.length + stored.length;
    }

    const directoryParts = [];
    let directorySize = 0;

    for(const entry of directory) {
        const record = new Uint8Array(46 + entry.nameBytes.length);
        const view = new DataView(record.buffer);
        view.setUint32(0, 0x02014b50, true); // セントラルディレクトリヘッダ
        view.setUint16(4, 20, true);         // 作成バージョン
        view.setUint16(6, 20, true);         // 展開に必要なバージョン
        view.setUint16(8, 0x0800, true);
        view.setUint16(10, entry.method, true);
        view.setUint16(12, time, true);
        view.setUint16(14, day, true);
        view.setUint32(16, entry.crc, true);
        view.setUint32(20, entry.compressedSize, true);
        view.setUint32(24, entry.size, true);
        view.setUint16(28, entry.nameBytes.length, true);
        view.setUint32(42, entry.offset, true); // ローカルヘッダの位置
        record.set(entry.nameBytes, 46);

        directoryParts.push(record);
        directorySize += record.length;
    }

    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true); // 終端レコード
    endView.setUint16(8, directory.length, true);
    endView.setUint16(10, directory.length, true);
    endView.setUint32(12, directorySize, true);
    endView.setUint32(16, offset, true);

    return new Blob([...bodyParts, ...directoryParts, end], { type: 'application/zip' });
}

/* ============================================================
   読み込み
   ============================================================ */

/**
 * ZIPアーカイブを読み、エントリの一覧を返す
 * 中身は必要になったときだけ展開する（bytes/text/blob を呼んだ時点で展開）。
 * @param {Blob|File} archive
 * @returns {Promise<Array<{name:string, size:number, bytes:Function, text:Function, blob:Function}>>}
 */
async function readZip(archive) {
    const buffer = new Uint8Array(await archive.arrayBuffer());
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    // 終端レコードは末尾にあるが、コメントが付いていることがあるので後ろから探す
    let endOffset = -1;
    const searchLimit = Math.max(0, buffer.length - 22 - 0xFFFF);
    for(let i = buffer.length - 22; i >= searchLimit; i--) {
        if(view.getUint32(i, true) === 0x06054b50) { endOffset = i; break; }
    }
    if(endOffset < 0) throw new Error('ZIPファイルとして読み取れませんでした');

    const count = view.getUint16(endOffset + 10, true);
    let pointer = view.getUint32(endOffset + 16, true);

    const decoder = new TextDecoder();
    const entries = [];

    for(let i = 0; i < count; i++) {
        if(pointer + 46 > buffer.length || view.getUint32(pointer, true) !== 0x02014b50) break;

        const method         = view.getUint16(pointer + 10, true);
        const compressedSize = view.getUint32(pointer + 20, true);
        const size           = view.getUint32(pointer + 24, true);
        const nameLength     = view.getUint16(pointer + 28, true);
        const extraLength    = view.getUint16(pointer + 30, true);
        const commentLength  = view.getUint16(pointer + 32, true);
        const localOffset    = view.getUint32(pointer + 42, true);
        const name = decoder.decode(buffer.subarray(pointer + 46, pointer + 46 + nameLength));

        // 実データの位置はローカルヘッダを見ないと分からない（拡張フィールド長が異なるため）
        const localNameLength  = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const raw = buffer.subarray(dataStart, dataStart + compressedSize);

        entries.push({
            name,
            size,
            isDirectory: name.endsWith('/'),
            async bytes() {
                if(method === 0) return raw;
                if(method === 8) return await zipInflate(raw);
                throw new Error(`未対応の圧縮方式です（method ${method}）: ${name}`);
            },
            async text() { return new TextDecoder().decode(await this.bytes()); },
            async blob(type) { return new Blob([await this.bytes()], { type: type || '' }); }
        });

        pointer += 46 + nameLength + extraLength + commentLength;
    }

    return entries;
}

/**
 * 先頭のシグネチャでZIPかどうかを判定する
 * 拡張子だけで判断すると、名前を変えられたファイルを取りこぼす。
 */
async function looksLikeZip(file) {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    return head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05);
}
