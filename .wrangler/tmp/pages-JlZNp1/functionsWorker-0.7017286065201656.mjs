var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/[[path]].js
var SHARE_LINKS_KEY = "admin:share_links";
var DELETED_TODOS_KEY = "system:deleted_todos";
var KEPT_ITEMS_KEY = "system:kept_items";
var DELETED_ITEMS_KEY = "system:deleted_items";
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest("SHA-266", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashPassword, "hashPassword");
var getKvKey = /* @__PURE__ */ __name((userId) => `todos:${userId}`, "getKvKey");
async function compressImage(file) {
  return file.stream();
}
__name(compressImage, "compressImage");
async function loadTodos(env, key) {
  try {
    const r2Object = await env.R2_BUCKET.get(key);
    if (r2Object === null) return [];
    return await r2Object.json();
  } catch (error) {
    console.error(`Error loading or parsing todos for key ${key}:`, error);
    if (env.DEBUG) throw error;
    return [];
  }
}
__name(loadTodos, "loadTodos");
async function saveTodos(env, key, todos) {
  await env.R2_BUCKET.put(key, JSON.stringify(todos));
}
__name(saveTodos, "saveTodos");
async function loadShareLinks(env) {
  try {
    const r2Object = await env.R2_BUCKET.get(SHARE_LINKS_KEY);
    if (r2Object === null) return {};
    return await r2Object.json();
  } catch (error) {
    console.error("Error loading share links:", error);
    if (env.DEBUG) throw error;
    return {};
  }
}
__name(loadShareLinks, "loadShareLinks");
async function saveShareLinks(env, links) {
  await env.R2_BUCKET.put(SHARE_LINKS_KEY, JSON.stringify(links));
}
__name(saveShareLinks, "saveShareLinks");
async function loadDeletedTodos(env) {
  try {
    const r2Object = await env.R2_BUCKET.get(DELETED_TODOS_KEY);
    if (r2Object === null) return [];
    return await r2Object.json();
  } catch (error) {
    console.error("Error loading deleted todos:", error);
    if (env.DEBUG) throw error;
    return [];
  }
}
__name(loadDeletedTodos, "loadDeletedTodos");
async function saveDeletedTodos(env, todos) {
  await env.R2_BUCKET.put(DELETED_TODOS_KEY, JSON.stringify(todos));
}
__name(saveDeletedTodos, "saveDeletedTodos");
async function loadKeptItems(env) {
  try {
    const r2Object = await env.R2_BUCKET.get(KEPT_ITEMS_KEY);
    if (r2Object === null) return [];
    return await r2Object.json();
  } catch (error) {
    console.error("Error loading kept items:", error);
    if (env.DEBUG) throw error;
    return [];
  }
}
__name(loadKeptItems, "loadKeptItems");
async function saveKeptItems(env, items) {
  await env.R2_BUCKET.put(KEPT_ITEMS_KEY, JSON.stringify(items));
}
__name(saveKeptItems, "saveKeptItems");
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
__name(loadDeletedItems, "loadDeletedItems");
async function saveDeletedItems(env, items) {
  await env.R2_BUCKET.put(DELETED_ITEMS_KEY, JSON.stringify(items));
}
__name(saveDeletedItems, "saveDeletedItems");
async function getAllUsersTodos(env) {
  const listResponse = await env.R2_BUCKET.list({ prefix: "todos:" });
  const keys = listResponse.objects.map((k) => k.key);
  let allTodos = [];
  for (const key of keys) {
    const ownerId = key.substring(6);
    const userTodos = await loadTodos(env, key);
    allTodos.push(...userTodos.map((todo) => ({ ...todo, ownerId })));
  }
  allTodos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return allTodos;
}
__name(getAllUsersTodos, "getAllUsersTodos");
async function handleAddTodo(request, env) {
  const referer = request.headers.get("Referer");
  let creatorId = "admin";
  if (referer) {
    const refererPath = new URL(referer).pathname.substring(1).split("/")[0].toLowerCase();
    const shareLinks = await loadShareLinks(env);
    if (shareLinks[refererPath]) {
      creatorId = shareLinks[refererPath].username;
    }
  }
  const formData = await request.formData();
  const text = formData.get("text");
  const imageFile = formData.get("image");
  let ownerIds = formData.getAll("userIds");
  if (!text) {
    return new Response('Missing "text" in form data', { status: 400 });
  }
  if (ownerIds.length === 0) {
    ownerIds.push("public");
  }
  let imageUrl = null;
  if (imageFile && imageFile.size > 0) {
    const compressedImage = await compressImage(imageFile);
    const imageId = crypto.randomUUID();
    const extension = imageFile.name.split(".").pop();
    const imageKey = `images/${imageId}.${extension}`;
    await env.R2_BUCKET.put(imageKey, compressedImage, { httpMetadata: { contentType: imageFile.type } });
    imageUrl = `/api/${imageKey}`;
  }
  const newTodo = {
    id: crypto.randomUUID(),
    text,
    completed: false,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    creatorId,
    imageUrl,
    activityLog: [{
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      actorId: creatorId,
      action: "create",
      details: { text }
    }],
    progressUpdates: []
  };
  for (const ownerId of ownerIds) {
    const kvKey = getKvKey(ownerId);
    const todos = await loadTodos(env, kvKey);
    todos.push(newTodo);
    await saveTodos(env, kvKey, todos);
  }
  return new Response(JSON.stringify({ success: true, todo: newTodo }), { status: 200, headers: { "Content-Type": "application/json" } });
}
__name(handleAddTodo, "handleAddTodo");
async function handleUpdateTodo(request, env) {
  const { id, completed, ownerId } = await request.json();
  if (!id || completed === void 0 || !ownerId) {
    return new Response(JSON.stringify({ error: "Missing 'id', 'completed', or 'ownerId'" }), { status: 400 });
  }
  const referer = request.headers.get("Referer");
  let completerId = "admin";
  if (referer) {
    const refererPath = new URL(referer).pathname.substring(1).split("/")[0].toLowerCase();
    const shareLinks = await loadShareLinks(env);
    if (shareLinks[refererPath]) {
      completerId = shareLinks[refererPath].username;
    }
  }
  const kvKey = getKvKey(ownerId);
  const todos = await loadTodos(env, kvKey);
  const todoIndex = todos.findIndex((t) => t.id === id);
  if (todoIndex !== -1) {
    const oldStatus = todos[todoIndex].completed;
    const newStatus = Boolean(completed);
    if (!todos[todoIndex].activityLog) {
      todos[todoIndex].activityLog = [];
    }
    if (oldStatus !== newStatus) {
      todos[todoIndex].activityLog.push({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        actorId: completerId,
        action: "update_status",
        details: { from: oldStatus, to: newStatus }
      });
    }
    todos[todoIndex].completed = newStatus;
    if (newStatus) {
      todos[todoIndex].completedAt = (/* @__PURE__ */ new Date()).toISOString();
      todos[todoIndex].completedBy = completerId;
    }
    await saveTodos(env, kvKey, todos);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } else {
    return new Response(JSON.stringify({ error: "Todo not found" }), { status: 404 });
  }
}
__name(handleUpdateTodo, "handleUpdateTodo");
async function handleDeleteTodo(request, env) {
  const { id, ownerId } = await request.json();
  if (!id || !ownerId) {
    return new Response(JSON.stringify({ error: "Missing 'id' or 'ownerId'" }), { status: 400 });
  }
  const referer = request.headers.get("Referer");
  let deleterId = "admin";
  if (referer) {
    const refererPath = new URL(referer).pathname.substring(1).split("/")[0].toLowerCase();
    const shareLinks = await loadShareLinks(env);
    if (shareLinks[refererPath]) {
      deleterId = shareLinks[refererPath].username;
    }
  }
  const kvKey = getKvKey(ownerId);
  let todos = await loadTodos(env, kvKey);
  const todoIndex = todos.findIndex((t) => t.id === id);
  if (todoIndex !== -1) {
    if (!todos[todoIndex].activityLog) {
      todos[todoIndex].activityLog = [];
    }
    todos[todoIndex].activityLog.push({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      actorId: deleterId,
      action: "delete",
      details: {}
    });
    const todoToDelete = todos[todoIndex];
    todos.splice(todoIndex, 1);
    await saveTodos(env, kvKey, todos);
    const deletedTodo = {
      ...todoToDelete,
      ownerId,
      deletedAt: (/* @__PURE__ */ new Date()).toISOString(),
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
__name(handleDeleteTodo, "handleDeleteTodo");
async function handleCreateUser(request, env) {
  const formData = await request.formData();
  const username = formData.get("username")?.toLowerCase();
  if (!username) {
    return new Response("Username is required", { status: 400 });
  }
  const shareLinks = await loadShareLinks(env);
  const newToken = crypto.randomUUID().substring(0, 8);
  const defaultPassword = "112233";
  const hashedPassword = await hashPassword(defaultPassword);
  shareLinks[newToken] = {
    username,
    password: hashedPassword,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  await saveShareLinks(env, shareLinks);
  return new Response(JSON.stringify({ success: true, token: newToken, username }), { status: 200, headers: { "Content-Type": "application/json" } });
}
__name(handleCreateUser, "handleCreateUser");
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
__name(handleDeleteUser, "handleDeleteUser");
async function handleAddItem(request, env) {
  const referer = request.headers.get("Referer");
  const formData = await request.formData();
  const name = formData.get("name");
  const keepers = formData.getAll("keepers");
  const imageFile = formData.get("image");
  const todoId = formData.get("todoId");
  if (!name || keepers.length === 0) {
    return new Response('Missing "name" or "keepers" in form data', { status: 400 });
  }
  let creatorId = "admin";
  if (referer) {
    const refererPath = new URL(referer).pathname.substring(1).split("/")[0].toLowerCase();
    const shareLinks = await loadShareLinks(env);
    if (shareLinks[refererPath]) {
      creatorId = shareLinks[refererPath].username;
    }
  }
  let imageUrl = null;
  if (imageFile && imageFile.size > 0) {
    const compressedImage = await compressImage(imageFile);
    const imageId = crypto.randomUUID();
    const extension = imageFile.name.split(".").pop();
    const imageKey = `images/${imageId}.${extension}`;
    await env.R2_BUCKET.put(imageKey, compressedImage, { httpMetadata: { contentType: imageFile.type } });
    imageUrl = `/api/${imageKey}`;
  }
  const newItem = {
    id: crypto.randomUUID(),
    name,
    todoId: todoId || null,
    imageUrl,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    keepers: [{
      userIds: keepers,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      transferredBy: creatorId
    }]
  };
  const keptItems = await loadKeptItems(env);
  keptItems.push(newItem);
  await saveKeptItems(env, keptItems);
  return new Response(JSON.stringify({ success: true, item: newItem }), { status: 200, headers: { "Content-Type": "application/json" } });
}
__name(handleAddItem, "handleAddItem");
async function handleDeleteItem(request, env) {
  const { id } = await request.json();
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing 'id'" }), { status: 400 });
  }
  const referer = request.headers.get("Referer");
  let deleterId = "admin";
  if (referer) {
    const refererPath = new URL(referer).pathname.substring(1).split("/")[0].toLowerCase();
    const shareLinks = await loadShareLinks(env);
    if (shareLinks[refererPath]) {
      deleterId = shareLinks[refererPath].username;
    }
  }
  let keptItems = await loadKeptItems(env);
  const itemIndex = keptItems.findIndex((item) => item.id === id);
  if (itemIndex !== -1) {
    const itemToDelete = keptItems[itemIndex];
    keptItems.splice(itemIndex, 1);
    await saveKeptItems(env, keptItems);
    const deletedItem = {
      ...itemToDelete,
      deletedAt: (/* @__PURE__ */ new Date()).toISOString(),
      deletedBy: deleterId
    };
    const deletedItems = await loadDeletedItems(env);
    deletedItems.push(deletedItem);
    await saveDeletedItems(env, deletedItems);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } else {
    return new Response(JSON.stringify({ error: "Item not found" }), { status: 404 });
  }
}
__name(handleDeleteItem, "handleDeleteItem");
async function handleTransferItem(request, env) {
  const referer = request.headers.get("Referer");
  const formData = await request.formData();
  const itemId = formData.get("itemId");
  const newKeepers = formData.getAll("newKeepers");
  if (!itemId || newKeepers.length === 0) {
    return new Response("Missing itemId or newKeepers in form data", { status: 400 });
  }
  let transferrerId = "admin";
  if (referer) {
    const refererPath = new URL(referer).pathname.substring(1).split("/")[0].toLowerCase();
    const shareLinks = await loadShareLinks(env);
    if (shareLinks[refererPath]) {
      transferrerId = shareLinks[refererPath].username;
    }
  }
  const keptItems = await loadKeptItems(env);
  const itemIndex = keptItems.findIndex((item2) => item2.id === itemId);
  if (itemIndex === -1) {
    return new Response("Item not found", { status: 404 });
  }
  const item = keptItems[itemIndex];
  const isNewDataModel = item.keepers && typeof item.keepers[0] === "object";
  if (isNewDataModel) {
    item.keepers.push({
      userIds: newKeepers,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      transferredBy: transferrerId
    });
  } else {
    const oldKeepers = item.keepers;
    item.keepers = [
      {
        userIds: oldKeepers,
        timestamp: item.createdAt,
        transferredBy: "unknown"
      },
      {
        userIds: newKeepers,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        transferredBy: transferrerId
      }
    ];
  }
  await saveKeptItems(env, keptItems);
  return new Response(JSON.stringify({ success: true }), { status: 200 });
}
__name(handleTransferItem, "handleTransferItem");
async function handleUpdateTodoText(request, env) {
  const { id, text, ownerId } = await request.json();
  if (!id || !text || !ownerId) {
    return new Response(JSON.stringify({ error: "Missing 'id', 'text', or 'ownerId'" }), { status: 400 });
  }
  const kvKey = getKvKey(ownerId);
  const todos = await loadTodos(env, kvKey);
  const todoIndex = todos.findIndex((t) => t.id === id);
  if (todoIndex !== -1) {
    todos[todoIndex].text = text;
    await saveTodos(env, kvKey, todos);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }
  return new Response(JSON.stringify({ error: "Todo not found" }), { status: 404 });
}
__name(handleUpdateTodoText, "handleUpdateTodoText");
async function handleAddProgressUpdate(request, env) {
  const formData = await request.formData();
  const todoId = formData.get("todoId");
  const ownerId = formData.get("ownerId");
  const text = formData.get("text");
  const imageFile = formData.get("image");
  if (!todoId || !ownerId || !text) {
    return new Response("Missing required fields", { status: 400 });
  }
  let creatorId = "admin";
  const referer = request.headers.get("Referer");
  if (referer) {
    const refererPath = new URL(referer).pathname.substring(1).split("/")[0].toLowerCase();
    const shareLinks = await loadShareLinks(env);
    if (shareLinks[refererPath]) {
      creatorId = shareLinks[refererPath].username;
    }
  }
  let imageUrl = null;
  if (imageFile && imageFile.size > 0) {
    const compressedImage = await compressImage(imageFile);
    const imageId = crypto.randomUUID();
    const extension = imageFile.name.split(".").pop();
    const imageKey = `images/${imageId}.${extension}`;
    await env.R2_BUCKET.put(imageKey, compressedImage, { httpMetadata: { contentType: imageFile.type } });
    imageUrl = `/api/${imageKey}`;
  }
  const newUpdate = {
    id: crypto.randomUUID(),
    text,
    imageUrl,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    creatorId
  };
  const kvKey = getKvKey(ownerId);
  const todos = await loadTodos(env, kvKey);
  const todoIndex = todos.findIndex((t) => t.id === todoId);
  if (todoIndex !== -1) {
    if (!todos[todoIndex].progressUpdates) {
      todos[todoIndex].progressUpdates = [];
    }
    todos[todoIndex].progressUpdates.push(newUpdate);
    await saveTodos(env, kvKey, todos);
    return new Response(JSON.stringify({ success: true, update: newUpdate }), { status: 200 });
  }
  return new Response("Todo not found", { status: 404 });
}
__name(handleAddProgressUpdate, "handleAddProgressUpdate");
async function handleUpdateItemName(request, env) {
  const { id, name } = await request.json();
  if (!id || !name) {
    return new Response(JSON.stringify({ error: "Missing 'id' or 'name'" }), { status: 400 });
  }
  const keptItems = await loadKeptItems(env);
  const itemIndex = keptItems.findIndex((item) => item.id === id);
  if (itemIndex !== -1) {
    keptItems[itemIndex].name = name;
    await saveKeptItems(env, keptItems);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }
  return new Response(JSON.stringify({ error: "Item not found" }), { status: 404 });
}
__name(handleUpdateItemName, "handleUpdateItemName");
async function handleReturnItem(request, env) {
  const referer = request.headers.get("Referer");
  const { id } = await request.json();
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing 'id'" }), { status: 400 });
  }
  let returnerId = "admin";
  if (referer) {
    const refererPath = new URL(referer).pathname.substring(1).split("/")[0].toLowerCase();
    const shareLinks = await loadShareLinks(env);
    if (shareLinks[refererPath]) {
      returnerId = shareLinks[refererPath].username;
    }
  }
  const keptItems = await loadKeptItems(env);
  const itemIndex = keptItems.findIndex((item) => item.id === id);
  if (itemIndex === -1) {
    return new Response("Item not found", { status: 404 });
  }
  keptItems[itemIndex].returnedAt = (/* @__PURE__ */ new Date()).toISOString();
  keptItems[itemIndex].returnedBy = returnerId;
  await saveKeptItems(env, keptItems);
  return new Response(JSON.stringify({ success: true }), { status: 200 });
}
__name(handleReturnItem, "handleReturnItem");
async function handleRestoreTodo(request, env) {
  const { id } = await request.json();
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing 'id'" }), { status: 400 });
  }
  const referer = request.headers.get("Referer");
  let restorerId = "admin";
  if (referer) {
    const refererPath = new URL(referer).pathname.substring(1).split("/")[0].toLowerCase();
    const shareLinks = await loadShareLinks(env);
    if (shareLinks[refererPath]) {
      restorerId = shareLinks[refererPath].username;
    }
  }
  let deletedTodos = await loadDeletedTodos(env);
  const todoIndex = deletedTodos.findIndex((t) => t.id === id);
  if (todoIndex !== -1) {
    const todoToRestore = deletedTodos[todoIndex];
    deletedTodos.splice(todoIndex, 1);
    if (!todoToRestore.activityLog) {
      todoToRestore.activityLog = [];
    }
    todoToRestore.activityLog.push({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      actorId: restorerId,
      action: "restore",
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
__name(handleRestoreTodo, "handleRestoreTodo");
async function handleRestoreItem(request, env) {
  const { id } = await request.json();
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing 'id'" }), { status: 400 });
  }
  let deletedItems = await loadDeletedItems(env);
  const itemIndex = deletedItems.findIndex((item) => item.id === id);
  if (itemIndex !== -1) {
    const itemToRestore = deletedItems[itemIndex];
    deletedItems.splice(itemIndex, 1);
    const { deletedAt, deletedBy, ...restoredItem } = itemToRestore;
    let keptItems = await loadKeptItems(env);
    keptItems.push(restoredItem);
    await saveDeletedItems(env, deletedItems);
    await saveKeptItems(env, keptItems);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } else {
    return new Response(JSON.stringify({ error: "Deleted item not found" }), { status: 404 });
  }
}
__name(handleRestoreItem, "handleRestoreItem");
async function handleLogin(request, env) {
  const { username, password } = await request.json();
  if (!username || !password) {
    return new Response(JSON.stringify({ error: "Missing 'username' or 'password'" }), { status: 400 });
  }
  const shareLinks = await loadShareLinks(env);
  const userToken = Object.keys(shareLinks).find((token) => shareLinks[token].username === username);
  if (userToken) {
    const hashedPassword = await hashPassword(password);
    if (shareLinks[userToken].password === hashedPassword) {
      return new Response(JSON.stringify({ success: true, token: userToken }), { status: 200 });
    }
  }
  return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });
}
__name(handleLogin, "handleLogin");
async function handleApiData(request, env) {
  const url = new URL(request.url);
  const shareLinks = await loadShareLinks(env);
  const isRootView = url.pathname === "/api/data";
  const allTodos = await getAllUsersTodos(env);
  let deletedTodos = await loadDeletedTodos(env);
  const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1e3);
  const recentDeletedTodos = deletedTodos.filter((todo) => new Date(todo.deletedAt) > twentyDaysAgo);
  if (recentDeletedTodos.length < deletedTodos.length) {
    await saveDeletedTodos(env, recentDeletedTodos);
  }
  const keptItems = await loadKeptItems(env);
  let deletedItems = await loadDeletedItems(env);
  const recentDeletedItems = deletedItems.filter((item) => new Date(item.deletedAt) > twentyDaysAgo);
  if (recentDeletedItems.length < deletedItems.length) {
    await saveDeletedItems(env, recentDeletedItems);
  }
  return new Response(JSON.stringify({
    allTodos,
    recentDeletedTodos,
    keptItems,
    recentDeletedItems,
    shareLinks,
    isRootView
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleApiData, "handleApiData");
async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = `/${params.path.join("/")}`;
  console.log("Request path:", path);
  if (!env || !env.R2_BUCKET) {
    console.error("R2_BUCKET binding is missing or env object is undefined. Please ensure your wrangler.toml or Cloudflare Worker settings include an R2 bucket binding named R2_BUCKET.");
    return new Response("Internal Server Error: R2_BUCKET binding is missing or env object is undefined.", { status: 500 });
  }
  if (path.startsWith("/images/")) {
    const imageKey = path.substring(1);
    const r2Object = await env.R2_BUCKET.get(imageKey);
    if (r2Object === null) {
      return new Response("Not Found", { status: 404 });
    }
    const headers = new Headers();
    r2Object.writeHttpMetadata(headers);
    headers.set("etag", r2Object.httpEtag);
    return new Response(r2Object.body, {
      headers
    });
  }
  switch (path) {
    case "/data":
      return handleApiData(request, env);
    case "/login":
      return handleLogin(request, env);
    case "/add_todo":
      return handleAddTodo(request, env);
    case "/update_todo":
      return handleUpdateTodo(request, env);
    case "/update_todo_text":
      return handleUpdateTodoText(request, env);
    case "/add_progress_update":
      return handleAddProgressUpdate(request, env);
    case "/delete_todo":
      return handleDeleteTodo(request, env);
    case "/add_user":
      return handleCreateUser(request, env);
    case "/delete_user":
      return handleDeleteUser(request, env);
    case "/add_item":
      return handleAddItem(request, env);
    case "/delete_item":
      return handleDeleteItem(request, env);
    case "/transfer_item":
      return handleTransferItem(request, env);
    case "/update_item_name":
      return handleUpdateItemName(request, env);
    case "/return_item":
      return handleReturnItem(request, env);
    case "/restore_todo":
      return handleRestoreTodo(request, env);
    case "/restore_item":
      return handleRestoreItem(request, env);
    default:
      return new Response("API Not Found", { status: 404 });
  }
}
__name(onRequest, "onRequest");

// ../.wrangler/tmp/pages-JlZNp1/functionsRoutes-0.746122955899551.mjs
var routes = [
  {
    routePath: "/api/:path*",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest]
  }
];

// ../../home/jules/.npm/_npx/32026684e21afda6/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../home/jules/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");

// ../../home/jules/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../home/jules/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// ../.wrangler/tmp/bundle-3PwJW3/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;

// ../../home/jules/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// ../.wrangler/tmp/bundle-3PwJW3/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=functionsWorker-0.7017286065201656.mjs.map
