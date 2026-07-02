
/**
 * graph.js
 * グラフビュー操作
 */

function renderGraphView() {
    const container = document.getElementById('graphNodesContainer');
    const svg = document.getElementById('graphSvg');
    container.innerHTML = '';
    svg.innerHTML = '';

    const currentTags = tags.filter(t => t.masterId === currentMasterId);
    
    // イベントリスナーを親コンテナ(graphView)に設定
    const graphView = document.getElementById('graphView');
    
    // Reset previous listeners to avoid duplicates
    graphView.onmousedown = null;
    graphView.ondblclick = null;

    // Background mousedown for panning and deselection
    graphView.onmousedown = (e) => {
        // 背景要素をクリックした場合
        if(e.target.id === 'graphView' || e.target.id === 'graphCanvas' || e.target.classList.contains('graph-bg')) {
            // 編集中のinputがあればblurして編集を確定
            const editingInput = document.querySelector('.tag-name-input');
            if(editingInput) {
                editingInput.blur();
                // inputのblur処理が完了するまで少し待つ
                setTimeout(() => {
                    // 選択解除
                    selectedElement = null;
                    drawLinks(); // redraw links (remove selection)
                    document.querySelectorAll('.node.selected').forEach(n => n.classList.remove('selected'));
                    
                    // パン操作を開始
                    handleGraphPanStart(e);
                }, 100);
                return;
            }
            
            // 選択解除
            selectedElement = null;
            drawLinks(); // redraw links (remove selection)
            document.querySelectorAll('.node.selected').forEach(n => n.classList.remove('selected'));
            
            // パン操作を開始
            handleGraphPanStart(e);
        }
    };
    
    // Background Double Click to add node at clicked position
    graphView.ondblclick = (e) => {
        // 背景要素をクリックした場合のみノード追加
        if(e.target.id === 'graphView' || e.target.id === 'graphCanvas' || e.target.classList.contains('graph-bg')) {
            let x, y;

            // ユーザー提示のoffsetXロジックを採用しつつ、ターゲットに応じた補正を行う
            if (e.target.id === 'graphCanvas' || e.target.classList.contains('graph-bg')) {
                // graphCanvas上の座標の場合
                // 提示されたロジック: (offsetX - panX) / scale
                x = (e.offsetX - graphState.panX) / graphState.scale;
                y = (e.offsetY - graphState.panY) / graphState.scale;
            } else {
                // graphView(親)上の座標の場合 (graphCanvasの余白などをクリックした場合)
                // graphView上のoffsetXからPanを引き、Scaleで割ることで論理座標へ
                x = (e.offsetX - graphState.panX) / graphState.scale;
                y = (e.offsetY - graphState.panY) / graphState.scale;
            }
            
            // 即座にノード追加
            addNodeToGraphAtPosition(x, y);
        }
    };

    let levelCounts = {};
    currentTags.forEach(t => {
        if(!t.x) {
            let depth = 0;
            let curr = t;
            while(curr.parentIds.length > 0) {
                depth++;
                const p = tags.find(x => x.id === curr.parentIds[0]);
                if(!p || p === curr) break;
                curr = p;
            }
            levelCounts[depth] = (levelCounts[depth] || 0) + 1;
            t.x = 100 + (depth * 280);
            t.y = 80 + (levelCounts[depth] * 100);
        }
        
        const node = document.createElement('div');
        node.className = 'node';
        if(selectedElement && selectedElement.type === 'node' && selectedElement.id === t.id) {
            node.classList.add('selected');
        }
        node.id = `node-${t.id}`;
        node.style.left = t.x + 'px';
        node.style.top = t.y + 'px';
        
        node.innerHTML = `
            ${t.name}
            <div class="port input" data-tooltip="接続 (In)" onmousedown="startLink(event, ${t.id}, 'in')"></div>
            <div class="port output" data-tooltip="接続 (Out)" onmousedown="startLink(event, ${t.id}, 'out')"></div>
        `;
        
        // イベントを設定
        setupNodeEvents(t.id, node);
        
        container.appendChild(node);
    });
    drawLinks();
    updateGraphTransform();
}

function selectElement(type, id, parentId = null) {
    selectedElement = { type, id, parentId, childId: type === 'link' ? id : null };
    
    // Update UI
    document.querySelectorAll('.node').forEach(n => n.classList.remove('selected'));
    document.querySelectorAll('.link').forEach(l => l.classList.remove('selected'));

    if(type === 'node') {
        const el = document.getElementById(`node-${id}`);
        if(el) el.classList.add('selected');
    }
    drawLinks(); // Re-render links to show selection
}

function handleGraphPanStart(e) {
    if(e.target.closest('.node') || e.target.closest('.zoom-controls') || e.target.closest('.link')) return;
    graphState.isPanning = true;
    graphState.startX = e.clientX;
    graphState.startY = e.clientY;
    
    const wrapper = document.getElementById('graphView');
    wrapper.style.cursor = 'grabbing';

    const move = (ev) => {
        if(!graphState.isPanning) return;
        const dx = ev.clientX - graphState.startX;
        const dy = ev.clientY - graphState.startY;
        graphState.panX += dx;
        graphState.panY += dy;
        graphState.startX = ev.clientX;
        graphState.startY = ev.clientY;
        updateGraphTransform();
    };

    const stop = () => {
        graphState.isPanning = false;
        wrapper.style.cursor = 'grab';
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', stop);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
}

function updateZoom(delta) {
    const newScale = Math.max(0.2, Math.min(3, graphState.scale + delta));
    graphState.scale = newScale;
    updateGraphTransform();
}

function updateGraphTransform() {
    const canvas = document.getElementById('graphCanvas');
    canvas.style.transform = `translate(${graphState.panX}px, ${graphState.panY}px) scale(${graphState.scale})`;
}

function autoFitGraph() {
    const currentTags = tags.filter(t => t.masterId === currentMasterId);
    if(currentTags.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    currentTags.forEach(t => {
        if(t.x < minX) minX = t.x;
        if(t.x > maxX) maxX = t.x;
        if(t.y < minY) minY = t.y;
        if(t.y > maxY) maxY = t.y;
    });
    
    maxX += 150; maxY += 50;

    const wrapper = document.getElementById('graphView');
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;
    const padding = 50;

    const contentW = maxX - minX;
    const contentH = maxY - minY;

    const scaleX = (w - padding * 2) / contentW;
    const scaleY = (h - padding * 2) / contentH;
    let scale = Math.min(scaleX, scaleY);
    scale = Math.min(scale, 1); 

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    graphState.scale = scale;
    graphState.panX = (w / 2) - (centerX * scale);
    graphState.panY = (h / 2) - (centerY * scale);
    
    updateGraphTransform();
}


function startLink(e, id, portType) {
    e.stopPropagation();
    const wrapper = document.getElementById('graphView');
    const svg = document.getElementById('graphSvg');
    const startNode = tags.find(t => t.id === id);

    if(portType === 'out') {
        wrapper.classList.add('connecting-from-out');
        document.querySelector(`#node-${id} .port.output`).classList.add('active-source');
    } else {
        wrapper.classList.add('connecting-from-in');
        document.querySelector(`#node-${id} .port.input`).classList.add('active-source');
    }

    const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    tempPath.setAttribute("class", "drag-line");
    svg.appendChild(tempPath);

    const nodeEl = document.getElementById(`node-${id}`);
    const nodeW = nodeEl.offsetWidth;
    const sX = portType === 'out' ? startNode.x + nodeW : startNode.x;
    const sY = startNode.y + 22; 

    const move = (ev) => {
        // ドラッグ中の線描画用座標計算 (親コンテナ基準)
        const wrapper = document.getElementById('graphView');
        const rect = wrapper.getBoundingClientRect();
        
        const mX = (ev.clientX - rect.left - graphState.panX) / graphState.scale;
        const mY = (ev.clientY - rect.top - graphState.panY) / graphState.scale;
        
        let p1x, p1y, p2x, p2y;
        if (portType === 'out') {
            p1x = sX; p1y = sY; p2x = mX; p2y = mY;
        } else {
            p1x = mX; p1y = mY; p2x = sX; p2y = sY;
        }

        const dist = Math.abs(p2x - p1x) / 2;
        const cp1x = p1x + dist; const cp1y = p1y;
        const cp2x = p2x - dist; const cp2y = p2y;
        
        tempPath.setAttribute("d", `M ${p1x} ${p1y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2x} ${p2y}`);
    };

    const up = (ev) => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        tempPath.remove();
        
        wrapper.classList.remove('connecting-from-out');
        wrapper.classList.remove('connecting-from-in');
        document.querySelectorAll('.active-source').forEach(el => el.classList.remove('active-source'));

        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        if(el && el.classList.contains('port')) {
            const targetNodeEl = el.closest('.node');
            const targetId = parseInt(targetNodeEl.id.split('-')[1]);
            if(targetId === id) return; 

            if(portType === 'out' && el.classList.contains('input')) {
                linkParent(targetId, id);
            }
            else if(portType === 'in' && el.classList.contains('output')) {
                linkParent(id, targetId);
            }
        }
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
}

function drawLinks() {
    const svg = document.getElementById('graphSvg');
    const existingDrag = svg.querySelector('.drag-line');
    svg.innerHTML = '';
    if(existingDrag) svg.appendChild(existingDrag);

    const currentTags = tags.filter(t => t.masterId === currentMasterId);
    
    currentTags.forEach(child => {
        child.parentIds.forEach(pid => {
            const parent = currentTags.find(x => x.id === pid);
            if(!parent) return;
            
            const pNode = document.getElementById(`node-${pid}`);
            const cNode = document.getElementById(`node-${child.id}`);
            if(!pNode || !cNode) return;

            const sx = parent.x + pNode.offsetWidth; 
            const sy = parent.y + 22;  
            const ex = child.x;        
            const ey = child.y + 22;

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("class", "link");
            
            // Check if selected
            if(selectedElement && selectedElement.type === 'link' && selectedElement.childId === child.id && selectedElement.parentId === pid) {
                path.classList.add('selected');
            }

            const dist = Math.abs(ex - sx) / 2;
            path.setAttribute("d", `M ${sx} ${sy} C ${sx + dist} ${sy}, ${ex - dist} ${ey}, ${ex} ${ey}`);
            
            // Select Link Logic
            path.onclick = (e) => {
                e.stopPropagation();
                selectElement('link', child.id, pid);
            };
            svg.appendChild(path);
        });
    });
}

/**
 * ノードの階層深度を計算（ルートからの最大距離）
 */
function getNodeDepth(nodeId) {
    const node = tags.find(t => t.id === nodeId);
    if(!node) return 0;
    
    // 親がいない場合は深度0（ルート）
    if(!node.parentIds || node.parentIds.length === 0) return 0;
    
    // 全ての親の深度を計算し、最大値+1を返す
    const parentDepths = node.parentIds.map(pid => getNodeDepth(pid));
    return Math.max(...parentDepths) + 1;
}

/**
 * 親子リンクを作成する関数（階層構造維持の厳密版）
 */
function linkParent(childId, parentId) {
    const child = tags.find(t => t.id === childId);
    const parent = tags.find(t => t.id === parentId);
    
    if(!child || !parent) return;
    
    // 自分自身への接続チェック
    if(childId === parentId) {
        showToast('⚠️ 自分自身には接続できません', 'warning');
        return;
    }
    
    // 既にリンクが存在する場合はスキップ
    if(child.parentIds.includes(parentId)) {
        showToast('ℹ️ この接続は既に存在します', 'info');
        return;
    }
    
    // 循環参照チェック: parentがchildの子孫である場合
    if(isAncestor(childId, parentId)) {
        showToast(
            `❌ 接続失敗\n` +
            `「${parent.name}」は「${child.name}」の子孫です。\n` +
            `循環参照は作成できません。`, 
            'error'
        );
        return;
    }
    
    // 新しい親の階層深度を取得
    const newParentDepth = getNodeDepth(parentId);
    
    // 既存の親がある場合、階層レベルをチェック
    if(child.parentIds.length > 0) {
        // 既存の親の階層深度を取得
        const existingParentDepths = child.parentIds.map(pid => getNodeDepth(pid));
        const existingDepth = existingParentDepths[0]; // 既存の親は全て同じ深度のはず
        
        // 新しい親が既存の親と異なる階層レベルの場合
        if(newParentDepth !== existingDepth) {
            // 既存の親の名前を取得
            const existingParentNames = child.parentIds.map(pid => {
                const tag = tags.find(t => t.id === pid);
                return tag ? tag.name : 'Unknown';
            }).join('、');
            
            // 既存の親を全て削除
            const removedParents = child.parentIds.slice();
            child.parentIds = [];
            
            showToast(
                `⚙️ 階層構造を調整しました\n` +
                `「${child.name}」の接続先を変更:\n` +
                `削除: 「${existingParentNames}」（階層${existingDepth}）\n` +
                `追加: 「${parent.name}」（階層${newParentDepth}）\n\n` +
                `💡 Tips: 同じノードは同一階層の親のみ持てます`,
                'warning'
            );
        } else {
            // 同じ階層レベルの場合、中間階層チェックを実行
            // parentIdがchildの既存の親の祖先である場合、その中間親を削除
            const intermediateParents = child.parentIds.filter(pid => {
                return isAncestor(parentId, pid);
            });
            
            if(intermediateParents.length > 0) {
                const intermediateNames = intermediateParents.map(pid => {
                    const tag = tags.find(t => t.id === pid);
                    return tag ? tag.name : 'Unknown';
                }).join('、');
                
                // 中間階層の接続を削除
                intermediateParents.forEach(intParentId => {
                    child.parentIds = child.parentIds.filter(p => p !== intParentId);
                });
                
                showToast(
                    `⚙️ 階層構造を調整しました\n` +
                    `「${child.name}」→「${parent.name}」の接続を作成\n` +
                    `中間階層「${intermediateNames}」との接続を削除\n\n` +
                    `💡 Tips: 階層を飛ばす接続は自動的に最適化されます`,
                    'warning'
                );
            } else {
                // 通常の追加（同一階層への追加）
                showToast(
                    `✓ 接続を追加しました\n` +
                    `「${child.name}」→「${parent.name}」`,
                    'success'
                );
            }
        }
    } else {
        // 既存の親がない場合（新規接続）
        showToast(
            `✓ 接続を作成しました\n` +
            `「${child.name}」を「${parent.name}」の子として設定`,
            'success'
        );
    }
    
    // 新しいリンクを追加
    child.parentIds.push(parentId);
    loadEditor(); // リストビュー・グラフビュー両方に対応
    renderSidebar(); // サイドバーをリアルタイム更新
    autoSaveData(); // 自動保存
}

function isAncestor(ancestorId, descendantId) {
    const descendant = tags.find(t => t.id === descendantId);
    if(!descendant) return false;
    
    // 直接の親である場合
    if(descendant.parentIds.includes(ancestorId)) return true;
    
    // 再帰的に祖先をチェック
    for(let parentId of descendant.parentIds) {
        if(isAncestor(ancestorId, parentId)) return true;
    }
    
    return false;
}

function removeLink(childId, parentId) {
    const child = tags.find(t => t.id === childId);
    const parent = tags.find(t => t.id === parentId);
    
    if(!child || !parent) return;
    
    // 確認ダイアログを削除（即時実行）
    child.parentIds = child.parentIds.filter(pid => pid !== parentId);
    loadEditor(); 
    renderSidebar(); 
    showToast(`✓ 「${child.name}」と「${parent.name}」の接続を削除しました`, 'success');
    autoSaveData(); 
}

function makeRoot(id) {
    const t = tags.find(x => x.id === id);
    if(!t) return;
    
    const wasChild = t.parentIds.length > 0;
    const parentNames = t.parentIds.map(pid => {
        const parent = tags.find(tag => tag.id === pid);
        return parent ? parent.name : 'Unknown';
    }).join('、');
    
    t.parentIds = [];
    
    if(wasChild) {
        showToast(`✓ 「${t.name}」をルート階層へ移動しました\n（「${parentNames}」との接続を解除）`, 'success');
    } else {
        showToast(`ℹ️ 「${t.name}」は既にルート階層です`, 'info');
    }
    
    loadEditor();
    renderSidebar(); // サイドバーをリアルタイム更新
    autoSaveData(); // 自動保存
}

function addNewChild(parentId) {
    const parent = tags.find(t => t.id === parentId);
    if(!parent) return;
    
    const name = prompt(`「${parent.name}」の子要素として追加するタグ名を入力:`);
    if(name && name.trim()) {
        const newTag = { 
            id: Date.now(), 
            masterId: currentMasterId, 
            name: name.trim(), 
            parentIds: [parentId] 
        };
        tags.push(newTag);
        
        // うまくいっているパターンの順序を採用
        // 先に変数をセットしてからloadEditorを呼ぶ
        selectedElement = { type: 'node', id: newTag.id };
        
        loadEditor();
        renderSidebar(); 
        showToast(`✓ 「${name.trim()}」を「${parent.name}」の子として追加しました`, 'success');
        autoSaveData(); 
    }
}

function deleteTag(id) {
    const tag = tags.find(t => t.id === id);
    if(!tag) return;
    
    // 確認ダイアログを削除（即時実行）
    const usedInAssets = assets.filter(a => a.tags && a.tags.includes(id)).length;
    
    tags = tags.filter(t => t.id !== id);
    tags.forEach(t => t.parentIds = t.parentIds.filter(pid => pid !== id));
    loadEditor();
    renderSidebar(); 
    
    let message = `✓ 「${tag.name}」を削除しました`;
    if(usedInAssets > 0) {
        message += `\n⚠️ ${usedInAssets}個の資産でこのタグが使用されています`;
    }
    showToast(message, usedInAssets > 0 ? 'warning' : 'success');
    autoSaveData(); 
}


/**
 * デフォルトのノード名を生成
 */
function generateDefaultNodeName() {
    const currentTags = tags.filter(t => t.masterId === currentMasterId);
    let counter = 1;
    let name = `新規ノード${counter}`;
    
    // 重複しない名前を生成
    while(currentTags.some(t => t.name === name)) {
        counter++;
        name = `新規ノード${counter}`;
    }
    
    return name;
}

/**
 * 画面内の左上にノードを追加（ボタン用）
 */
function addNodeToGraph() {
    // 現在の可視領域の左上座標を計算
    const wrapper = document.getElementById('graphView');
    const rect = wrapper.getBoundingClientRect();
    
    // 可視領域の左上からマージンを取った位置
    const margin = 50;
    // panはオフセットなので、マイナスして打ち消し、scaleで割って論理座標へ
    const x = (-graphState.panX + margin) / graphState.scale;
    const y = (-graphState.panY + margin) / graphState.scale;
    
    // デフォルト名でノード追加
    const name = generateDefaultNodeName();
    
    const newNode = { 
        id: Date.now(), 
        masterId: currentMasterId, 
        name: name,
        parentIds: [], 
        x: x,
        y: y
    };
    
    tags.push(newNode);
    
    // うまくいっているパターンの順序を採用
    // 先に変数をセットしてからloadEditorを呼ぶ
    selectedElement = { type: 'node', id: newNode.id };
    
    loadEditor();
    renderSidebar();
    showToast(`✓ 「${name}」を追加しました。ダブルクリックで名前を編集できます。`, 'success');
    autoSaveData();
}

/**
 * 指定位置にノードを追加（ダブルクリック用）
 */
function addNodeToGraphAtPosition(x, y) {
    // デフォルト名でノード追加
    const name = generateDefaultNodeName();
    
    const newNode = { 
        id: Date.now(), 
        masterId: currentMasterId, 
        name: name,
        parentIds: [], 
        x: x,
        y: y
    };
    
    tags.push(newNode);
    
    // うまくいっているパターンの順序を採用
    // 先に変数をセットしてからloadEditorを呼ぶ
    selectedElement = { type: 'node', id: newNode.id };
    
    loadEditor();
    renderSidebar();
    showToast(`✓ 「${name}」を追加しました。ダブルクリックで名前を編集できます。`, 'success');
    autoSaveData();
}

/**
 * タグ名のインライン編集を開始（リストビュー用 - ユニークID対応）
 */
function startEditTagNameInList(tagId, uniqueElementId) {
    const tag = tags.find(t => t.id === tagId);
    if(!tag) return;
    
    const span = document.getElementById(uniqueElementId);
    if(!span) return;
    
    // 既に編集中の場合は何もしない
    if(span.querySelector('input')) return;
    
    const originalName = tag.name;
    
    // インプットフィールドを作成
    const input = document.createElement('input');
    input.type = 'text';
    input.value = tag.name;
    input.className = 'input';
    input.style.cssText = 'padding:4px 8px; font-size:0.9rem; font-weight:600; width:200px; margin:0;';
    
    // 編集完了時の処理
    const finishEdit = () => {
        const newName = input.value.trim();
        if(newName && newName !== originalName) {
            tag.name = newName;
            
            // 同じtagIdを持つ全てのspan要素を更新
            document.querySelectorAll(`[data-tag-id="${tagId}"]`).forEach(el => {
                if(!el.querySelector('input')) {
                    el.textContent = newName;
                }
            });
            
            renderSidebar(); // サイドバーをリアルタイム更新
            showToast(`✓ タグ名を「${originalName}」→「${newName}」に更新しました`, 'success');
            autoSaveData(); // 自動保存
        } else if(!newName) {
            showToast('❌ タグ名は空にできません', 'error');
        }
        loadEditor(); // エディタを再描画（全ての表示箇所を更新）
    };
    
    // Enterキーで確定
    input.onkeydown = (e) => {
        if(e.key === 'Enter') {
            e.preventDefault();
            finishEdit();
        } else if(e.key === 'Escape') {
            e.preventDefault();
            loadEditor(); // キャンセル
        }
    };
    
    // フォーカスアウトで確定
    input.onblur = finishEdit;
    
    // spanの内容をinputに置き換え
    span.innerHTML = '';
    span.appendChild(input);
    input.focus();
    input.select();
    
    // イベント伝播を停止
    span.onclick = (e) => e.stopPropagation();
}

/**
 * タグ名のインライン編集を開始（グラフビュー用 - 旧版互換）
 */
function startEditTagName(tagId) {
    // グラフビューでは使用されないが、互換性のため残す
    const uniqueId = `tag-name-${tagId}`;
    startEditTagNameInList(tagId, uniqueId);
}

/**
 * グラフビューでタグ名をダブルクリックして編集
 */
function editTagNameInGraph(tagId, nodeElement) {
    const tag = tags.find(t => t.id === tagId);
    if(!tag) return;
    
    // 既に編集中の場合は何もしない
    if(nodeElement.querySelector('input')) return;
    
    const originalName = tag.name;
    
    // 現在のテキストを保存
    const originalHtml = nodeElement.innerHTML;
    
    // インプットフィールドを作成
    const input = document.createElement('input');
    input.type = 'text';
    input.value = tag.name;
    input.className = 'tag-name-input'; // クラスを追加して識別しやすく
    input.style.cssText = `
        padding: 4px 8px;
        font-size: 0.9rem;
        font-weight: 600;
        width: 140px;
        margin: 0;
        border: 2px solid var(--primary);
        border-radius: 4px;
        background: #fff;
        color: var(--text);
        outline: none;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
    `;
    
    // 編集完了時の処理
    const finishEdit = (save = true) => {
        const newName = input.value.trim();
        
        if(save && newName && newName !== originalName) {
            tag.name = newName;
            
            // ノードのテキストだけを更新（再レンダリングせずに）
            nodeElement.innerHTML = `
                ${newName}
                <div class="port input" data-tooltip="接続 (In)" onmousedown="startLink(event, ${tagId}, 'in')"></div>
                <div class="port output" data-tooltip="接続 (Out)" onmousedown="startLink(event, ${tagId}, 'out')"></div>
            `;
            
            renderSidebar(); // サイドバーをリアルタイム更新
            showToast(`✓ タグ名を「${originalName}」→「${newName}」に更新しました`, 'success');
            autoSaveData(); // 自動保存
        } else if(save && !newName) {
            showToast('❌ タグ名は空にできません', 'error');
            nodeElement.innerHTML = originalHtml;
        } else {
            // キャンセル時は元に戻す
            nodeElement.innerHTML = originalHtml;
        }
        
        // イベントを再設定
        setupNodeEvents(tagId, nodeElement);
    };
    
    // イベントリスナー
    input.onkeydown = (e) => {
        if(e.key === 'Enter') {
            e.preventDefault();
            finishEdit(true);
        } else if(e.key === 'Escape') {
            e.preventDefault();
            finishEdit(false);
        }
        e.stopPropagation(); // キー入力がグラフの操作に影響しないように
    };
    
    input.onblur = () => {
        finishEdit(true);
    };
    
    // クリックイベントの伝播を停止（ノードの選択などを防ぐ）
    input.onclick = (e) => {
        e.stopPropagation();
    };
    
    // ダブルクリックイベントの伝播を停止
    input.ondblclick = (e) => {
        e.stopPropagation();
    };
    
    // マウスダウンイベントの伝播を停止（ドラッグを防ぐ）
    input.onmousedown = (e) => {
        e.stopPropagation();
    };
    
    // ノードの内容を入力フィールドに置き換え
    nodeElement.innerHTML = '';
    nodeElement.appendChild(input);
    
    // フォーカスして全選択
    input.focus();
    input.select();
}

/**
 * ノードにイベントを設定（編集後の再設定用）
 */
function setupNodeEvents(tagId, nodeElement) {
    const tag = tags.find(t => t.id === tagId);
    if(!tag) return;
    
    // Node Selection Click
    nodeElement.onclick = (e) => {
        e.stopPropagation();
        selectElement('node', tagId);
    };
    
    // Double Click to Edit Name
    nodeElement.ondblclick = (e) => {
        e.stopPropagation();
        editTagNameInGraph(tagId, nodeElement);
    };

    // Node Drag Logic
    let isDragging = false;
    nodeElement.onmousedown = (e) => {
        if(e.target.classList.contains('port')) return;
        if(e.target.tagName === 'INPUT') return; // 入力中はドラッグしない
        
        const wrapper = document.getElementById('graphView');
        const rect = wrapper.getBoundingClientRect();
        
        const startMouseX = e.clientX;
        const startMouseY = e.clientY;
        const startNodeX = tag.x;
        const startNodeY = tag.y;
        let hasMoved = false;

        const move = (ev) => {
            if(!hasMoved) {
                hasMoved = true;
                isDragging = true;
                nodeElement.classList.add('is-dragging');
            }
            // ドラッグ移動量もスケールで補正
            const dx = (ev.clientX - startMouseX) / graphState.scale;
            const dy = (ev.clientY - startMouseY) / graphState.scale;
            
            tag.x = startNodeX + dx;
            tag.y = startNodeY + dy;
            nodeElement.style.left = tag.x + 'px';
            nodeElement.style.top = tag.y + 'px';
            drawLinks();
        };
        
        const stop = (ev) => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', stop);
            if(isDragging) {
                nodeElement.classList.remove('is-dragging');
                isDragging = false;
                autoSaveData();
            }
        };
        
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', stop);
    };
}

/**
 * =============================================================================
 * 資産グラフビュー関数群
 * =============================================================================
 */

/**
 * 資産グラフビューを描画
 */
function renderAssetsGraphView() {
    const container = document.getElementById('assetsGraphNodesContainer');
    const svg = document.getElementById('assetsGraphSvg');
    container.innerHTML = '';
    svg.innerHTML = '';

    const graphView = document.getElementById('assetsGraphView');
    
    // Reset previous listeners
    graphView.onmousedown = null;
    graphView.ondblclick = null;

    // Background mousedown for panning and deselection
    graphView.onmousedown = (e) => {
        if(e.target.id === 'assetsGraphView' || e.target.id === 'assetsGraphCanvas' || e.target.classList.contains('graph-bg')) {
            // 編集中のinputがあればblurして編集を確定
            const editingInput = document.querySelector('.asset-name-input');
            if(editingInput) {
                editingInput.blur();
                // inputのblur処理が完了するまで少し待つ
                setTimeout(() => {
                    // 選択解除
                    selectedElement = null;
                    drawAssetsLinks();
                    document.querySelectorAll('.node.selected').forEach(n => n.classList.remove('selected'));
                    
                    // パン操作を開始
                    handleAssetGraphPanStart(e);
                }, 100);
                return;
            }
            
            // 選択解除
            selectedElement = null;
            drawAssetsLinks();
            document.querySelectorAll('.node.selected').forEach(n => n.classList.remove('selected'));
            
            // パン操作を開始
            handleAssetGraphPanStart(e);
        }
    };

    // Background Double Click to add asset node at clicked position
    graphView.ondblclick = (e) => {
        if(e.target.id === 'assetsGraphView' || e.target.id === 'assetsGraphCanvas' || e.target.classList.contains('graph-bg')) {
            let x, y;

            if (e.target.id === 'assetsGraphCanvas' || e.target.classList.contains('graph-bg')) {
                x = (e.offsetX - assetsGraphState.panX) / assetsGraphState.scale;
                y = (e.offsetY - assetsGraphState.panY) / assetsGraphState.scale;
            } else {
                x = (e.offsetX - assetsGraphState.panX) / assetsGraphState.scale;
                y = (e.offsetY - assetsGraphState.panY) / assetsGraphState.scale;
            }
            
            // 指定位置に資産ノードを追加
            addAssetNodeToGraphAtPosition(x, y);
        }
    };

    // 初期配置計算
    let levelCounts = {};
    assets.forEach(asset => {
        if(!asset.graphX) {
            // 親からの深さを計算
            let depth = 0;
            let curr = asset;
            let visited = new Set();
            
            while(curr.parentId && !visited.has(curr.id)) {
                visited.add(curr.id);
                depth++;
                const parent = assets.find(a => a.id === curr.parentId);
                if(!parent) break;
                curr = parent;
            }
            
            levelCounts[depth] = (levelCounts[depth] || 0) + 1;
            asset.graphX = 100 + (depth * 320);
            asset.graphY = 80 + (levelCounts[depth] * 120);
        }
        
        const node = document.createElement('div');
        node.className = 'node';
        if(selectedElement && selectedElement.type === 'asset-node' && selectedElement.id === asset.id) {
            node.classList.add('selected');
        }
        node.id = `asset-node-${asset.id}`;
        node.style.left = asset.graphX + 'px';
        node.style.top = asset.graphY + 'px';
        node.style.minWidth = '180px';
        node.style.height = 'auto';
        node.style.minHeight = '60px';
        node.style.padding = '12px 20px';
        node.style.flexDirection = 'column';
        node.style.gap = '4px';
        
        // ステータスによる色分け（STATUS_DEFSの定義順が優先順）
        const statusArray = Array.isArray(asset.status) ? asset.status : [asset.status];
        const matchedStatus = STATUS_DEFS.find(def => def.nodeColor && statusArray.includes(def.value));
        const nodeColor = matchedStatus ? matchedStatus.nodeColor : '#6366f1';
        
        node.style.borderColor = nodeColor;
        node.style.background = `linear-gradient(135deg, ${nodeColor}15 0%, ${nodeColor}05 100%)`;
        
        // 子資産数を表示
        const childCount = getChildAssets(asset.id).length;
        const childBadge = childCount > 0 ? `<span class="badge badge-gray" style="font-size:0.7rem; margin-left:4px;">${childCount}個</span>` : '';
        
        node.innerHTML = `
            <div style="font-weight:600; font-size:0.9rem; line-height:1.3; display:flex; align-items:center;">${asset.name}${childBadge}</div>
            <div class="port input" data-tooltip="親資産に接続 (In)" onmousedown="startAssetLink(event, '${asset.id}', 'in')"></div>
            <div class="port output" data-tooltip="子資産を接続 (Out)" onmousedown="startAssetLink(event, '${asset.id}', 'out')"></div>
        `;
        
        // イベントを設定
        setupAssetNodeEvents(asset.id, node, asset);
        
        container.appendChild(node);
    });
    
    drawAssetsLinks();
    updateAssetsGraphTransform();
}

/**
 * 資産ノードのイベントを設定
 */
function setupAssetNodeEvents(assetId, nodeElement, asset) {
    // Click to select
    nodeElement.onclick = (e) => {
        if(e.target.classList.contains('port')) return;
        if(e.target.tagName === 'INPUT') return;
        e.stopPropagation();
        
        // 他のノードで編集中のinputがあればblur
        const editingInput = document.querySelector('.asset-name-input');
        if(editingInput && editingInput.parentElement !== nodeElement) {
            editingInput.blur();
            // blur処理が完了してから選択
            setTimeout(() => {
                selectAssetElement('asset-node', assetId);
            }, 100);
        } else {
            selectAssetElement('asset-node', assetId);
        }
    };

    // Double click to edit asset name
    nodeElement.ondblclick = (e) => {
        if(e.target.classList.contains('port')) return;
        e.stopPropagation();
        editAssetNameInGraph(assetId, nodeElement);
    };

    // Node Drag Logic
    let isDragging = false;
    nodeElement.onmousedown = (e) => {
        if(e.target.classList.contains('port')) return;
        if(e.target.tagName === 'INPUT') return;
        
        const startMouseX = e.clientX;
        const startMouseY = e.clientY;
        const startNodeX = asset.graphX;
        const startNodeY = asset.graphY;
        let hasMoved = false;

        const move = (ev) => {
            if(!hasMoved) {
                hasMoved = true;
                isDragging = true;
                nodeElement.classList.add('is-dragging');
            }
            const dx = (ev.clientX - startMouseX) / assetsGraphState.scale;
            const dy = (ev.clientY - startMouseY) / assetsGraphState.scale;
            
            asset.graphX = startNodeX + dx;
            asset.graphY = startNodeY + dy;
            nodeElement.style.left = asset.graphX + 'px';
            nodeElement.style.top = asset.graphY + 'px';
            drawAssetsLinks();
        };
        
        const stop = (ev) => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', stop);
            if(isDragging) {
                nodeElement.classList.remove('is-dragging');
                isDragging = false;
                autoSaveData();
            }
        };
        
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', stop);
    };
}

/**
 * 資産要素を選択
 */
function selectAssetElement(type, id) {
    selectedElement = { type, id };
    
    // Update UI
    document.querySelectorAll('.node').forEach(n => n.classList.remove('selected'));
    document.querySelectorAll('.link').forEach(l => l.classList.remove('selected'));
    
    if(type === 'asset-node') {
        const node = document.getElementById(`asset-node-${id}`);
        if(node) node.classList.add('selected');
    } else if(type === 'asset-link') {
        const child = assets.find(a => a.id === id);
        if(child && child.parentId) {
            drawAssetsLinks();
        }
    }
}

/**
 * 資産リンク（親子関係）を描画 - タグ管理と同じロジック
 */
function drawAssetsLinks() {
    const svg = document.getElementById('assetsGraphSvg');
    const existingDrag = svg.querySelector('.drag-line');
    svg.innerHTML = '';
    if(existingDrag) svg.appendChild(existingDrag);
    
    assets.forEach(child => {
        if(!child.parentId) return;
        
        const parent = assets.find(a => a.id === child.parentId);
        if(!parent) return;
        
        const pNode = document.getElementById(`asset-node-${parent.id}`);
        const cNode = document.getElementById(`asset-node-${child.id}`);
        if(!pNode || !cNode) return;

        // タグ管理と同じ座標計算: 親ノードの右端から子ノードの左端へ
        const sx = parent.graphX + pNode.offsetWidth; 
        const sy = parent.graphY + (pNode.offsetHeight / 2);
        const ex = child.graphX;        
        const ey = child.graphY + (cNode.offsetHeight / 2);

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", "link");
        
        // 選択状態のチェック
        if(selectedElement && selectedElement.type === 'asset-link' && selectedElement.id === child.id) {
            path.classList.add('selected');
        }

        // ベジェ曲線で描画（タグ管理と同じ）
        const dist = Math.abs(ex - sx) / 2;
        path.setAttribute("d", `M ${sx} ${sy} C ${sx + dist} ${sy}, ${ex - dist} ${ey}, ${ex} ${ey}`);
        
        // リンク選択ロジック
        path.onclick = (e) => {
            e.stopPropagation();
            selectAssetElement('asset-link', child.id);
        };
        svg.appendChild(path);
    });
}

/**
 * 資産リンク開始 - タグ管理と同じロジック
 */
let assetLinkingFrom = null;
let assetLinkDirection = null;

function startAssetLink(e, assetId, direction) {
    e.stopPropagation();
    e.preventDefault();
    
    assetLinkingFrom = assetId;
    assetLinkDirection = direction;
    
    const startAsset = assets.find(a => a.id === assetId);
    if(!startAsset) return;

    const svg = document.getElementById('assetsGraphSvg');
    const wrapper = document.getElementById('assetsGraphView');

    // 接続元の視覚的フィードバック
    if(direction === 'out') {
        wrapper.classList.add('connecting-from-out');
        document.querySelector(`#asset-node-${assetId} .port.output`).classList.add('active-source');
    } else {
        wrapper.classList.add('connecting-from-in');
        document.querySelector(`#asset-node-${assetId} .port.input`).classList.add('active-source');
    }

    const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    tempPath.setAttribute("class", "drag-line");
    svg.appendChild(tempPath);

    const nodeEl = document.getElementById(`asset-node-${assetId}`);
    const nodeW = nodeEl.offsetWidth;
    const nodeH = nodeEl.offsetHeight;
    const sX = direction === 'out' ? startAsset.graphX + nodeW : startAsset.graphX;
    const sY = startAsset.graphY + (nodeH / 2);

    const move = (ev) => {
        const rect = wrapper.getBoundingClientRect();
        
        const mX = (ev.clientX - rect.left - assetsGraphState.panX) / assetsGraphState.scale;
        const mY = (ev.clientY - rect.top - assetsGraphState.panY) / assetsGraphState.scale;
        
        let p1x, p1y, p2x, p2y;
        if (direction === 'out') {
            p1x = sX; p1y = sY; p2x = mX; p2y = mY;
        } else {
            p1x = mX; p1y = mY; p2x = sX; p2y = sY;
        }

        // ベジェ曲線で描画（タグ管理と同じ）
        const dist = Math.abs(p2x - p1x) / 2;
        const cp1x = p1x + dist; const cp1y = p1y;
        const cp2x = p2x - dist; const cp2y = p2y;
        
        tempPath.setAttribute("d", `M ${p1x} ${p1y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2x} ${p2y}`);
    };

    const up = (ev) => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        tempPath.remove();
        
        wrapper.classList.remove('connecting-from-out');
        wrapper.classList.remove('connecting-from-in');
        document.querySelectorAll('.active-source').forEach(el => el.classList.remove('active-source'));

        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        if(el && el.classList.contains('port')) {
            const targetNodeEl = el.closest('.node');
            const targetId = targetNodeEl.id.replace('asset-node-', '');
            if(targetId === assetId) return;

            if(direction === 'out' && el.classList.contains('input')) {
                // Out側から接続 = fromが親、targetが子
                linkAssetParent(targetId, assetId);
            }
            else if(direction === 'in' && el.classList.contains('output')) {
                // In側から接続 = fromが子、targetが親
                linkAssetParent(assetId, targetId);
            }
        }
        
        assetLinkingFrom = null;
        assetLinkDirection = null;
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
}

/**
 * 一時的な資産リンクを描画
 */
/**
 * 資産グラフのズーム更新
 */
function updateAssetsZoom(delta) {
    assetsGraphState.scale = Math.max(0.3, Math.min(2.5, assetsGraphState.scale + delta));
    updateAssetsGraphTransform();
}

/**
 * 資産グラフの変換を適用
 */
function updateAssetsGraphTransform() {
    const canvas = document.getElementById('assetsGraphCanvas');
    if(!canvas) return;
    canvas.style.transform = `translate(${assetsGraphState.panX}px, ${assetsGraphState.panY}px) scale(${assetsGraphState.scale})`;
}

/**
 * 資産グラフの全体表示
 */
function autoFitAssetsGraph() {
    if(assets.length === 0) return;
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    assets.forEach(asset => {
        if(asset.graphX !== undefined && asset.graphY !== undefined) {
            minX = Math.min(minX, asset.graphX);
            minY = Math.min(minY, asset.graphY);
            maxX = Math.max(maxX, asset.graphX + 160);
            maxY = Math.max(maxY, asset.graphY + 60);
        }
    });
    
    if(minX === Infinity) return;
    
    const wrapper = document.getElementById('assetsGraphView');
    const rect = wrapper.getBoundingClientRect();
    
    // レイアウト未完了の場合は次のフレームで再実行
    if(rect.width === 0 || rect.height === 0) {
        requestAnimationFrame(() => autoFitAssetsGraph());
        return;
    }
    
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const padding = 60;
    
    const scaleX = (rect.width - padding * 2) / contentWidth;
    const scaleY = (rect.height - padding * 2) / contentHeight;
    assetsGraphState.scale = Math.min(scaleX, scaleY, 1);
    
    // 配置: 左10%, 上30% に右下へ展開するように配置
    assetsGraphState.panX = rect.width * 0.10 - minX * assetsGraphState.scale;
    assetsGraphState.panY = rect.height * 0.30 - minY * assetsGraphState.scale;
    
    updateAssetsGraphTransform();
}

/**
 * 資産グラフのパン開始
 */
function handleAssetGraphPanStart(e) {
    if(e.target.id !== 'assetsGraphView' && 
       e.target.id !== 'assetsGraphCanvas' && 
       !e.target.classList.contains('graph-bg')) {
        return;
    }
    
    if(e.button !== 0) return;
    
    assetsGraphState.isPanning = true;
    assetsGraphState.panStartX = e.clientX - assetsGraphState.panX;
    assetsGraphState.panStartY = e.clientY - assetsGraphState.panY;
    
    const mousemove = (ev) => {
        if(assetsGraphState.isPanning) {
            assetsGraphState.panX = ev.clientX - assetsGraphState.panStartX;
            assetsGraphState.panY = ev.clientY - assetsGraphState.panStartY;
            updateAssetsGraphTransform();
        }
    };
    
    const mouseup = () => {
        assetsGraphState.isPanning = false;
        window.removeEventListener('mousemove', mousemove);
        window.removeEventListener('mouseup', mouseup);
    };
    
    window.addEventListener('mousemove', mousemove);
    window.addEventListener('mouseup', mouseup);
    
    e.preventDefault();
}

/**
 * =============================================================================
 * 資産グラフビューの編集機能
 * =============================================================================
 */

/**
 * 資産名をグラフビューで編集
 */
function editAssetNameInGraph(assetId, nodeElement) {
    const asset = assets.find(a => a.id === assetId);
    if(!asset) return;
    
    // 既に編集中の場合は何もしない
    if(nodeElement.querySelector('input')) return;
    
    const originalName = asset.name;
    
    // インプットフィールドを作成
    const input = document.createElement('input');
    input.type = 'text';
    input.value = asset.name;
    input.className = 'asset-name-input'; // クラスを追加して識別しやすく
    input.style.cssText = `
        padding: 6px 10px;
        font-size: 0.9rem;
        font-weight: 600;
        width: 140px;
        margin: 0;
        border: 2px solid var(--primary);
        border-radius: 4px;
        background: #fff;
        color: var(--text);
        outline: none;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
    `;
    
    const finishEdit = () => {
        const newName = input.value.trim();
        
        if(!newName) {
            showToast('❌ 資産名は空にできません', 'error');
            // 元の表示に戻す
            updateAssetNodeDisplay(assetId);
            return;
        }
        
        if(newName !== originalName) {
            asset.name = newName;
            showToast(`✓ 資産名を「${originalName}」→「${newName}」に更新しました`, 'success');
            autoSaveData();
            
            // メイン画面のリスト表示も更新（開いている場合）
            if(currentPage === 'assets' && window.currentAssetList) {
                renderAssets(window.currentAssetList);
            }
        }
        
        // ノードの表示を更新（選択状態を維持）
        updateAssetNodeDisplay(assetId);
        
        // 選択状態を維持
        selectAssetElement('asset-node', assetId);
    };
    
    // Enterキーで確定
    input.onkeydown = (e) => {
        if(e.key === 'Enter') {
            e.preventDefault();
            finishEdit();
        } else if(e.key === 'Escape') {
            e.preventDefault();
            updateAssetNodeDisplay(assetId);
        }
    };
    
    // フォーカスアウトで確定
    input.onblur = () => {
        // 少し遅延させてから実行（他のイベントと競合を避ける）
        setTimeout(finishEdit, 50);
    };
    
    // ノードの内容を入力フィールドに置き換え
    nodeElement.innerHTML = '';
    nodeElement.appendChild(input);
    input.focus();
    input.select();
}

/**
 * 資産ノードの表示を更新（HTMLのみ更新、位置は保持）
 */
function updateAssetNodeDisplay(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if(!asset) return;
    
    const nodeElement = document.getElementById(`asset-node-${assetId}`);
    if(!nodeElement) return;
    
    // 子資産数を表示
    const childCount = getChildAssets(asset.id).length;
    const childBadge = childCount > 0 ? `<span class="badge badge-gray" style="font-size:0.7rem; margin-left:4px;">${childCount}個</span>` : '';
    
    nodeElement.innerHTML = `
        <div style="font-weight:600; font-size:0.9rem; line-height:1.3; display:flex; align-items:center;">${asset.name}${childBadge}</div>
        <div class="port input" data-tooltip="親資産に接続 (In)" onmousedown="startAssetLink(event, '${asset.id}', 'in')"></div>
        <div class="port output" data-tooltip="子資産を接続 (Out)" onmousedown="startAssetLink(event, '${asset.id}', 'out')"></div>
    `;
    
    // イベントを再設定
    setupAssetNodeEvents(asset.id, nodeElement, asset);
}

/**
 * 資産ノードを削除（元データも削除）
 */
function deleteAssetNodeFromGraph(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if(!asset) return;
    
    // 子資産の数を確認
    const childCount = getChildAssets(assetId).length;
    
    let confirmMessage = `「${asset.name}」(ID: ${asset.id.toUpperCase()})を削除しますか？\n\n⚠️ この操作は取り消せません。\n⚠️ 資産データも完全に削除されます。`;
    
    if(childCount > 0) {
        confirmMessage += `\n⚠️ この資産には${childCount}個の子資産があります。\n   子資産の親は自動的に解除されます。`;
    }
    
    if(!confirm(confirmMessage)) {
        return;
    }
    
    // 子資産の親を解除
    const children = getChildAssets(assetId);
    children.forEach(child => {
        child.parentId = null;
    });
    
    // 資産データを削除
    assets = assets.filter(a => a.id !== assetId);
    
    // 表示中のリストからも削除
    if(window.currentAssetList) {
        window.currentAssetList = window.currentAssetList.filter(a => a.id !== assetId);
    }
    
    showToast(`✓ 「${asset.name}」を削除しました`, 'success');
    autoSaveData();
    
    // グラフビューを更新
    renderAssetsGraphView();
    
    // リストビューも更新
    if(currentView === 'list' || document.getElementById('assetsListView').style.display !== 'none') {
        renderAssetsListView();
    }
    
    // メイン画面のリスト表示も更新（開いている場合）
    if(currentPage === 'assets' && window.currentAssetList) {
        renderAssets(window.currentAssetList);
    }
    
    // 選択解除
    selectedElement = null;
}

/**
 * デフォルトの資産名を生成
 */
function generateDefaultAssetName() {
    let counter = 1;
    let name = `新規資産${counter}`;
    
    // 重複しない名前を生成
    while(assets.some(a => a.name === name)) {
        counter++;
        name = `新規資産${counter}`;
    }
    
    return name;
}

/**
 * 画面内の左上に資産ノードを追加（ボタン用）
 */
function addAssetNodeToGraph() {
    const wrapper = document.getElementById('assetsGraphView');
    const rect = wrapper.getBoundingClientRect();
    
    // 画面左上の論理座標を計算
    const x = (100 - assetsGraphState.panX) / assetsGraphState.scale;
    const y = (100 - assetsGraphState.panY) / assetsGraphState.scale;
    
    addAssetNodeToGraphAtPosition(x, y);
}

/**
 * 指定位置に資産ノードを追加
 */
function addAssetNodeToGraphAtPosition(x, y) {
    const newId = 'a' + Date.now();
    const newName = generateDefaultAssetName();
    
    const newAsset = {
        id: newId,
        name: newName,
        tags: [],
        status: [],
        date: new Date().toISOString().split('T')[0],
        specs: '',
        image: '',
        images: [],
        parentId: null,
        operations: { procedure: '', checkpoints: '' },
        risk: { assessment: '', measures: '' },
        maintenance: [],
        scheduledPlans: [],
        graphX: x,
        graphY: y
    };
    
    assets.push(newAsset);
    
    // 新しいノードを選択状態にする
    selectedElement = { type: 'asset-node', id: newId };
    
    showToast(`✓ 「${newName}」を追加しました\n💡 ダブルクリックで名前を編集できます`, 'success');
    autoSaveData();
    
    // グラフビューを更新
    renderAssetsGraphView();
    
    // リストビューも更新
    if(currentView === 'list' || document.getElementById('assetsListView').style.display !== 'none') {
        renderAssetsListView();
    }
    
    // メイン画面のリスト表示も更新（開いている場合）
    if(currentPage === 'assets' && window.currentAssetList) {
        window.currentAssetList.push(newAsset);
        renderAssets(window.currentAssetList);
    }
}

