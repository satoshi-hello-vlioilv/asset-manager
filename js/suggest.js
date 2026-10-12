
/**
 * suggest.js
 * 使用頻度の学習と入力サジェスト
 *
 * 設計:
 *   資産管理の入力は「同じ値を何度も選ぶ」作業が大半を占める。
 *   そこで、実際に選ばれた回数と最後に使った時刻を記録し、
 *   次に同じ選択をするときは候補の先頭に出す。
 *
 *   スコアは「回数」だけでなく「最近使ったか」も加味する（recency + frequency）。
 *   回数だけで並べると、一度大量に使った古い値が延々と上位に居座り、
 *   いま進めている作業の文脈に合わなくなるため。
 *
 *   学習結果はあくまで並び順にしか影響させない。
 *   候補そのものを隠すと「あるはずのものが無い」状態になり、かえって探させてしまう。
 */

/* 使用統計（IndexedDB の system テーブルに保存） */
let usageStats = {
    tags:     {},  // tagId  -> { n: 回数, t: 最終使用時刻 }
    commands: {},  // 操作ID -> { n, t }
    assets:   {},  // 資産ID -> { n, t }
    events:   {}   // 履歴・計画のイベント文言 -> { n, t }
};

/* 直近に作成した資産のID（「前回と同じタグ」の提案に使う） */
let lastCreatedAssetId = null;

/** 半減期（日）。これを過ぎた使用実績は重みが半分になる */
const USAGE_HALF_LIFE_DAYS = 30;

/**
 * 使用を記録する
 * @param {'tags'|'commands'|'assets'|'events'} kind
 * @param {string|number} key
 */
function recordUsage(kind, key) {
    if(key === undefined || key === null || key === '') return;
    const bucket = usageStats[kind];
    if(!bucket) return;

    const k = String(key);
    const entry = bucket[k] || { n: 0, t: 0 };
    entry.n += 1;
    entry.t = Date.now();
    bucket[k] = entry;

    scheduleUsageSave();
}

/* 使用統計の保存はまとめて行う（1操作ごとに書き込むと無駄が多い） */
let usageSaveTimer = null;
function scheduleUsageSave() {
    if(usageSaveTimer) clearTimeout(usageSaveTimer);
    usageSaveTimer = setTimeout(async () => {
        usageSaveTimer = null;
        try {
            await db.system.put({ key: 'usageStats', value: usageStats });
        } catch(e) {
            console.warn('使用統計の保存に失敗:', e);
        }
    }, 1500);
}

/**
 * 使用スコアを求める（回数 × 経過時間による減衰）
 * @returns {number} 0以上。未使用なら0
 */
function usageScore(kind, key) {
    const entry = usageStats[kind] && usageStats[kind][String(key)];
    if(!entry) return 0;

    const days = (Date.now() - (entry.t || 0)) / 86400000;
    const decay = Math.pow(0.5, days / USAGE_HALF_LIFE_DAYS);
    return entry.n * decay;
}

/**
 * タグ候補を「使いそうな順」に並べ替える
 * 同点の場合は、資産への付与件数が多いものを優先する。
 * @param {Array} tagList
 * @returns {Array} 新しい配列
 */
function sortTagsBySuggestion(tagList) {
    const attachCount = getTagAttachCounts();
    return [...tagList].sort((a, b) => {
        const sa = usageScore('tags', a.id);
        const sb = usageScore('tags', b.id);
        if(sb !== sa) return sb - sa;

        const ca = attachCount.get(a.id) || 0;
        const cb = attachCount.get(b.id) || 0;
        if(cb !== ca) return cb - ca;

        return a.name.localeCompare(b.name, 'ja');
    });
}

/* タグごとの付与件数（描画のたびに数え直さないよう短時間キャッシュする） */
let _attachCountCache = null;
let _attachCountAt = 0;
function getTagAttachCounts() {
    if(_attachCountCache && Date.now() - _attachCountAt < 1500) return _attachCountCache;

    const map = new Map();
    getPersistedAssets().forEach(a => {
        (a.tags || []).forEach(id => map.set(id, (map.get(id) || 0) + 1));
    });
    _attachCountCache = map;
    _attachCountAt = Date.now();
    return map;
}
function invalidateSuggestionCaches() { _attachCountCache = null; }

/**
 * そのマスタで「よく使うタグ」を返す（すでに選択済みのものは除く）
 * @param {string} masterId
 * @param {number[]} excludeIds
 * @param {number} limit
 */
function getFrequentTags(masterId, excludeIds = [], limit = 4) {
    const candidates = tags.filter(t => t.masterId === masterId && !excludeIds.includes(t.id));
    const attachCount = getTagAttachCounts();

    // 実績がまったく無い場合は候補を出さない（無意味な提案はノイズになる）
    const scored = candidates
        .map(t => ({ tag: t, score: usageScore('tags', t.id) * 2 + (attachCount.get(t.id) || 0) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(x => x.tag);
}

/**
 * 最近開いた資産（新しい順）
 */
function getRecentlyOpenedAssets(limit = 5) {
    const opened = Object.entries(usageStats.assets)
        .sort((a, b) => (b[1].t || 0) - (a[1].t || 0))
        .map(([id]) => id);

    const result = [];
    for(const id of opened) {
        const asset = assets.find(a => a.id === id && !isDraftAsset(a));
        if(asset) result.push(asset);
        if(result.length >= limit) break;
    }
    return result;
}

/**
 * よく使うイベント文言（履歴・周期計画の入力補助）
 * 記録済みの統計と、実データに登場する文言の両方から集める。
 */
function getFrequentEventTexts(limit = 6) {
    const score = new Map();

    // 実データからの出現回数
    getPersistedAssets().forEach(a => {
        [...(a.maintenance || []), ...(a.scheduledPlans || [])].forEach(r => {
            const text = (r.event || '').trim();
            if(!text || text.length > 40) return;
            score.set(text, (score.get(text) || 0) + 1);
        });
    });

    // 自分が入力した実績は重めに扱う
    Object.keys(usageStats.events).forEach(text => {
        score.set(text, (score.get(text) || 0) + usageScore('events', text) * 2);
    });

    return [...score.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([text]) => text);
}

/**
 * 新規資産に最初から入れておくとよいタグを推定する
 *
 * 1. 絞り込み中のタグ（その分類を見ながら追加したはず）
 * 2. 直前に作成した資産と同じタグ構成
 * のうち 1 だけを自動適用し、2 はボタンとして提示する（勝手に入れすぎない）。
 *
 * @returns {{autoTags: number[], reason: string|null}}
 */
function getInitialTagsForNewAsset() {
    const ids = getFilterTagIds();
    if(ids.length > 0) {
        const names = ids.map(id => tags.find(t => t.id === id).name);
        return { autoTags: ids, reason: `絞り込み中の「${names.join('」「')}」を設定しました` };
    }
    return { autoTags: [], reason: null };
}

/**
 * 「前回と同じタグ」の候補（直近に作成した資産のタグ構成）
 * @returns {{asset: object, tagIds: number[]}|null}
 */
function getLastCreatedTagSet() {
    if(!lastCreatedAssetId) return null;
    const asset = assets.find(a => a.id === lastCreatedAssetId);
    if(!asset || !asset.tags || asset.tags.length === 0) return null;
    return { asset, tagIds: [...asset.tags] };
}

/**
 * 同じ名前の資産が既にあるか調べる（入力ミス・重複登録の予防）
 * @returns {object|null}
 */
function findDuplicateAssetName(name, excludeId) {
    const needle = (name || '').trim().toLowerCase();
    if(!needle) return null;
    return getPersistedAssets().find(a => a.id !== excludeId && a.name.trim().toLowerCase() === needle) || null;
}

/**
 * 資産名から連番の次の候補を作る（例: "AGV-01" → "AGV-02"）
 * 末尾の数字を桁数を保ったまま +1 する。数字が無ければ null。
 */
function buildNextSerialName(name) {
    const m = (name || '').match(/^(.*?)(\d+)(\D*)$/);
    if(!m) return null;
    const [, head, digits, tail] = m;
    const next = String(Number(digits) + 1).padStart(digits.length, '0');
    return `${head}${next}${tail}`;
}
