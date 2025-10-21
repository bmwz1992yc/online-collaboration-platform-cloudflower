let initialData; // Declare initialData globally
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  const pathToken = window.location.pathname.substring(1).split('/')[0].toLowerCase();

  // A quick fetch to get user data for login, not the full dataset yet.
  const data = await fetch('/api/data').then(res => res.json()).catch(() => ({ shareLinks: {} }));
  const shareLinks = data.shareLinks;

  const isAdminView = !pathToken || !shareLinks[pathToken];

  if (isAdminView) {
    currentUser = 'admin'; // Assuming admin doesn't need a password for this setup
    document.getElementById('login-modal').style.display = 'none';
    initializePage();
  } else {
    currentUser = shareLinks[pathToken].username;
    document.getElementById('login-modal').style.display = 'flex';
  }

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('password-input').value;
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser, password }),
    });

    if (response.ok) {
      document.getElementById('login-modal').style.display = 'none';
      initializePage();
    } else {
      const errorP = document.getElementById('login-error');
      errorP.textContent = '密码错误，请重试。';
      setTimeout(() => errorP.textContent = '', 3000); // Clear error after 3 seconds
    }
  });
});

async function initializePage() {
  lucide.createIcons();
  refreshFsLightbox();

  // Fetch initial data
  initialData = await fetch('/api/data').then(res => res.json());
  const { allTodos, recentDeletedTodos, keptItems, recentDeletedItems, shareLinks, isRootView } = initialData;

  // Hide user management for non-admin users
  if (currentUser !== 'admin') {
    document.querySelector('.card:has(h2:contains("用户管理"))').style.display = 'none';
  }

  // Render Todo User Options
  const todoUserOptionsContainer = document.getElementById('todo-user-options');
  if (todoUserOptionsContainer) {
    const userOptionsHtml = Object.values(shareLinks).map(link => 
      `<label class="flex items-center space-x-2">
          <input type="checkbox" name="userIds" value="${link.username}" class="rounded border-gray-300 text-blue-600 focus:ring-blue-300">
          <span>${getDisplayName(link.username)}</span>
      </label>`
    ).join('');
    todoUserOptionsContainer.insertAdjacentHTML('beforeend', userOptionsHtml);
  }

  // Render Item Keeper Checkboxes
  const itemKeeperCheckboxesContainer = document.getElementById('item-keeper-checkboxes');
  if (itemKeeperCheckboxesContainer) {
    const itemUserOptionsHtml = Object.values(shareLinks).map(link => 
      `<label class="flex items-center space-x-2">
          <input type="checkbox" name="itemUserIds" value="${link.username}" class="rounded border-gray-300 text-purple-600 focus:ring-purple-300">
          <span>${getDisplayName(link.username)}</span>
      </label>`
    ).join('');
    itemKeeperCheckboxesContainer.insertAdjacentHTML('beforeend', itemUserOptionsHtml);
  }

  // Render Item Todo ID Options
  const itemTodoIdSelect = document.getElementById('item-todo-id');
  if (itemTodoIdSelect) {
    const todoOptionsHtml = allTodos.map(todo => `
      <option value="${todo.id}">${todo.text} (由 ${getDisplayName(todo.creatorId)} 创建)</option>
    `).join('');
    itemTodoIdSelect.insertAdjacentHTML('beforeend', todoOptionsHtml);
  }

  // Render All Todos List
  const allTodosList = document.getElementById('all-todos-list');
  if (allTodosList) {
    allTodosList.innerHTML = renderAllTodos(allTodos, keptItems, shareLinks);
  }

  // Render User List
  const userList = document.getElementById('user-list');
  const userCount = document.getElementById('user-count');
  if (userList && userCount) {
    userList.innerHTML = renderUserList(shareLinks);
    userCount.textContent = Object.keys(shareLinks).length;
  }

  // Render Deleted Todos List
  const deletedTodosList = document.getElementById('deleted-todos-list');
  if (deletedTodosList) {
    deletedTodosList.innerHTML = renderDeletedTodos(recentDeletedTodos);
  }

  // Render Kept Items List
  const keptItemsList = document.getElementById('kept-items-list');
  if (keptItemsList) {
    keptItemsList.innerHTML = renderKeptItems(keptItems, shareLinks);
  }

  // Render Deleted Items List
  const deletedItemsList = document.getElementById('deleted-items-list');
  if (deletedItemsList) {
    deletedItemsList.innerHTML = renderDeletedItems(recentDeletedItems);
  }

  // Event Listeners for Forms
  const addItemForm = document.getElementById('add-item-form');
  if (addItemForm) {
    addItemForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('item-name').value;
      const keepers = Array.from(document.querySelectorAll('#item-keeper-checkboxes input[name="itemUserIds"]:checked')).map(cb => cb.value);
      const todoId = document.getElementById('item-todo-id').value;
      const imageFile = document.getElementById('item-image').files[0];

      const formData = new FormData();
      formData.append('name', name);
      keepers.forEach(k => formData.append('keepers', k));
      formData.append('todoId', todoId);
      if (imageFile) {
        formData.append('image', imageFile);
      }

      try {
        const response = await fetch('/api/add_item', {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) throw new Error('添加物品失败');
        window.location.reload();
      } catch (error) {
        console.error("Add item failed:", error);
        alert('添加物品失败，请重试。');
      }
    });
  }

  const transferForm = document.getElementById('transfer-item-form');
  if(transferForm) {
      transferForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const itemId = document.getElementById('transfer-item-id').value;
          const newKeepers = Array.from(transferForm.querySelectorAll('input[name="newKeepers"]:checked')).map(cb => cb.value);

          if (newKeepers.length === 0) {
              alert('请至少选择一位新保管人。');
              return;
          }

          const formData = new FormData();
          formData.append('itemId', itemId);
          newKeepers.forEach(k => formData.append('newKeepers', k));

          try {
              const response = await fetch('/api/transfer_item', {
                  method: 'POST',
                  body: formData,
              });
              if (!response.ok) {
                  const errorText = await response.text();
                  throw new Error('转交失败: ' + errorText);
              }
              window.location.reload();
          } catch (error) {
              console.error("Transfer failed:", error);
              alert(error.message);
          }
      });
  }

  const addTodoForm = document.querySelector('form[action="/api/add_todo"]');
  if (addTodoForm) {
    addTodoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = addTodoForm.querySelector('input[name="text"]').value;
      const imageFile = addTodoForm.querySelector('input[name="image"]').files[0];
      const creatorId = addTodoForm.querySelector('input[name="creatorId"]').value;
      const userIds = Array.from(addTodoForm.querySelectorAll('input[name="userIds"]:checked')).map(cb => cb.value);

      const formData = new FormData();
      formData.append('text', text);
      formData.append('creatorId', creatorId);
      userIds.forEach(id => formData.append('userIds', id));
      if (imageFile) {
        formData.append('image', imageFile);
      }

      try {
        const response = await fetch('/api/add_todo', {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) throw new Error('添加事项失败');
        window.location.reload();
      } catch (error) {
        console.error("Add todo failed:", error);
        alert('添加事项失败，请重试。');
      }
    });
  }

  const addUserForm = document.querySelector('form[action="/api/add_user"]');
  if (addUserForm) {
    addUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = addUserForm.querySelector('input[name="username"]').value;
      const formData = new FormData();
      formData.append('username', username);

      try {
        const response = await fetch('/api/add_user', {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) throw new Error('创建用户失败');
        window.location.reload();
      } catch (error) {
        console.error("Add user failed:", error);
        alert('创建用户失败，请重试。');
      }
    });
  }

  document.querySelectorAll('.add-progress-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const todoId = form.dataset.todoId;
      const ownerId = form.dataset.ownerId;
      const text = form.querySelector('textarea[name="text"]').value;
      const imageFile = form.querySelector('input[name="image"]').files[0];

      const formData = new FormData();
      formData.append('todoId', todoId);
      formData.append('ownerId', ownerId);
      formData.append('text', text);
      if (imageFile) {
        formData.append('image', imageFile);
      }

      await fetch('/api/add_progress_update', {
        method: 'POST',
        body: formData,
      });
      window.location.reload();
    });
  });

  const toggleButton = document.getElementById('toggle-kept-items');
  const keptItemsList = document.getElementById('kept-items-list');
  toggleButton.addEventListener('click', () => {
    const isHidden = keptItemsList.style.display === 'none';
    keptItemsList.style.display = isHidden ? '' : 'none';
    toggleButton.textContent = isHidden ? '折叠' : '展开';
  });
}

// Helper functions (moved from backend)
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

// Frontend rendering functions
function renderAllTodos(allTodos, keptItems, shareLinks) {
  allTodos.sort((a, b) => {
    if (a.completed && !b.completed) return 1;
    if (!a.completed && b.completed) return -1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  if (allTodos.length === 0) {
    return '<p class="text-center text-gray-500 py-10">无任何待办事项。</p>';
  }

  return allTodos.map(todo => {
    const ownerDisplayName = todo.ownerId === 'public' ? '' : getDisplayName(todo.ownerId);
    const ownerInfo = ownerDisplayName ? ` | 指派给: <strong>${ownerDisplayName}</strong>` : '';
    const creatorDisplayName = getDisplayName(todo.creatorId || 'unknown');
    
    let completionInfo = '';
    if (todo.completed) {
      completionInfo = ` | 由 <strong>${getDisplayName(todo.completedBy)}</strong> 在 ${formatDate(todo.completedAt)} 完成`;
    } else if (todo.completedAt) {
      completionInfo = ` | (上次由 <strong>${getDisplayName(todo.completedBy)}</strong> 在 ${formatDate(todo.completedAt)} 完成)`;
    }

    const imageUrlHtml = todo.imageUrl ? `<a data-fslightbox href="${todo.imageUrl}"><img src="${todo.imageUrl}" alt="Todo Image" class="w-16 h-16 object-cover rounded-md mr-4"></a>` : '';

    const formatActivity = (logEntry) => {
      const actor = `<strong>${getDisplayName(logEntry.actorId)}</strong>`;
      const time = formatDate(logEntry.timestamp);
      switch (logEntry.action) {
        case 'create':
          return `<li>${time}: ${actor} 创建了此任务。</li>`;
        case 'update_status':
          const from = logEntry.details.from ? "已完成" : "未完成";
          const to = logEntry.details.to ? "已完成" : "未完成";
          return `<li>${time}: ${actor} 将状态从 <strong>${from}</strong> 更新为 <strong>${to}</strong>。</li>`;
        case 'delete':
           return `<li>${time}: ${actor} 删除了此任务。</li>`;
        default:
          return `<li>${time}: 未知操作。</li>`;
      }
    };

    let activityLogHtml = '';
    if (todo.activityLog && todo.activityLog.length > 0) {
      activityLogHtml = `
        <div class="mt-4 pt-2 border-t border-gray-200">
          <details>
            <summary class="cursor-pointer text-sm font-semibold text-gray-600">操作历史</summary>
            <ul class="mt-2 pl-5 text-xs text-gray-500 list-disc space-y-1">
              ${todo.activityLog.slice().reverse().map(formatActivity).join('')}
            </ul>
          </details>
        </div>
      `;
    }

    const associatedItems = keptItems.filter(item => item.todoId === todo.id);
    const associatedItemsHtml = associatedItems.map(item => {
        const isNewDataModel = item.keepers && typeof item.keepers[0] === 'object';
        let itemHtml = '';

        if (isNewDataModel) {
            const currentKeeperInfo = item.keepers[item.keepers.length - 1];
            const keepersDisplay = currentKeeperInfo.userIds.map(getDisplayName).join(', ');
            const transferHistoryHtml = item.keepers.length > 1 ? `
                <ul class="text-xs text-gray-500 mt-2 pl-5 list-disc">
                    ${item.keepers.slice(0, -1).reverse().map(log => `
                        <li>${log.userIds.map(getDisplayName).join(', ')} (于 ${formatDate(log.timestamp)} 由 ${getDisplayName(log.transferredBy)} 转交)</li>
                    `).join('')}
                </ul>
            ` : '';
            const itemImageUrlHtml = item.imageUrl ? `<a data-fslightbox href="${item.imageUrl}"><img src="${item.imageUrl}" alt="Item Image" class="w-12 h-12 object-cover rounded-md mr-3"></a>` : '';

            const creator = getDisplayName(item.keepers[0].transferredBy);
            const createdAt = formatDate(item.createdAt);
            const returnInfo = item.returnedAt ? `<div class="meta-info">由 <strong>${getDisplayName(item.returnedBy)}</strong> 在 ${formatDate(item.returnedAt)} 归还</div>` : '';
            itemHtml = `
            <div class="flex-grow">
              <label class="font-semibold text-gray-700 ${item.returnedAt ? 'line-through' : ''}">${item.name}</label>
              <div class="meta-info">由 <strong>${creator}</strong> 在 ${createdAt} 创建</div>
              <div class="meta-info">当前保管人: <strong>${keepersDisplay}</strong> (自 ${formatDate(currentKeeperInfo.timestamp)})</div>
              ${transferHistoryHtml}
              ${returnInfo}
            </div>
            <div class="flex flex-col space-y-1 ml-2">
                <button class="bg-yellow-500 text-white px-2 py-1 text-xs rounded" onclick="showEditItemModal('${item.id}', '${item.name}')">编辑</button>
                <button class="bg-blue-500 text-white px-2 py-1 text-xs rounded" onclick="showTransferModal('${item.id}')">转交</button>
                <button class="bg-green-500 text-white px-2 py-1 text-xs rounded" onclick="returnItem('${item.id}')" ${item.returnedAt ? 'disabled' : ''}>归还</button>
                <button class="delete-btn" style="padding: 2px 6px; font-size: 12px;" onclick="deleteItem('${item.id}')">删除</button>
            </div>
            `;
        } else {
            const keepersDisplay = Array.isArray(item.keepers) ? item.keepers.map(getDisplayName).join(', ') : '';
            itemHtml = `
              <div class="flex-grow">
                <label class="font-semibold text-gray-700">${item.name}</label>
                <div class="meta-info">保管人: <strong>${keepersDisplay}</strong></div>
                <div class="text-xs text-red-500">注意: 此物品为旧数据格式。请转交一次以更新。</div>
              </div>
            <div class="flex flex-col space-y-1 ml-2">
                <button class="bg-yellow-500 text-white px-2 py-1 text-xs rounded" onclick="showEditItemModal('${item.id}', '${item.name}')">编辑</button>
                <button class="bg-blue-500 text-white px-2 py-1 text-xs rounded" onclick="showTransferModal('${item.id}')">转交</button>
                <button class="bg-green-500 text-white px-2 py-1 text-xs rounded" onclick="returnItem('${item.id}')" ${item.returnedAt ? 'disabled' : ''}>归还</button>
                <button class="delete-btn" style="padding: 2px 6px; font-size: 12px;" onclick="deleteItem('${item.id}')">删除</button>
            </div>
            `;
        }

        const itemImageUrlHtml = item.imageUrl ? `<a data-fslightbox href="${item.imageUrl}"><img src="${item.imageUrl}" alt="Item Image" class="w-12 h-12 object-cover rounded-md mr-3"></a>` : '';
        return `
          <div data-id="${item.id}" class="flex items-start" style="padding-left: 60px; padding-top: 10px;">
            <i data-lucide="package" class="w-4 h-4 text-purple-600 mr-2 mt-1"></i>
            ${itemImageUrlHtml}
            ${itemHtml}
          </div>
        `;
    }).join('');

    return `
    <li data-id="${todo.id}" data-owner="${todo.ownerId}" class="p-4 bg-white rounded-lg shadow-sm ${todo.completed ? 'completed' : ''}">
      <div class="flex items-center">
        <input type="checkbox" id="todo-${todo.id}" ${todo.completed ? 'checked' : ''} onchange="toggleTodo('${todo.id}', this.checked, '${todo.ownerId}')" class="mr-4 w-6 h-6 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500">
        ${imageUrlHtml}
        <div class="flex-grow">
          <label for="todo-${todo.id}" class="text-2xl font-medium text-gray-800">${todo.text}</label>
          <div class="meta-info text-sm text-gray-500">由 <strong>${creatorDisplayName}</strong> 在 ${formatDate(todo.createdAt)} 创建${ownerInfo}${completionInfo}</div>
        </div>
        <div class="flex items-center space-x-2 ml-auto">
          <button class="edit-btn bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg text-sm" onclick="showEditTodoModal('${todo.id}', '${todo.text}', '${todo.ownerId}')">
            编辑
          </button>
          <button class="delete-btn bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg text-sm" onclick="deleteTodo('${todo.id}', '${todo.ownerId}')">
            删除
          </button>
        </div>
      </div>
      ${associatedItemsHtml ? `<div class="w-full mt-2">${associatedItemsHtml}</div>` : ''}
      ${activityLogHtml}
      <div class="progress-updates mt-4 pt-4 border-t">
        <h4 class="text-md font-semibold mb-2">进度更新</h4>
        <div id="progress-list-${todo.id}" class="space-y-4">
          ${(todo.progressUpdates || []).map(update => `
            <div class="flex items-start">
              ${update.imageUrl ? `<a data-fslightbox href="${update.imageUrl}"><img src="${update.imageUrl}" alt="Progress Image" class="w-16 h-16 object-cover rounded-md mr-4"></a>` : ''}
              <div class="flex-grow">
                <p class="text-gray-800">${update.text}</p>
                <div class="text-xs text-gray-500 mt-1">由 <strong>${getDisplayName(update.creatorId)}</strong> 在 ${formatDate(update.createdAt)} 添加</div>
              </div>
            </div>
          `).join('')}
        </div>
        <form class="add-progress-form mt-4" data-todo-id="${todo.id}" data-owner-id="${todo.ownerId}">
          <textarea name="text" placeholder="添加进度更新..." class="w-full p-2 border rounded-lg" required></textarea>
          <input type="file" name="image" accept="image/*" class="w-full text-sm border rounded-lg p-1 mt-2">
          <button type="submit" class="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg mt-2">添加更新</button>
        </form>
      </div>
    </li>
  `}).join('');
}

function renderDeletedTodos(deletedTodos) {
  if (deletedTodos.length === 0) {
    return '<p class="text-center py-10">无已删除事项。</p>';
  }
  return deletedTodos.sort((a,b) => new Date(b.deletedAt) - new Date(a.deletedAt)).map(todo => {
      const ownerDisplayName = todo.ownerId === 'public' ? '' : getDisplayName(todo.ownerId);
      const ownerInfo = ownerDisplayName ? ` | 指派给: <strong>${ownerDisplayName}</strong>` : '';
      const creatorDisplayName = getDisplayName(todo.creatorId || 'unknown');
      const completionInfo = todo.completed ? ` | 由 <strong>${getDisplayName(todo.completedBy)}</strong> 在 ${formatDate(todo.completedAt)} 完成` : '';
      const deletionInfo = ` | 由 <strong>${getDisplayName(todo.deletedBy)}</strong> 在 ${formatDate(todo.deletedAt)} 删除`;

      return `
      <li class="todo-item opacity-60 flex justify-between items-center">
        <div>
          <label class="${todo.completed ? 'line-through' : ''}">${todo.text}</label>
          <div class="meta-info">由 <strong>${creatorDisplayName}</strong> 在 ${formatDate(todo.createdAt)} 创建${ownerInfo}${completionInfo}${deletionInfo}</div>
        </div>
        <button class="bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-3 rounded-lg text-sm" onclick="restoreTodo('${todo.id}')">
          还原
        </button>
      </li>
      `;
  }).join('');
}

function renderKeptItems(keptItems, shareLinks) {
  if (keptItems.length === 0) {
    return '<p class="text-center py-4">无任何交接物品。</p>';
  }
  keptItems.sort((a, b) => {
    if (a.returnedAt && !b.returnedAt) return 1;
    if (!a.returnedAt && b.returnedAt) return -1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return keptItems.map(item => {
    const isNewDataModel = item.keepers && typeof item.keepers[0] === 'object';
    let itemHtml = '';

    if (isNewDataModel) {
        const currentKeeperInfo = item.keepers[item.keepers.length - 1];
        const keepersDisplay = currentKeeperInfo.userIds.map(getDisplayName).join(', ');
        const transferHistoryHtml = item.keepers.length > 1 ? `
            <ul class="text-xs text-gray-500 mt-2 pl-5 list-disc">
                ${item.keepers.slice(0, -1).reverse().map(log => `
                    <li>${log.userIds.map(getDisplayName).join(', ')} (于 ${formatDate(log.timestamp)} 由 ${getDisplayName(log.transferredBy)} 转交)</li>
                `).join('')}
            </ul>
        ` : '';
        const creator = getDisplayName(item.keepers[0].transferredBy);
        const createdAt = formatDate(item.createdAt);
        const returnInfo = item.returnedAt ? `<div class="meta-info">由 <strong>${getDisplayName(item.returnedBy)}</strong> 在 ${formatDate(item.returnedAt)} 归还</div>` : '';

        itemHtml = `
            <div class="flex-grow ${item.returnedAt ? 'opacity-50' : ''}">
              <label class="font-semibold text-gray-700 ${item.returnedAt ? 'line-through' : ''}">${item.name}</label>
              <div class="meta-info">由 <strong>${creator}</strong> 在 ${createdAt} 创建</div>
              <div class="meta-info">当前保管人: <strong>${keepersDisplay}</strong> (自 ${formatDate(currentKeeperInfo.timestamp)})</div>
              ${transferHistoryHtml}
              ${returnInfo}
            </div>
            <div class="flex flex-col space-y-1 ml-2">
                <button class="bg-yellow-500 text-white px-2 py-1 text-xs rounded" onclick="showEditItemModal('${item.id}', '${item.name}')">编辑</button>
                <button class="bg-blue-500 text-white px-2 py-1 text-xs rounded" onclick="showTransferModal('${item.id}')">转交</button>
                <button class="bg-green-500 text-white px-2 py-1 text-xs rounded" onclick="returnItem('${item.id}')" ${item.returnedAt ? 'disabled' : ''}>归还</button>
                <button class="delete-btn" style="padding: 2px 6px; font-size: 12px;" onclick="deleteItem('${item.id}')">删除</button>
            </div>
        `;
    } else {
        const keepersDisplay = Array.isArray(item.keepers) ? item.keepers.map(getDisplayName).join(', ') : '';
        itemHtml = `
            <div class="flex-grow">
              <label class="font-semibold text-gray-700">${item.name}</label>
              <div class="meta-info">保管人: <strong>${keepersDisplay}</strong></div>
              <div class="text-xs text-red-500">注意: 此物品为旧数据格式。请转交一次以更新。</div>
            </div>
            <div class="flex flex-col space-y-1 ml-2">
                <button class="bg-yellow-500 text-white px-2 py-1 text-xs rounded" onclick="showEditItemModal('${item.id}', '${item.name}')">编辑</button>
                <button class="bg-blue-500 text-white px-2 py-1 text-xs rounded" onclick="showTransferModal('${item.id}')">转交</button>
                <button class="delete-btn" style="padding: 2px 6px; font-size: 12px;" onclick="deleteItem('${item.id}')">删除</button>
            </div>
        `;
    }

    const imageUrlHtml = item.imageUrl ? `<a data-fslightbox href="${item.imageUrl}"><img src="${item.imageUrl}" alt="Item Image" class="w-16 h-16 object-cover rounded-md mr-4"></a>` : '';
    return `
      <li data-id="${item.id}" class="p-4 bg-white rounded-lg shadow-sm flex items-start">
        ${imageUrlHtml}
        ${itemHtml}
      </li>
    `;
  }).join('');
}

function renderDeletedItems(deletedItems) {
  if (deletedItems.length === 0) {
    return '<p class="text-center py-4">无已删除物品。</p>';
  }
  return deletedItems.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt)).map(item => {
    const creator = getDisplayName(item.keepers[0].transferredBy);
    const createdAt = formatDate(item.createdAt);
    const deleter = getDisplayName(item.deletedBy);
    const deletedAt = formatDate(item.deletedAt);

    return `
      <li class="todo-item opacity-60 flex justify-between items-center">
        <div>
          <label class="line-through">${item.name}</label>
          <div class="meta-info">由 <strong>${creator}</strong> 在 ${createdAt} 创建</div>
          <div class="meta-info">由 <strong>${deleter}</strong> 在 ${deletedAt} 删除</div>
        </div>
        <button class="bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-3 rounded-lg text-sm" onclick="restoreItem('${item.id}')">
          还原
        </button>
      </li>
    `;
  }).join('');
}

function renderUserList(shareLinks) {
  const linkItems = Object.entries(shareLinks).map(([token, data]) => `
    <li class="flex justify-between items-center py-2 border-b">
      <div>
        <p class="font-medium text-gray-800">${getDisplayName(data.username)}</p>
        <a href="/${token}" class="text-sm text-blue-600 hover:underline" target="_blank">${window.location.origin}/${token}</a>
      </div>
      <button class="ml-4 delete-link-btn" onclick="deleteUser('${token}')">删除用户</button>
    </li>
  `).join('');
  return linkItems || '<li class="text-gray-400">暂无用户。</li>';
}

// API functions

async function toggleTodo(id, completed, ownerId) {
  try {
    const response = await fetch('/api/update_todo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, completed, ownerId }),
    });
    if (!response.ok) throw new Error('更新待办事项失败');
    window.location.reload();
  } catch (error) {
    console.error("Update todo failed:", error);
    alert('更新待办事项失败，请重试。');
  }
}

async function deleteTodo(id, ownerId) {
  if (!confirm('确定要删除此事项吗？')) return;
  try {
    const response = await fetch('/api/delete_todo', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ownerId }),
    });
    if (!response.ok) throw new Error('删除事项失败');
    window.location.reload();
  } catch (error) {
    console.error("Delete todo failed:", error);
    alert('删除事项失败，请重试。');
  }
}

async function deleteUser(token) {
  if (!confirm('确定要删除此用户吗？这将删除所有关联的待办事项。')) return;
  try {
    const response = await fetch('/api/delete_user', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) throw new Error('删除用户失败');
    window.location.reload();
  } catch (error) {
    console.error("Delete user failed:", error);
    alert('删除用户失败，请重试。');
  }
}

async function deleteItem(id) {
  if (!confirm('确定要删除此保管物品吗？')) return;
  try {
    const response = await fetch('/api/delete_item', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) throw new Error('删除物品失败');
    window.location.reload();
  } catch (error) {
    console.error("Delete item failed:", error);
    alert('删除物品失败，请重试。');
  }
}

async function returnItem(id) {
  if (!confirm('确定要归还此物品吗？')) return;
  try {
    const response = await fetch('/api/return_item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) throw new Error('归还物品失败');
    window.location.reload();
  } catch (error) {
    console.error("Return item failed:", error);
    alert('归还物品失败，请重试。');
  }
}

async function restoreTodo(id) {
  if (!confirm('确定要还原此事项吗？')) return;
  try {
    const response = await fetch('/api/restore_todo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) throw new Error('还原失败');
    window.location.reload();
  } catch (error) {
    console.error("Restore failed:", error);
    alert('还原失败，请重试。');
  }
}

async function restoreItem(id) {
  if (!confirm('确定要还原此物品吗？')) return;
  try {
    const response = await fetch('/api/restore_item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) throw new Error('还原物品失败');
    window.location.reload();
  } catch (error) {
    console.error("Restore item failed:", error);
    alert('还原物品失败，请重试。');
  }
}

function showTransferModal(itemId) {
    const modal = document.getElementById('transfer-modal');
    document.getElementById('transfer-item-id').value = itemId;

    const container = document.getElementById('transfer-keeper-checkboxes');
    container.innerHTML = ''; // Clear old checkboxes

    const allUsers = Object.values(initialData.shareLinks).map(l => l.username);
    allUsers.push('public');

    allUsers.forEach(user => {
        const label = document.createElement('label');
        label.className = 'flex items-center space-x-2';
        label.innerHTML = '<input type="checkbox" name="newKeepers" value="' + user + '" class="rounded border-gray-300 text-blue-600 focus:ring-blue-300">' +
            '<span>' + (user === 'admin' ? 'yc' : user) + '</span>';
        container.appendChild(label);
    });

    modal.style.display = 'flex';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = 'none';
}

function showEditTodoModal(id, text, ownerId) {
    document.getElementById('edit-todo-id').value = id;
    document.getElementById('edit-todo-text').value = text;
    document.getElementById('edit-todo-owner').value = ownerId;
    document.getElementById('edit-todo-modal').style.display = 'flex';
}

function showEditItemModal(id, name) {
    document.getElementById('edit-item-id').value = id;
    document.getElementById('edit-item-name').value = name;
    document.getElementById('edit-item-modal').style.display = 'flex';
}

document.getElementById('edit-todo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-todo-id').value;
    const text = document.getElementById('edit-todo-text').value;
    const ownerId = document.getElementById('edit-todo-owner').value;

    await fetch('/api/update_todo_text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, text, ownerId }),
    });
    window.location.reload();
});

document.getElementById('edit-item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-item-id').value;
    const name = document.getElementById('edit-item-name').value;

    await fetch('/api/update_item_name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
    });
    window.location.reload();
});
