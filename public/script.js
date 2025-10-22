let initialData; // Declare initialData globally

document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  refreshFsLightbox();

  // Fetch initial data
  initialData = await fetch('/api/data').then(res => res.json());
  const { allTodos, recentDeletedTodos, keptItems, recentDeletedItems, shareLinks, isRootView } = initialData;

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

  // Render Deleted Progress List
  const deletedProgressList = document.getElementById('deleted-progress-list');
  if (deletedProgressList) {
    deletedProgressList.innerHTML = renderDeletedProgress(initialData.recentDeletedProgress || []);
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
        await refreshDataAndRender();
        // Clear the form
        e.target.reset();
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
              closeTransferModal();
              await refreshDataAndRender();
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
        await refreshDataAndRender();
        e.target.reset();
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
        await refreshDataAndRender();
        e.target.reset();
      } catch (error) {
        console.error("Add user failed:", error);
        alert('创建用户失败，请重试。');
      }
    });
  }

  // Finalize UI
  lucide.createIcons();
  refreshFsLightbox();
});

// Helper functions (moved from backend)
async function refreshDataAndRender() {
  try {
    // 1. Fetch latest data
    const newData = await fetch('/api/data').then(res => res.json());
    initialData = newData; // Update global data object
    const { allTodos, recentDeletedTodos, keptItems, recentDeletedItems, shareLinks } = newData;

    // 2. Re-render dynamic parts of the page
    const allTodosList = document.getElementById('all-todos-list');
    if (allTodosList) {
      allTodosList.innerHTML = renderAllTodos(allTodos, keptItems, shareLinks);
    }

    const keptItemsList = document.getElementById('kept-items-list');
    if (keptItemsList) {
      keptItemsList.innerHTML = renderKeptItems(keptItems, shareLinks);
    }

    const deletedTodosList = document.getElementById('deleted-todos-list');
    if (deletedTodosList) {
      deletedTodosList.innerHTML = renderDeletedTodos(recentDeletedTodos);
    }

    const deletedItemsList = document.getElementById('deleted-items-list');
    if (deletedItemsList) {
      deletedItemsList.innerHTML = renderDeletedItems(recentDeletedItems);
    }

    const deletedProgressList = document.getElementById('deleted-progress-list');
    if (deletedProgressList) {
        deletedProgressList.innerHTML = renderDeletedProgress(initialData.recentDeletedProgress || []);
    }

    const userList = document.getElementById('user-list');
    const userCount = document.getElementById('user-count');
    if (userList && userCount) {
        userList.innerHTML = renderUserList(shareLinks);
        userCount.textContent = Object.keys(shareLinks).length;
    }

    // 3. Re-initialize icons and lightboxes
    lucide.createIcons();
    refreshFsLightbox();

  } catch (error) {
    console.error("Failed to refresh data and render:", error);
    alert('数据刷新失败，请尝试手动刷新页面。');
  }
}

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
        case 'restore':
           return `<li>${time}: ${actor} 恢复了此任务。</li>`;
        case 'update_text':
            return `<li>${time}: ${actor} 将任务内容从 "${logEntry.details.from}" 修改为 "${logEntry.details.to}"。</li>`;
        case 'create_item':
            return `<li>${time}: ${actor} 添加了物品 "${logEntry.details.name}"。</li>`;
        case 'delete_item':
            return `<li>${time}: ${actor} 删除了物品 "${logEntry.details.name}"。</li>`;
        case 'update_item_name':
            return `<li>${time}: ${actor} 将物品名称从 "${logEntry.details.from}" 修改为 "${logEntry.details.to}"。</li>`;
        case 'transfer_item':
            return `<li>${time}: ${actor} 将物品 "${logEntry.details.name}" 转交给了 <strong>${logEntry.details.to}</strong>。</li>`;
        case 'return_item':
            return `<li>${time}: ${actor} 归还了物品 "${logEntry.details.name}"。</li>`;
        case 'add_progress':
            return `<li>${time}: ${actor} 添加了新进度: "${logEntry.details.text}"。</li>`;
        case 'update_progress':
            return `<li>${time}: ${actor} 将进度从 "${logEntry.details.from}" 修改为 "${logEntry.details.to}"。</li>`;
        case 'delete_progress':
            return `<li>${time}: ${actor} 删除了进度: "${logEntry.details.text}"。</li>`;
        case 'restore_item':
            return `<li>${time}: ${actor} 恢复了物品 "${logEntry.details.name}"。</li>`;
        case 'restore_progress':
            return `<li>${time}: ${actor} 恢复了进度: "${logEntry.details.text}"。</li>`;
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
            <div class="flex-grow flex items-center">
              <div>
                <label class="font-semibold text-gray-700 ${item.returnedAt ? 'line-through' : ''}">[物品] ${item.name}</label>
                <div class="meta-info">由 <strong>${creator}</strong> 在 ${createdAt} 创建</div>
                <div class="meta-info">当前保管人: <strong>${keepersDisplay}</strong> (自 ${formatDate(currentKeeperInfo.timestamp)})</div>
                ${transferHistoryHtml}
                ${returnInfo}
              </div>
              ${itemImageUrlHtml}
            </div>
            <div class="flex flex-col space-y-1 ml-2">
                <button class="bg-yellow-500 text-white px-2 py-1 text-xs rounded" onclick="editItem('${item.id}', \`${item.name}\`)">修改</button>
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
                <button class="bg-blue-500 text-white px-2 py-1 text-xs rounded" onclick="showTransferModal('${item.id}')">转交</button>
                <button class="bg-green-500 text-white px-2 py-1 text-xs rounded" onclick="returnItem('${item.id}')" ${item.returnedAt ? 'disabled' : ''}>归还</button>
                <button class="delete-btn" style="padding: 2px 6px; font-size: 12px;" onclick="deleteItem('${item.id}')">删除</button>
            </div>
            `;
        }

        return `
          <div data-id="${item.id}" class="flex items-start" style="padding-left: 60px; padding-top: 10px;">
            <i data-lucide="package" class="w-4 h-4 text-purple-600 mr-2 mt-1"></i>
            ${itemHtml}
          </div>
        `;
    }).join('');

    return `
    <li data-id="${todo.id}" data-owner="${todo.ownerId}" class="p-4 bg-white rounded-lg shadow-sm ${todo.completed ? 'completed' : ''}">
      <div class="flex items-center">
        <button onclick="toggleTodoDetails(this, '${todo.id}')" class="mr-4"><i data-lucide="chevron-right"></i></button>
        <input type="checkbox" id="todo-${todo.id}" ${todo.completed ? 'checked' : ''} onchange="toggleTodo('${todo.id}', this.checked, '${todo.ownerId}')" class="mr-4 w-6 h-6 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500">
        ${imageUrlHtml}
        <div class="flex-grow">
          <label class="text-2xl font-medium text-gray-800">${todo.text}</label>
          <div class="meta-info text-sm text-gray-500">由 <strong>${creatorDisplayName}</strong> 在 ${formatDate(todo.createdAt)} 创建${ownerInfo}${completionInfo}</div>
        </div>
        <div class="flex items-center space-x-2 ml-auto">
          <button class="add-progress-btn bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg text-sm" onclick="showAddProgressForm('${todo.id}')">
            新增进度
          </button>
          <button class="edit-btn bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg text-sm" onclick="editTodo('${todo.id}', '${todo.ownerId}', \`${todo.text}\`)">
            修改
          </button>
          <button class="delete-btn bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg text-sm" onclick="deleteTodo('${todo.id}', '${todo.ownerId}')">
            删除
          </button>
        </div>
      </div>
      <div id="todo-details-${todo.id}" class="hidden">
        <div id="progress-form-${todo.id}" class="hidden mt-4">
          <form onsubmit="addProgress(event, '${todo.id}')">
            <textarea name="progress_text" placeholder="添加新的进度..." required class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-300"></textarea>
            <input type="file" name="progress_image" accept="image/*" class="w-full text-sm border rounded-lg p-1 mt-2" multiple>
            <button type="submit" class="w-full bg-blue-600 text-white font-medium py-2 px-4 rounded-lg mt-2">提交</button>
          </form>
        </div>
        <div id="progress-container-${todo.id}" class="mt-4">
          ${renderProgress(todo.progress || [])}
        </div>
        ${associatedItemsHtml ? `<div class="w-full mt-2">${associatedItemsHtml}</div>` : ''}
      </div>
      ${activityLogHtml}
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
                <button class="bg-yellow-500 text-white px-2 py-1 text-xs rounded" onclick="editItem('${item.id}', \`${item.name}\`)">修改</button>
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

async function editTodo(id, ownerId, currentText) {
  const todoElement = document.querySelector(`li[data-id='${id}'] .flex-grow`);
  const label = todoElement.querySelector('label');
  label.style.display = 'none';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentText;
  input.className = 'text-2xl font-medium text-gray-800 w-full';

  const saveChanges = async () => {
    const newText = input.value;
    if (newText && newText !== currentText) {
      try {
        const response = await fetch('/api/update_todo_text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ownerId, text: newText }),
        });
        if (!response.ok) throw new Error('更新待办事项失败');
        await refreshDataAndRender();
      } catch (error) {
        console.error("Update todo text failed:", error);
        alert('更新待办事项失败，请重试。');
      }
    } else {
      label.style.display = 'block';
      input.remove();
    }
  };

  input.addEventListener('blur', saveChanges);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveChanges();
    }
  });

  todoElement.insertBefore(input, label.nextSibling);
  input.focus();
}

async function editItem(id, currentName) {
  // Use a more generic selector to find the item element, whether it's in a div or li
  const itemElement = document.querySelector(`[data-id='${id}'] .flex-grow`);
  if (!itemElement) {
    console.error("Could not find item element with id:", id);
    alert('无法找到要编辑的物品，请刷新页面后重试。');
    return;
  }
  const label = itemElement.querySelector('label');
  label.style.display = 'none';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentName;
  input.className = 'font-semibold text-gray-700 w-full';

  const saveChanges = async () => {
    const newName = input.value;
    if (newName && newName !== currentName) {
      try {
        const response = await fetch('/api/update_item_name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, name: newName }),
        });
        if (!response.ok) throw new Error('更新物品名称失败');
        await refreshDataAndRender();
      } catch (error) {
        console.error("Update item name failed:", error);
        alert('更新物品名称失败，请重试。');
      }
    } else {
      label.style.display = 'block';
      input.remove();
    }
  };

  input.addEventListener('blur', saveChanges);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveChanges();
    }
  });

  itemElement.insertBefore(input, label.nextSibling);
  input.focus();
}

async function toggleTodo(id, completed, ownerId) {
  try {
    const response = await fetch('/api/update_todo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, completed, ownerId }),
    });
    if (!response.ok) throw new Error('更新待办事项失败');
    await refreshDataAndRender();
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
    await refreshDataAndRender();
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
    await refreshDataAndRender();
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
    await refreshDataAndRender();
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
    await refreshDataAndRender();
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
    await refreshDataAndRender();
  } catch (error)
  {
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
    await refreshDataAndRender();
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

function closeTransferModal() {
    const modal = document.getElementById('transfer-modal');
    modal.style.display = 'none';
}

function toggleKeptItems(button) {
  const list = document.getElementById('kept-items-list');
  const isHidden = list.classList.toggle('hidden');
  const icon = button.querySelector('i');

  if (isHidden) {
    icon.outerHTML = '<i data-lucide="chevron-down" class="w-4 h-4"></i>';
  } else {
    icon.outerHTML = '<i data-lucide="chevron-up" class="w-4 h-4"></i>';
  }
  lucide.createIcons();
}

function toggleTodoDetails(button, todoId) {
  const details = document.getElementById(`todo-details-${todoId}`);
  const isHidden = details.classList.toggle('hidden');

  if (isHidden) {
    button.innerHTML = '<i data-lucide="chevron-right"></i>';
  } else {
    button.innerHTML = '<i data-lucide="chevron-down"></i>';
  }
  lucide.createIcons();
}

function showAddProgressForm(todoId) {
  const details = document.getElementById(`todo-details-${todoId}`);
  const form = document.getElementById(`progress-form-${todoId}`);

  // If the details section is collapsed, expand it first.
  if (details.classList.contains('hidden')) {
    const todoElement = document.querySelector(`li[data-id='${todoId}']`);
    const toggleButton = todoElement.querySelector('button'); // The first button is the toggle button.

    details.classList.remove('hidden');
    toggleButton.innerHTML = '<i data-lucide="chevron-down"></i>';
    lucide.createIcons();
  }

  // Then, always toggle the form's visibility.
  form.classList.toggle('hidden');
}

function renderProgress(progress) {
  return progress.map(p => {
    const imageUrlsHtml = p.imageUrls ? p.imageUrls.map(url => `<a data-fslightbox href="${url}"><img src="${url}" alt="Progress Image" class="w-12 h-12 object-cover rounded-md ml-3"></a>`).join('') : '';
    return `
      <div data-id="${p.id}" class="flex items-start" style="padding-left: 60px; padding-top: 10px;">
        <i data-lucide="git-commit-horizontal" class="w-4 h-4 text-green-600 mr-2 mt-1"></i>
        <div class="flex-grow flex items-center">
          <div>
            <label class="font-semibold text-gray-700">[进度] ${p.text}</label>
            <div class="meta-info">由 <strong>${getDisplayName(p.creatorId)}</strong> 在 ${formatDate(p.createdAt)} 添加</div>
          </div>
          ${imageUrlsHtml}
        </div>
        <div class="flex flex-col space-y-1 ml-2">
          <button class="bg-yellow-500 text-white px-2 py-1 text-xs rounded" onclick="editProgress('${p.id}', \`${p.text}\`)">修改</button>
          <button class="delete-btn" style="padding: 2px 6px; font-size: 12px;" onclick="deleteProgress('${p.id}')">删除</button>
        </div>
      </div>
    `;
  }).join('');
}

async function addProgress(event, todoId) {
  event.preventDefault();
  const form = event.target;
  const text = form.querySelector('textarea[name="progress_text"]').value;
  const imageFiles = form.querySelector('input[name="progress_image"]').files;

  const formData = new FormData();
  formData.append('todoId', todoId);
  formData.append('text', text);
  for (const file of imageFiles) {
    formData.append('images', file);
  }

  try {
    const response = await fetch('/api/add_progress', {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error('添加进度失败');
    await refreshDataAndRender();
    form.reset();
    showAddProgressForm(todoId); // Hide the form again
  } catch (error) {
    console.error("Add progress failed:", error);
    alert('添加进度失败，请重试。');
  }
}

async function editProgress(id, currentText) {
  const progressElement = document.querySelector(`div[data-id='${id}'] .flex-grow`);
  const label = progressElement.querySelector('label');
  label.style.display = 'none';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentText;
  input.className = 'font-semibold text-gray-700 w-full';

  const saveChanges = async () => {
    const newText = input.value;
    if (newText && newText !== currentText) {
      try {
        const response = await fetch('/api/update_progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, text: newText }),
        });
        if (!response.ok) throw new Error('更新进度失败');
        await refreshDataAndRender();
      } catch (error) {
        console.error("Update progress failed:", error);
        alert('更新进度失败，请重试。');
      }
    } else {
      label.style.display = 'block';
      input.remove();
    }
  };

  input.addEventListener('blur', saveChanges);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveChanges();
    }
  });

  progressElement.insertBefore(input, label.nextSibling);
  input.focus();
}

async function deleteProgress(id) {
  if (!confirm('确定要删除此进度吗？')) return;
  try {
    const response = await fetch('/api/delete_progress', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) throw new Error('删除进度失败');
    await refreshDataAndRender();
  } catch (error) {
    console.error("Delete progress failed:", error);
    alert('删除进度失败，请重试。');
  }
}

function renderDeletedProgress(deletedProgress) {
  if (deletedProgress.length === 0) {
    return '<p class="text-center py-4">无已删除进度。</p>';
  }
  return deletedProgress.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt)).map(p => {
    return `
      <li class="todo-item opacity-60 flex justify-between items-center">
        <div>
          <label class="line-through">${p.text}</label>
          <div class="meta-info">由 <strong>${getDisplayName(p.creatorId)}</strong> 在 ${formatDate(p.createdAt)} 添加</div>
          <div class="meta-info">由 <strong>${getDisplayName(p.deletedBy)}</strong> 在 ${formatDate(p.deletedAt)} 删除</div>
        </div>
        <button class="bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-3 rounded-lg text-sm" onclick="restoreProgress('${p.id}')">
          还原
        </button>
      </li>
    `;
  }).join('');
}

async function restoreProgress(id) {
  if (!confirm('确定要还原此进度吗？')) return;
  try {
    const response = await fetch('/api/restore_progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) throw new Error('还原进度失败');
    await refreshDataAndRender();
  } catch (error) {
    console.error("Restore progress failed:", error);
    alert('还原进度失败，请重试。');
  }
}
