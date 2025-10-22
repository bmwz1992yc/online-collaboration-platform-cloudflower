// ⚠️ 重要提示：此 Worker 需要绑定一个名为 R2_BUCKET 的 R2 存储桶。
// 如果未绑定 R2 存储桶，Worker 将无法正常工作。

const SHARE_LINKS_KEY = 'admin:share_links';
const DELETED_TODOS_KEY = 'system:deleted_todos';
const KEPT_ITEMS_KEY = 'system:kept_items'; // 新增物品保管的 R2 键
const DELETED_ITEMS_KEY = 'system:deleted_items'; // 新增已删除物品的 R2 键
const DELETED_PROGRESS_KEY = 'system:deleted_progress'; // 新增已删除进度的 R2 键

// --- 辅助函数 ---

async function sha256(data) {
  let buffer;
  if (data instanceof ReadableStream) {
    buffer = await new Response(data).arrayBuffer();
  } else if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data);
  } else if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
    buffer = data;
  } else if (typeof data === 'object') {
    buffer = new TextEncoder().encode(JSON.stringify(data));
  } else {
    throw new Error('Unsupported data type for sha256');
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const getKvKey = (userId) => `todos:${userId}`;

function getDisplayName(userId) {
  if (userId === 'admin') return 'yc';
  return userId;
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  // 使用 toLocaleString 格式化为北京时间
  return d.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
        month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false // 使用24小时制
  }).replace(/\//g, '年').replace(',', '日').replace(' ', ' '); // 格式化输出
}

// Image compression function
async function compressImage(file) {
  // For simplicity, we'll just return the original file
  // In a real implementation, you would use a library like Sharp or Canvas to compress the image
  return file.stream();
}

async function addTodoActivityLog(env, todoId, actorId, action, details) {
  if (!todoId) return;

  const allTodos = await getAllUsersTodos(env);
  const targetTodoInfo = allTodos.find(t => t.id === todoId);

  if (!targetTodoInfo) {
    console.error(`Could not find todo with ID ${todoId} to add activity log.`);
    return;
  }

  const ownerId = targetTodoInfo.ownerId;
  const kvKey = getKvKey(ownerId);
  const todos = await loadTodos(env, kvKey);
  const todoIndex = todos.findIndex(t => t.id === todoId);

  if (todoIndex !== -1) {
    if (!todos[todoIndex].activityLog) {
      todos[todoIndex].activityLog = [];
    }
    todos[todoIndex].activityLog.push({
      timestamp: new Date().toISOString(),
      actorId: actorId,
      action: action,
      details: details
    });
    await saveTodos(env, kvKey, todos);
  }
}

// --- R2 存储函数 ---

async function loadTodos(env, key) {
  try {
    const r2Object = await env.R2_BUCKET.get(key);
    if (r2Object === null) return [];
    return await r2Object.json();
  } catch (error) {
    console.error(`Error loading or parsing todos for key ${key}:`, error);
    if (env.DEBUG) throw error; // Re-throw for debugging
    return [];
  }
}

async function handleUpdateProgress(request, env) {
  const { id, text } = await request.json();
  if (!id || !text) {
    return new Response(JSON.stringify({ error: "Missing 'id' or 'text'" }), { status: 400 });
  }

  const referer = request.headers.get('Referer');
  let actorId = 'admin';
  if (referer) {
      const refererPath = new URL(referer).pathname.substring(1).split('/')[0].toLowerCase();
      const shareLinks = await loadShareLinks(env);
      if (shareLinks[refererPath]) {
          actorId = shareLinks[refererPath].username;
      }
  }

  const allTodos = await getAllUsersTodos(env);
  let progressFound = false;
  for (const todo of allTodos) {
    if (todo.progress && todo.progress.some(p => p.id === id)) {
      const kvKey = getKvKey(todo.ownerId);
      const todos = await loadTodos(env, kvKey);
      const todoIndex = todos.findIndex(t => t.id === todo.id);
      if (todoIndex !== -1) {
        const progressIndex = todos[todoIndex].progress.findIndex(p => p.id === id);
        if (progressIndex !== -1) {
          const oldText = todos[todoIndex].progress[progressIndex].text;
          todos[todoIndex].progress[progressIndex].text = text;
          await saveTodos(env, kvKey, todos);

          await addTodoActivityLog(env, todo.id, actorId, 'update_progress', { progressId: id, from: oldText, to: text });
          progressFound = true;
        }
      }
    }
  }

  if (progressFound) {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } else {
    return new Response(JSON.stringify({ error: "Progress not found" }), { status: 404 });
  }
}

async function handleDeleteProgress(request, env) {
  const { id } = await request.json();
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing 'id'" }), { status: 400 });
  }

  const referer = request.headers.get('Referer');
  let deleterId = 'admin';
  if (referer) {
      const refererPath = new URL(referer).pathname.substring(1).split('/')[0].toLowerCase();
      const shareLinks = await loadShareLinks(env);
      if (shareLinks[refererPath]) {
          deleterId = shareLinks[refererPath].username;
      }
  }

  const allTodos = await getAllUsersTodos(env);
  let progressFound = false;
  for (const todo of allTodos) {
    if (todo.progress && todo.progress.some(p => p.id === id)) {
      const kvKey = getKvKey(todo.ownerId);
      const todos = await loadTodos(env, kvKey);
      const todoIndex = todos.findIndex(t => t.id === todo.id);
      if (todoIndex !== -1) {
        const progressIndex = todos[todoIndex].progress.findIndex(p => p.id === id);
        if (progressIndex !== -1) {
          const progressToDelete = todos[todoIndex].progress[progressIndex];
          todos[todoIndex].progress.splice(progressIndex, 1);
          await saveTodos(env, kvKey, todos);

          const deletedProgress = {
            ...progressToDelete,
            todoId: todo.id,
            deletedAt: new Date().toISOString(),
            deletedBy: deleterId
          };

          const deletedProgressList = await loadDeletedProgress(env);
          deletedProgressList.push(deletedProgress);
          await saveDeletedProgress(env, deletedProgressList);

          await addTodoActivityLog(env, todo.id, deleterId, 'delete_progress', { progressId: id, text: progressToDelete.text });
          progressFound = true;
        }
      }
    }
  }

  if (progressFound) {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } else {
    return new Response(JSON.stringify({ error: "Progress not found" }), { status: 404 });
  }
}

async function handleRestoreProgress(request, env) {
  const { id } = await request.json();
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing 'id'" }), { status: 400 });
  }

  const referer = request.headers.get('Referer');
  let actorId = 'admin';
  if (referer) {
      const refererPath = new URL(referer).pathname.substring(1).split('/')[0].toLowerCase();
      const shareLinks = await loadShareLinks(env);
      if (shareLinks[refererPath]) {
          actorId = shareLinks[refererPath].username;
      }
  }

  let deletedProgressList = await loadDeletedProgress(env);
  const progressIndex = deletedProgressList.findIndex(p => p.id === id);

  if (progressIndex !== -1) {
    const progressToRestore = deletedProgressList[progressIndex];
    deletedProgressList.splice(progressIndex, 1);

    const { todoId, deletedAt, deletedBy, ...restoredProgress } = progressToRestore;

    const allTodos = await getAllUsersTodos(env);
    let todoFound = false;
    for (const todo of allTodos) {
      if (todo.id === todoId) {
        const kvKey = getKvKey(todo.ownerId);
        const todos = await loadTodos(env, kvKey);
        const todoIndex = todos.findIndex(t => t.id === todoId);
        if (todoIndex !== -1) {
          if (!todos[todoIndex].progress) {
            todos[todoIndex].progress = [];
          }
          todos[todoIndex].progress.push(restoredProgress);
          await saveTodos(env, kvKey, todos);
          todoFound = true;
        }
      }
    }

    if (todoFound) {
      await saveDeletedProgress(env, deletedProgressList);
      await addTodoActivityLog(env, todoId, actorId, 'restore_progress', { progressId: id, text: restoredProgress.text });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    } else {
      return new Response(JSON.stringify({ error: "Todo not found for progress item" }), { status: 404 });
    }
  } else {
    return new Response(JSON.stringify({ error: "Deleted progress not found" }), { status: 404 });
  }
}

async function handleUpdateItemName(request, env) {
  const { id, name } = await request.json();
  if (!id || !name) {
    return new Response(JSON.stringify({ error: "Missing 'id' or 'name'" }), { status: 400 });
  }

  const referer = request.headers.get('Referer');
  let actorId = 'admin';
  if (referer) {
      const refererPath = new URL(referer).pathname.substring(1).split('/')[0].toLowerCase();
      const shareLinks = await loadShareLinks(env);
      if (shareLinks[refererPath]) {
          actorId = shareLinks[refererPath].username;
      }
  }

  const keptItems = await loadKeptItems(env);
  const itemIndex = keptItems.findIndex(item => item.id === id);

  if (itemIndex !== -1) {
    const oldName = keptItems[itemIndex].name;
    keptItems[itemIndex].name = name;
    await saveKeptItems(env, keptItems);

    const todoId = keptItems[itemIndex].todoId;
    await addTodoActivityLog(env, todoId, actorId, 'update_item_name', { itemId: id, from: oldName, to: name });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } else {
    return new Response(JSON.stringify({ error: "Item not found" }), { status: 404 });
  }
}

async function handleAddProgress(request, env) {
  const referer = request.headers.get('Referer');
  let creatorId = 'admin';
  if (referer) {
      const refererPath = new URL(referer).pathname.substring(1).split('/')[0].toLowerCase();
      const shareLinks = await loadShareLinks(env);
      if (shareLinks[refererPath]) {
          creatorId = shareLinks[refererPath].username;
      }
  }

  const formData = await request.formData();
  const todoId = formData.get('todoId');
  const text = formData.get('text');
  const attachmentFiles = formData.getAll('attachments');

  if (!todoId || !text) {
    return new Response('Missing "todoId" or "text" in form data', { status: 400 });
  }

  let attachmentUrls = [];
  for (const attachmentFile of attachmentFiles) {
    if (attachmentFile && attachmentFile.size > 0) {
      const attachmentId = crypto.randomUUID();
      const extension = attachmentFile.name.split('.').pop();
      const attachmentKey = `attachments/${attachmentId}.${extension}`;
      await env.R2_BUCKET.put(attachmentKey, attachmentFile.stream(), {
        httpMetadata: {
          contentType: attachmentFile.type,
          contentDisposition: `attachment; filename="${encodeURIComponent(attachmentFile.name)}"`
        }
      });
      attachmentUrls.push({
        url: `/api/${attachmentKey}`,
        name: attachmentFile.name,
        type: attachmentFile.type
      });
    }
  }

  const newProgress = {
    id: crypto.randomUUID(),
    text: text,
    createdAt: new Date().toISOString(),
    creatorId: creatorId,
    attachmentUrls: attachmentUrls
  };

  const allTodos = await getAllUsersTodos(env);
  let todoFound = false;
  for (const todo of allTodos) {
    if (todo.id === todoId) {
      const kvKey = getKvKey(todo.ownerId);
      const todos = await loadTodos(env, kvKey);
      const todoIndex = todos.findIndex(t => t.id === todoId);
      if (todoIndex !== -1) {
        if (!todos[todoIndex].progress) {
          todos[todoIndex].progress = [];
        }
        todos[todoIndex].progress.push(newProgress);
        await saveTodos(env, kvKey, todos);
        todoFound = true;
      }
    }
  }

  if (todoFound) {
    await addTodoActivityLog(env, todoId, creatorId, 'add_progress', { progressId: newProgress.id, text: newProgress.text });
    return new Response(JSON.stringify({ success: true, progress: newProgress }), { status: 200, headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
  } else {
    return new Response(JSON.stringify({ error: "Todo not found" }), { status: 404 });
  }
}

async function handleUpdateTodoText(request, env) {
  const { id, ownerId, text } = await request.json();
  if (!id || !ownerId || !text) {
    return new Response(JSON.stringify({ error: "Missing 'id', 'ownerId', or 'text'" }), { status: 400 });
  }

  const referer = request.headers.get('Referer');
  let editorId = 'admin';
  if (referer) {
      const refererPath = new URL(referer).pathname.substring(1).split('/')[0].toLowerCase();
      const shareLinks = await loadShareLinks(env);
      if (shareLinks[refererPath]) {
          editorId = shareLinks[refererPath].username;
      }
  }

  const kvKey = getKvKey(ownerId);
  const todos = await loadTodos(env, kvKey);
  const todoIndex = todos.findIndex(t => t.id === id);

  if (todoIndex !== -1) {
    const oldText = todos[todoIndex].text;
    todos[todoIndex].text = text;

    if (!todos[todoIndex].activityLog) {
      todos[todoIndex].activityLog = [];
    }
    todos[todoIndex].activityLog.push({
      timestamp: new Date().toISOString(),
      actorId: editorId,
      action: 'update_text',
      details: { from: oldText, to: text }
    });


    await saveTodos(env, kvKey, todos);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } else {
    return new Response(JSON.stringify({ error: "Todo not found" }), { status: 404 });
  }
}

async function saveTodos(env, key, todos) {
  await env.R2_BUCKET.put(key, JSON.stringify(todos));
}

async function loadShareLinks(env) {
  try {
    const r2Object = await env.R2_BUCKET.get(SHARE_LINKS_KEY);
    if (r2Object === null) return {};
    return await r2Object.json();
  } catch (error) {
    console.error("Error loading share links:", error);
    if (env.DEBUG) throw error; // Re-throw for debugging
    return {};
  }
}

async function saveShareLinks(env, links) {
  await env.R2_BUCKET.put(SHARE_LINKS_KEY, JSON.stringify(links));
}

async function loadDeletedTodos(env) {
  try {
    const r2Object = await env.R2_BUCKET.get(DELETED_TODOS_KEY);
    if (r2Object === null) return [];
    return await r2Object.json();
  } catch (error) {
    console.error("Error loading deleted todos:", error);
    if (env.DEBUG) throw error; // Re-throw for debugging
    return [];
  }
}

async function saveDeletedTodos(env, todos) {
  await env.R2_BUCKET.put(DELETED_TODOS_KEY, JSON.stringify(todos));
}

async function loadKeptItems(env) {
  try {
    const r2Object = await env.R2_BUCKET.get(KEPT_ITEMS_KEY);
    if (r2Object === null) return [];
    return await r2Object.json();
  } catch (error) {
    console.error("Error loading kept items:", error);
    if (env.DEBUG) throw error; // Re-throw for debugging
    return [];
  }
}

async function saveKeptItems(env, items) {
  await env.R2_BUCKET.put(KEPT_ITEMS_KEY, JSON.stringify(items));
}

async function loadDeletedItems(env) {
  try {
    const r2Object = await env.R2_BUCKET.get(DELETED_ITEMS_KEY);
    if (r2Object === null) return [];
    return await r2Object.json();
  } catch (error) {
    console.error("Error loading deleted items:", error);
    if (env.DEBUG) throw error;
    return [];
  }
}

async function saveDeletedItems(env, items) {
  await env.R2_BUCKET.put(DELETED_ITEMS_KEY, JSON.stringify(items));
}

async function loadDeletedProgress(env) {
  try {
    const r2Object = await env.R2_BUCKET.get(DELETED_PROGRESS_KEY);
    if (r2Object === null) return [];
    return await r2Object.json();
  } catch (error) {
    console.error("Error loading deleted progress:", error);
    if (env.DEBUG) throw error;
    return [];
  }
}

async function saveDeletedProgress(env, progress) {
  await env.R2_BUCKET.put(DELETED_PROGRESS_KEY, JSON.stringify(progress));
}

async function getAllUsersTodos(env) {
  const listResponse = await env.R2_BUCKET.list({ prefix: 'todos:' });
  const keys = listResponse.objects.map(k => k.key);
  
  let allTodos = [];
  for (const key of keys) {
    const ownerId = key.substring(6);
    const userTodos = await loadTodos(env, key);
    allTodos.push(...userTodos.map(todo => ({ ...todo, ownerId: ownerId })));
  }
  allTodos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return allTodos;
}

// --- API 逻辑处理器 ---

async function handleVerify(request, env) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const url = new URL(request.url);
    const merkleRoot = url.searchParams.get('merkle_root');

    if (!merkleRoot) {
      return new Response(JSON.stringify({ error: "Missing 'merkle_root' query parameter" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' }
      });
    }

    // 1. Get block metadata from BLOCKS_BUCKET
    const blockObject = await env.BLOCKS_BUCKET.get(`blocks/${merkleRoot}.json`);
    if (blockObject === null) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Verification failed: Block file not found.',
        status: 'block_not_found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' }
      });
    }
    const blockMetadata = await blockObject.json();

    // 2. Get attachment file from R2_BUCKET
    const attachmentObject = await env.R2_BUCKET.get(blockMetadata.attachment_path);
    if (attachmentObject === null) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Block is intact, but the original attachment is missing and cannot be verified.',
        status: 'attachment_not_found',
        block: blockMetadata
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' }
      });
    }

    // 3. Recalculate hash of the attachment
    const attachmentBuffer = await attachmentObject.arrayBuffer();
    const recomputedImageSha256 = await sha256(new Uint8Array(attachmentBuffer));

    // 4. Compare hashes
    const isHashMatching = recomputedImageSha256 === blockMetadata.image_sha256;

    const verificationResult = {
      success: isHashMatching,
      message: isHashMatching ? 'Successfully verified: The attachment content matches the block record.' : 'Verification failed: The attachment content hash does not match the block record.',
      status: isHashMatching ? 'verified' : 'hash_mismatch',
      block: blockMetadata,
      recomputed_hash: recomputedImageSha256,
    };

    return new Response(JSON.stringify(verificationResult), {
      status: 200,
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    });

  } catch (error) {
    console.error('Error in handleVerify:', error);
    return new Response(JSON.stringify({ error: `Internal Server Error: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json;charset=UTF-8' }
    });
  }
}

async function handleUpload(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const formData = await request.formData();
    const imageFile = formData.get('image_file');
    const prevHash = formData.get('prev_hash');

    if (!imageFile || !prevHash) {
      return new Response(JSON.stringify({ error: "Missing 'image_file' or 'prev_hash'" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' }
      });
    }

    // 1. Calculate image hash
    const imageBuffer = await imageFile.arrayBuffer();
    const imageSha256 = await sha256(new Uint8Array(imageBuffer));

    // 2. Fetch real-time anchor from Coinbase
    const coinbaseResponse = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot');
    if (!coinbaseResponse.ok) {
      throw new Error(`Coinbase API failed with status: ${coinbaseResponse.status}`);
    }
    const coinbaseData = await coinbaseResponse.json();
    const btcUsdAnchor = coinbaseData.data.amount;

    // 3. Generate block metadata
    const timestamp = new Date().toISOString();
    const fileUuid = crypto.randomUUID();
    const extension = imageFile.name.split('.').pop() || 'jpg';
    const attachmentPath = `attachments/${fileUuid}.${extension}`;

    const blockMetadata = {
      timestamp: timestamp,
      prev_hash: prevHash,
      image_sha256: imageSha256,
      btc_usd_anchor: btcUsdAnchor,
      attachment_path: attachmentPath,
    };

    // 4. Calculate Merkle root (hash of the block metadata)
    const merkleRoot = await sha256(JSON.stringify(blockMetadata));

    // 5. Write image attachment to R2_BUCKET
    await env.R2_BUCKET.put(attachmentPath, imageBuffer, {
      httpMetadata: {
        contentType: imageFile.type,
        contentDisposition: `inline; filename="${encodeURIComponent(imageFile.name)}"`
       },
    });

    // 6. Write block file to BLOCKS_BUCKET (immutable)
    await env.BLOCKS_BUCKET.put(`blocks/${merkleRoot}.json`, JSON.stringify(blockMetadata), {
      httpMetadata: { contentType: 'application/json;charset=UTF-8' },
    });

    // 7. Return the new block's hash and path
    return new Response(JSON.stringify({
      merkle_root: merkleRoot,
      attachment_path: attachmentPath
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    });

  } catch (error) {
    console.error('Error in handleUpload:', error);
    return new Response(JSON.stringify({ error: `Internal Server Error: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json;charset=UTF-8' }
    });
  }
}

async function handleAddTodo(request, env) {
  const referer = request.headers.get('Referer');
  let creatorId = 'admin';
  if (referer) {
      const refererPath = new URL(referer).pathname.substring(1).split('/')[0].toLowerCase();
      const shareLinks = await loadShareLinks(env);
      if (shareLinks[refererPath]) {
          creatorId = shareLinks[refererPath].username;
      }
  }

  const formData = await request.formData();
  const text = formData.get('text');
  const attachmentFile = formData.get('attachment');
  let ownerIds = formData.getAll('userIds');

  if (!text) {
    return new Response('Missing "text" in form data', { status: 400 });
  }
  
  if (ownerIds.length === 0) {
    ownerIds.push('public');
  }

  let attachmentUrl = null;
  if (attachmentFile && attachmentFile.size > 0) {
    const attachmentId = crypto.randomUUID();
    const extension = attachmentFile.name.split('.').pop();
    const attachmentKey = `attachments/${attachmentId}.${extension}`;
    await env.R2_BUCKET.put(attachmentKey, attachmentFile.stream(), {
        httpMetadata: {
          contentType: attachmentFile.type,
          contentDisposition: `attachment; filename="${encodeURIComponent(attachmentFile.name)}"`
        }
      });
    attachmentUrl = {
      url: `/api/${attachmentKey}`,
      name: attachmentFile.name,
      type: attachmentFile.type
    };
  }

  const newTodo = {
    id: crypto.randomUUID(),
    text: text,
    completed: false,
    createdAt: new Date().toISOString(),
    creatorId: creatorId,
    attachmentUrl: attachmentUrl,
    activityLog: [{
      timestamp: new Date().toISOString(),
      actorId: creatorId,
      action: 'create',
      details: { text: text }
    }]
  };

  for (const ownerId of ownerIds) {
    const kvKey = getKvKey(ownerId);
    const todos = await loadTodos(env, kvKey);
    todos.push(newTodo);
    await saveTodos(env, kvKey, todos);
  }

  return new Response(JSON.stringify({ success: true, todo: newTodo }), { status: 200, headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
}

async function handleUpdateTodo(request, env) {
  const { id, completed, ownerId } = await request.json();
  if (!id || completed === undefined || !ownerId) {
    return new Response(JSON.stringify({ error: "Missing 'id', 'completed', or 'ownerId'" }), { status: 400 });
  }

  const referer = request.headers.get('Referer');
  let completerId = 'admin';
  if (referer) {
      const refererPath = new URL(referer).pathname.substring(1).split('/')[0].toLowerCase();
      const shareLinks = await loadShareLinks(env);
      if (shareLinks[refererPath]) {
          completerId = shareLinks[refererPath].username;
      }
  }

  const kvKey = getKvKey(ownerId);
  const todos = await loadTodos(env, kvKey);
  const todoIndex = todos.findIndex(t => t.id === id);

  if (todoIndex !== -1) {
    const oldStatus = todos[todoIndex].completed;
    const newStatus = Boolean(completed);

    if (!todos[todoIndex].activityLog) {
      todos[todoIndex].activityLog = [];
    }

    if (oldStatus !== newStatus) {
      todos[todoIndex].activityLog.push({
        timestamp: new Date().toISOString(),
        actorId: completerId,
        action: 'update_status',
        details: { from: oldStatus, to: newStatus }
      });
    }

    todos[todoIndex].completed = newStatus;
    if (newStatus) {
      todos[todoIndex].completedAt = new Date().toISOString();
      todos[todoIndex].completedBy = completerId;
    } 

    await saveTodos(env, kvKey, todos);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } else {
    return new Response(JSON.stringify({ error: "Todo not found" }), { status: 404 });
  }
}

async function handleDeleteTodo(request, env) {
  const { id, ownerId } = await request.json();
  if (!id || !ownerId) {
    return new Response(JSON.stringify({ error: "Missing 'id' or 'ownerId'" }), { status: 400 });
  }

  const referer = request.headers.get('Referer');
  let deleterId = 'admin';
  if (referer) {
      const refererPath = new URL(referer).pathname.substring(1).split('/')[0].toLowerCase();
      const shareLinks = await loadShareLinks(env);
      if (shareLinks[refererPath]) {
          deleterId = shareLinks[refererPath].username;
      }
  }

  const kvKey = getKvKey(ownerId);
  let todos = await loadTodos(env, kvKey);
  const todoIndex = todos.findIndex(t => t.id === id);

  if (todoIndex !== -1) {
    if (!todos[todoIndex].activityLog) {
      todos[todoIndex].activityLog = [];
    }
    todos[todoIndex].activityLog.push({
      timestamp: new Date().toISOString(),
      actorId: deleterId,
      action: 'delete',
      details: {}
    });

    const todoToDelete = todos[todoIndex];
    todos.splice(todoIndex, 1);
    await saveTodos(env, kvKey, todos);

    const deletedTodo = {
      ...todoToDelete,
      ownerId: ownerId,
      deletedAt: new Date().toISOString(),
      deletedBy: deleterId
    };

    const deletedTodos = await loadDeletedTodos(env);
    deletedTodos.push(deletedTodo);
    await saveDeletedTodos(env, deletedTodos);

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } else {
    return new Response(JSON.stringify({ error: "Todo not found" }), { status: 404 });
  }
}

async function handleCreateUser(request, env) {
    const formData = await request.formData();
    const username = formData.get('username')?.toLowerCase();
    if (!username) {
        return new Response('Username is required', { status: 400 });
    }

    const shareLinks = await loadShareLinks(env);
    const newToken = crypto.randomUUID().substring(0, 8);
    
    shareLinks[newToken] = {
        username: username,
        created_at: new Date().toISOString()
    };
    
    await saveShareLinks(env, shareLinks);
    return new Response(JSON.stringify({ success: true, token: newToken, username: username }), { status: 200, headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
}

async function handleDeleteUser(request, env) {
    const { token } = await request.json();
    if (!token) {
        return new Response(JSON.stringify({ error: "Missing 'token'" }), { status: 400 });
    }

    const shareLinks = await loadShareLinks(env);
    if (shareLinks[token]) {
        delete shareLinks[token];
        await saveShareLinks(env, shareLinks);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } else {
        return new Response(JSON.stringify({ error: "User token not found" }), { status: 404 });
    }
}

// --- 物品保管 API 逻辑处理器 ---

async function handleAddItem(request, env) {
  const referer = request.headers.get('Referer');
  const formData = await request.formData();
  const name = formData.get('name');
  const keepers = formData.getAll('keepers');
  const attachmentFile = formData.get('attachment');
  const todoId = formData.get('todoId');

  if (!name || keepers.length === 0) {
    return new Response('Missing "name" or "keepers" in form data', { status: 400 });
  }

  let creatorId = 'admin';
  if (referer) {
      const refererPath = new URL(referer).pathname.substring(1).split('/')[0].toLowerCase();
      const shareLinks = await loadShareLinks(env);
      if (shareLinks[refererPath]) {
          creatorId = shareLinks[refererPath].username;
      }
  }

  let attachmentUrl = null;
  if (attachmentFile && attachmentFile.size > 0) {
    const attachmentId = crypto.randomUUID();
    const extension = attachmentFile.name.split('.').pop();
    const attachmentKey = `attachments/${attachmentId}.${extension}`;
    await env.R2_BUCKET.put(attachmentKey, attachmentFile.stream(), {
        httpMetadata: {
          contentType: attachmentFile.type,
          contentDisposition: `attachment; filename="${encodeURIComponent(attachmentFile.name)}"`
        }
      });
    attachmentUrl = {
      url: `/api/${attachmentKey}`,
      name: attachmentFile.name,
      type: attachmentFile.type
    };
  }

  const newItem = {
    id: crypto.randomUUID(),
    name: name,
    todoId: todoId || null,
    attachmentUrl: attachmentUrl,
    createdAt: new Date().toISOString(),
    keepers: [{
        userIds: keepers,
        timestamp: new Date().toISOString(),
        transferredBy: creatorId
    }]
  };

  const keptItems = await loadKeptItems(env);
  keptItems.push(newItem);
  await saveKeptItems(env, keptItems);

  await addTodoActivityLog(env, todoId, creatorId, 'create_item', { itemId: newItem.id, name: newItem.name });

  return new Response(JSON.stringify({ success: true, item: newItem }), { status: 200, headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
}

async function handleDeleteItem(request, env) {
  const { id } = await request.json();
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing 'id'" }), { status: 400 });
  }

  const referer = request.headers.get('Referer');
  let deleterId = 'admin';
  if (referer) {
      const refererPath = new URL(referer).pathname.substring(1).split('/')[0].toLowerCase();
      const shareLinks = await loadShareLinks(env);
      if (shareLinks[refererPath]) {
          deleterId = shareLinks[refererPath].username;
      }
  }

  let keptItems = await loadKeptItems(env);
  const itemIndex = keptItems.findIndex(item => item.id === id);

  if (itemIndex !== -1) {
    const itemToDelete = keptItems[itemIndex];
    keptItems.splice(itemIndex, 1);
    await saveKeptItems(env, keptItems);

    const deletedItem = {
      ...itemToDelete,
      deletedAt: new Date().toISOString(),
      deletedBy: deleterId
    };

    const deletedItems = await loadDeletedItems(env);
    deletedItems.push(deletedItem);
    await saveDeletedItems(env, deletedItems);

    await addTodoActivityLog(env, itemToDelete.todoId, deleterId, 'delete_item', { itemId: id, name: itemToDelete.name });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } else {
    return new Response(JSON.stringify({ error: "Item not found" }), { status: 404 });
  }
}

async function handleTransferItem(request, env) {
  const referer = request.headers.get('Referer');
  const formData = await request.formData();
  const itemId = formData.get('itemId');
  const newKeepers = formData.getAll('newKeepers');

  if (!itemId || newKeepers.length === 0) {
    return new Response('Missing itemId or newKeepers in form data', { status: 400 });
  }

  let transferrerId = 'admin';
  if (referer) {
      const refererPath = new URL(referer).pathname.substring(1).split('/')[0].toLowerCase();
      const shareLinks = await loadShareLinks(env);
      if (shareLinks[refererPath]) {
          transferrerId = shareLinks[refererPath].username;
      }
  }

  const keptItems = await loadKeptItems(env);
  const itemIndex = keptItems.findIndex(item => item.id === itemId);

  if (itemIndex === -1) {
    return new Response('Item not found', { status: 404 });
  }

  const item = keptItems[itemIndex];
  const isNewDataModel = item.keepers && typeof item.keepers[0] === 'object';

  if (isNewDataModel) {
      item.keepers.push({
          userIds: newKeepers,
          timestamp: new Date().toISOString(),
          transferredBy: transferrerId
      });
  } else {
      const oldKeepers = item.keepers;
      item.keepers = [
          {
              userIds: oldKeepers,
              timestamp: item.createdAt,
              transferredBy: 'unknown'
          },
          {
              userIds: newKeepers,
              timestamp: new Date().toISOString(),
              transferredBy: transferrerId
          }
      ];
  }

  await saveKeptItems(env, keptItems);

  await addTodoActivityLog(env, item.todoId, transferrerId, 'transfer_item', {
    itemId: itemId,
    name: item.name,
    to: newKeepers.map(getDisplayName).join(', ')
  });

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}

async function handleReturnItem(request, env) {
  const referer = request.headers.get('Referer');
  const { id } = await request.json();

  if (!id) {
    return new Response(JSON.stringify({ error: "Missing 'id'" }), { status: 400 });
  }

  let returnerId = 'admin';
  if (referer) {
      const refererPath = new URL(referer).pathname.substring(1).split('/')[0].toLowerCase();
      const shareLinks = await loadShareLinks(env);
      if (shareLinks[refererPath]) {
          returnerId = shareLinks[refererPath].username;
      }
  }

  const keptItems = await loadKeptItems(env);
  const itemIndex = keptItems.findIndex(item => item.id === id);

  if (itemIndex === -1) {
    return new Response('Item not found', { status: 404 });
  }

  const item = keptItems[itemIndex];
  item.returnedAt = new Date().toISOString();
  item.returnedBy = returnerId;

  await saveKeptItems(env, keptItems);

  await addTodoActivityLog(env, item.todoId, returnerId, 'return_item', { itemId: id, name: item.name });

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}

async function handleRestoreTodo(request, env) {
  const { id } = await request.json();
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing 'id'" }), { status: 400 });
  }

  const referer = request.headers.get('Referer');
  let restorerId = 'admin';
  if (referer) {
      const refererPath = new URL(referer).pathname.substring(1).split('/')[0].toLowerCase();
      const shareLinks = await loadShareLinks(env);
      if (shareLinks[refererPath]) {
          restorerId = shareLinks[refererPath].username;
      }
  }

  let deletedTodos = await loadDeletedTodos(env);
  const todoIndex = deletedTodos.findIndex(t => t.id === id);

  if (todoIndex !== -1) {
    const todoToRestore = deletedTodos[todoIndex];
    deletedTodos.splice(todoIndex, 1);
    
    if (!todoToRestore.activityLog) {
      todoToRestore.activityLog = [];
    }
    todoToRestore.activityLog.push({
      timestamp: new Date().toISOString(),
      actorId: restorerId,
      action: 'restore',
      details: {}
    });

    const { ownerId, deletedAt, deletedBy, ...restoredTodo } = todoToRestore;

    const kvKey = getKvKey(ownerId);
    let todos = await loadTodos(env, kvKey);
    todos.push(restoredTodo);

    await saveDeletedTodos(env, deletedTodos);
    await saveTodos(env, kvKey, todos);

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } else {
    return new Response(JSON.stringify({ error: "Deleted todo not found" }), { status: 404 });
  }
}

async function handleRestoreItem(request, env) {
  const { id } = await request.json();
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing 'id'" }), { status: 400 });
  }

  const referer = request.headers.get('Referer');
  let actorId = 'admin';
  if (referer) {
      const refererPath = new URL(referer).pathname.substring(1).split('/')[0].toLowerCase();
      const shareLinks = await loadShareLinks(env);
      if (shareLinks[refererPath]) {
          actorId = shareLinks[refererPath].username;
      }
  }

  let deletedItems = await loadDeletedItems(env);
  const itemIndex = deletedItems.findIndex(item => item.id === id);

  if (itemIndex !== -1) {
    const itemToRestore = deletedItems[itemIndex];
    deletedItems.splice(itemIndex, 1);

    const { deletedAt, deletedBy, ...restoredItem } = itemToRestore;

    let keptItems = await loadKeptItems(env);
    keptItems.push(restoredItem);

    await saveDeletedItems(env, deletedItems);
    await saveKeptItems(env, keptItems);

    await addTodoActivityLog(env, restoredItem.todoId, actorId, 'restore_item', { itemId: id, name: restoredItem.name });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } else {
    return new Response(JSON.stringify({ error: "Deleted item not found" }), { status: 404 });
  }
}

async function handleApiData(request, env) {
  const url = new URL(request.url);
  const shareLinks = await loadShareLinks(env);
  const isRootView = url.pathname === '/api/data'; // Adjust for API path
  
  const allTodos = await getAllUsersTodos(env);
  let deletedTodos = await loadDeletedTodos(env);

  const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
  const recentDeletedTodos = deletedTodos.filter(todo => new Date(todo.deletedAt) > twentyDaysAgo);
  if (recentDeletedTodos.length < deletedTodos.length) {
    await saveDeletedTodos(env, recentDeletedTodos);
  }

  const keptItems = await loadKeptItems(env);
  let deletedItems = await loadDeletedItems(env);
  const recentDeletedItems = deletedItems.filter(item => new Date(item.deletedAt) > twentyDaysAgo);
  if (recentDeletedItems.length < deletedItems.length) {
    await saveDeletedItems(env, recentDeletedItems);
  }

  let deletedProgress = await loadDeletedProgress(env);
  const recentDeletedProgress = deletedProgress.filter(p => new Date(p.deletedAt) > twentyDaysAgo);
  if (recentDeletedProgress.length < deletedProgress.length) {
    await saveDeletedProgress(env, recentDeletedProgress);
  }

  return new Response(JSON.stringify({
    allTodos,
    recentDeletedTodos,
    keptItems,
    recentDeletedItems,
    recentDeletedProgress,
    shareLinks,
    isRootView
  }), {
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = `/${params.path.join('/')}`;
  console.log('Request path:', path); // Add this line for debugging

  // Check for R2 bucket bindings
  if (!env || !env.R2_BUCKET) {
    console.error('R2_BUCKET binding is missing. Please ensure your wrangler.toml includes an R2 bucket binding named R2_BUCKET.');
    return new Response('Internal Server Error: R2_BUCKET binding is missing.', { status: 500 });
  }
  if (!env.BLOCKS_BUCKET) {
    console.error('BLOCKS_BUCKET binding is missing. Please ensure your wrangler.toml includes an R2 bucket binding named BLOCKS_BUCKET.');
    return new Response('Internal Server Error: BLOCKS_BUCKET binding is missing.', { status: 500 });
  }

  // Handle image and attachment requests for backward compatibility
  if (path.startsWith('/images/') || path.startsWith('/attachments/')) {
    const objectKey = path.substring(1); // Remove leading slash
    const r2Object = await env.R2_BUCKET.get(objectKey);

    if (r2Object === null) {
      return new Response('Not Found', { status: 404 });
    }

    const headers = new Headers();
    r2Object.writeHttpMetadata(headers);
    headers.set('etag', r2Object.httpEtag);

    return new Response(r2Object.body, {
      headers,
    });
  }

  // Handle API routes
  switch (path) {
    case '/verify':
      return handleVerify(request, env);
    case '/upload':
      return handleUpload(request, env);
    case '/data':
      return handleApiData(request, env);
    case '/add_todo':
      return handleAddTodo(request, env);
    case '/update_todo':
      return handleUpdateTodo(request, env);
    case '/update_todo_text':
      return handleUpdateTodoText(request, env);
    case '/delete_todo':
      return handleDeleteTodo(request, env);
    case '/add_user':
      return handleCreateUser(request, env);
    case '/delete_user':
      return handleDeleteUser(request, env);
    case '/add_item':
      return handleAddItem(request, env);
    case '/delete_item':
      return handleDeleteItem(request, env);
    case '/update_item_name':
      return handleUpdateItemName(request, env);
    case '/transfer_item':
      return handleTransferItem(request, env);
    case '/return_item':
      return handleReturnItem(request, env);
    case '/restore_todo':
      return handleRestoreTodo(request, env);
    case '/restore_item':
      return handleRestoreItem(request, env);
    case '/add_progress':
      return handleAddProgress(request, env);
    case '/update_progress':
      return handleUpdateProgress(request, env);
    case '/delete_progress':
      return handleDeleteProgress(request, env);
    case '/restore_progress':
      return handleRestoreProgress(request, env);
    default:
      return new Response('API Not Found', { status: 404 });
  }
}
