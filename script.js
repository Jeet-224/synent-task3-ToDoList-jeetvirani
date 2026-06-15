/**
 * TaskFlow — script.js
 * Full-featured To-Do dashboard with localStorage persistence
 * Architecture: Pure Vanilla JS, event-driven, module-like IIFE
 */

(function () {
  'use strict';

  /* ============================================================
     1. STATE
     ============================================================ */
  let state = {
    tasks: [],          // Task objects
    lists: [            // Sidebar lists
      { id: 'personal', name: 'Personal', color: '#6C63FF' },
      { id: 'work',     name: 'Work',     color: '#F97316' },
      { id: 'shopping', name: 'Shopping', color: '#10B981' },
    ],
    activeFilter: 'all',        // 'all' | 'active' | 'completed'
    activeView: 'today',        // 'today' | 'upcoming' | 'calendar' | list id
    activeTag: null,
    searchQuery: '',
    selectedTaskId: null,
    darkMode: false,
  };

  /* ============================================================
     2. STORAGE
     ============================================================ */
  const STORAGE_KEY  = 'taskflow_v2';
  const THEME_KEY    = 'taskflow_theme';

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tasks: state.tasks,
      lists: state.lists,
    }));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.tasks = parsed.tasks || [];
        state.lists = parsed.lists || state.lists;
      }
    } catch (e) { /* corrupt data — start fresh */ }
    // Theme
    state.darkMode = localStorage.getItem(THEME_KEY) === 'dark';
    applyTheme();
  }

  /* ============================================================
     3. UTILITIES
     ============================================================ */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function today() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  function isOverdue(date) {
    return date && date < today();
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const opts = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('en-US', opts);
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ============================================================
     4. TOAST SYSTEM
     ============================================================ */
  const toastContainer = document.getElementById('toast-container');

  function showToast(message, type = 'success') {
    const icons = { success: 'check-circle', error: 'x-circle', info: 'info' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          ${type === 'success' ? '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' : ''}
          ${type === 'error'   ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' : ''}
          ${type === 'info'    ? '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r=".5"/>' : ''}
        </svg>
      </span>
      <span>${escHtml(message)}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove());
    }, 3200);
  }

  /* ============================================================
     5. THEME
     ============================================================ */
  const darkToggle = document.getElementById('darkModeToggle');

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.darkMode ? 'dark' : 'light');
    const icon = darkToggle.querySelector('svg, i');
    if (icon) {
      icon.setAttribute('data-lucide', state.darkMode ? 'sun' : 'moon');
      lucide.createIcons();
    }
    const label = darkToggle.querySelector('span');
    if (label) label.textContent = state.darkMode ? 'Light Mode' : 'Dark Mode';
  }

  darkToggle.addEventListener('click', () => {
    state.darkMode = !state.darkMode;
    localStorage.setItem(THEME_KEY, state.darkMode ? 'dark' : 'light');
    applyTheme();
  });

  /* ============================================================
     6. TASK CRUD
     ============================================================ */
  function createTask(name, opts = {}) {
    return {
      id:          uid(),
      name:        name.trim(),
      description: opts.description || '',
      done:        false,
      priority:    opts.priority || 'medium',
      dueDate:     opts.dueDate || '',
      list:        opts.list || 'personal',
      tags:        opts.tags || [],
      subtasks:    opts.subtasks || [],
      createdAt:   Date.now(),
    };
  }

  function addTask(name, priority, dueDate) {
    if (!name.trim()) { showToast('Task name cannot be empty', 'error'); return; }
    const task = createTask(name, {
      priority,
      dueDate,
      list: (state.activeView === 'today' || state.activeView === 'upcoming' || state.activeView === 'calendar')
        ? 'personal'
        : state.activeView,
    });
    state.tasks.unshift(task);
    saveState();
    render();
    showToast('Task added');
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    if (state.selectedTaskId === id) {
      state.selectedTaskId = null;
      hideDetailPanel();
    }
    saveState();
    render();
    showToast('Task deleted', 'info');
  }

  function toggleTask(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    task.done = !task.done;
    saveState();
    render();
    if (task.done) showToast(`"${task.name}" completed ✓`);
  }

  function updateTask(id, changes) {
    const idx = state.tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    state.tasks[idx] = { ...state.tasks[idx], ...changes };
    saveState();
    render();
  }

  function clearCompleted() {
    const count = state.tasks.filter(t => t.done).length;
    if (!count) { showToast('No completed tasks to clear', 'info'); return; }
    state.tasks = state.tasks.filter(t => !t.done);
    state.selectedTaskId = null;
    hideDetailPanel();
    saveState();
    render();
    showToast(`${count} completed task${count > 1 ? 's' : ''} cleared`);
  }

  /* ============================================================
     7. FILTERING & SEARCHING
     ============================================================ */
  function getVisibleTasks() {
    let tasks = [...state.tasks];

    // View filter
    if (state.activeView === 'today') {
      tasks = tasks.filter(t => !t.dueDate || t.dueDate === today() || isOverdue(t.dueDate));
    } else if (state.activeView === 'upcoming') {
      tasks = tasks.filter(t => t.dueDate && t.dueDate > today());
    } else if (state.activeView !== 'calendar') {
      // list filter
      tasks = tasks.filter(t => t.list === state.activeView);
    }

    // Tag filter
    if (state.activeTag) {
      tasks = tasks.filter(t => t.tags.includes(state.activeTag));
    }

    // Search
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      tasks = tasks.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (state.activeFilter === 'active')    tasks = tasks.filter(t => !t.done);
    if (state.activeFilter === 'completed') tasks = tasks.filter(t => t.done);

    return tasks;
  }

  /* ============================================================
     8. COUNTS FOR SIDEBAR BADGES
     ============================================================ */
  function updateBadges() {
    const todayTasks    = state.tasks.filter(t => !t.dueDate || t.dueDate === today() || isOverdue(t.dueDate));
    const upcomingTasks = state.tasks.filter(t => t.dueDate && t.dueDate > today());

    document.getElementById('todayCount').textContent    = todayTasks.filter(t => !t.done).length;
    document.getElementById('upcomingCount').textContent = upcomingTasks.filter(t => !t.done).length;

    state.lists.forEach(list => {
      const el = document.getElementById(`${list.id}Count`);
      if (el) el.textContent = state.tasks.filter(t => t.list === list.id && !t.done).length;
    });
  }

  /* ============================================================
     9. TAGS CLOUD
     ============================================================ */
  function renderTagsCloud() {
    const allTags = [...new Set(state.tasks.flatMap(t => t.tags))];
    const cloud = document.getElementById('tagsCloud');
    cloud.innerHTML = '';
    if (!allTags.length) {
      cloud.innerHTML = '<span style="font-size:12px;color:var(--text-muted);padding:4px 10px">No tags yet</span>';
      return;
    }
    allTags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip' + (state.activeTag === tag ? ' active' : '');
      chip.textContent = '#' + tag;
      chip.addEventListener('click', () => {
        state.activeTag = state.activeTag === tag ? null : tag;
        render();
      });
      cloud.appendChild(chip);
    });
  }

  /* ============================================================
     10. RENDER TASK LIST
     ============================================================ */
  const taskListEl  = document.getElementById('taskList');
  const emptyEl     = document.getElementById('emptyState');
  const counterEl   = document.getElementById('taskCounter');
  const panelTitle  = document.getElementById('panelTitle');

  function renderTasks() {
    const visible = getVisibleTasks();
    taskListEl.innerHTML = '';

    // Title
    const titles = {
      today: 'Today', upcoming: 'Upcoming', calendar: 'Calendar',
    };
    panelTitle.textContent = titles[state.activeView] ||
      (state.lists.find(l => l.id === state.activeView)?.name ?? 'Tasks');

    // Counter
    const remaining = visible.filter(t => !t.done).length;
    counterEl.textContent = `${remaining} task${remaining !== 1 ? 's' : ''} remaining`;

    // Empty state
    if (!visible.length) {
      emptyEl.classList.add('visible');
      return;
    }
    emptyEl.classList.remove('visible');

    visible.forEach(task => {
      taskListEl.appendChild(buildTaskCard(task));
    });

    // Re-init Lucide icons inside cards
    lucide.createIcons();
  }

  function buildTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card' + (task.done ? ' completed' : '') + (state.selectedTaskId === task.id ? ' selected' : '');
    card.dataset.id = task.id;

    const doneDot = task.done
      ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
      : '';

    const dateHtml = task.dueDate
      ? `<span class="task-date ${isOverdue(task.dueDate) && !task.done ? 'overdue' : ''}">
           <i data-lucide="calendar" size="11"></i>${formatDate(task.dueDate)}
         </span>`
      : '';

    const tagsHtml = task.tags.length
      ? `<div class="task-tags">${task.tags.map(t => `<span class="task-tag">#${escHtml(t)}</span>`).join('')}</div>`
      : '';

    const completedSubs = task.subtasks.filter(s => s.done).length;
    const totalSubs     = task.subtasks.length;
    const progressHtml  = totalSubs
      ? `<div class="subtask-progress">
           <div class="subtask-progress-bar" style="width:${Math.round((completedSubs/totalSubs)*100)}%"></div>
         </div>`
      : '';

    card.innerHTML = `
      <div class="task-checkbox ${task.done ? 'checked' : ''}" data-action="toggle">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="task-body">
        <div class="task-name">${escHtml(task.name)}</div>
        <div class="task-meta">
          ${dateHtml}
          <span class="priority-badge ${task.priority}">${task.priority}</span>
          ${tagsHtml}
        </div>
        ${progressHtml}
      </div>
      <div class="task-actions">
        <button class="task-action-btn" data-action="edit" title="Edit">
          <i data-lucide="pencil" size="13"></i>
        </button>
        <button class="task-action-btn delete" data-action="delete" title="Delete">
          <i data-lucide="trash-2" size="13"></i>
        </button>
      </div>`;

    // Event delegation on the card
    card.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'toggle') { e.stopPropagation(); toggleTask(task.id); return; }
      if (action === 'delete') { e.stopPropagation(); deleteTask(task.id); return; }
      if (action === 'edit')   { e.stopPropagation(); selectTask(task.id); return; }
      selectTask(task.id);
    });

    return card;
  }

  /* ============================================================
     11. DETAIL PANEL
     ============================================================ */
  const detailEmpty   = document.getElementById('detailEmpty');
  const detailContent = document.getElementById('detailContent');
  const detailPanel   = document.getElementById('detailPanel');

  function selectTask(id) {
    state.selectedTaskId = id;
    populateDetail(id);
    renderTasks(); // Re-render to update selected card highlight

    // On mobile/tablet open the panel
    detailPanel.classList.add('open');
  }

  function hideDetailPanel() {
    detailEmpty.style.display = 'flex';
    detailContent.style.display = 'none';
    detailPanel.classList.remove('open');
    state.selectedTaskId = null;
  }

  function populateDetail(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;

    detailEmpty.style.display = 'none';
    detailContent.style.display = 'block';

    document.getElementById('detailTitle').value = task.name;
    document.getElementById('detailDesc').value  = task.description;
    document.getElementById('detailDate').value  = task.dueDate || '';

    // Priority buttons
    document.querySelectorAll('.priority-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.priority === task.priority);
    });

    // List select
    const listSel = document.getElementById('detailList');
    // Rebuild options in case custom lists added
    listSel.innerHTML = state.lists
      .map(l => `<option value="${l.id}" ${task.list === l.id ? 'selected' : ''}>${l.name}</option>`)
      .join('');

    // Tags
    renderDetailTags(task.tags);

    // Subtasks
    renderSubtasks(task.subtasks);
  }

  /* Tags in detail */
  function renderDetailTags(tags) {
    const container = document.getElementById('detailTags');
    container.innerHTML = tags.map(tag => `
      <span class="detail-tag">
        #${escHtml(tag)}
        <button data-tag="${escHtml(tag)}" title="Remove tag">×</button>
      </span>`).join('');

    container.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const task = state.tasks.find(t => t.id === state.selectedTaskId);
        if (!task) return;
        task.tags = task.tags.filter(t => t !== btn.dataset.tag);
        saveState();
        render();
        populateDetail(state.selectedTaskId);
      });
    });
  }

  /* Subtasks in detail */
  function renderSubtasks(subtasks) {
    const list = document.getElementById('subtaskList');
    list.innerHTML = subtasks.map((s, i) => `
      <li class="subtask-item" data-index="${i}">
        <input type="checkbox" class="subtask-check" ${s.done ? 'checked' : ''}/>
        <span class="subtask-text ${s.done ? 'done' : ''}">${escHtml(s.text)}</span>
        <button class="subtask-del" title="Remove subtask">×</button>
      </li>`).join('');

    list.querySelectorAll('.subtask-check').forEach((chk, i) => {
      chk.addEventListener('change', () => {
        const task = state.tasks.find(t => t.id === state.selectedTaskId);
        if (task) {
          task.subtasks[i].done = chk.checked;
          saveState();
          render();
          renderSubtasks(task.subtasks);
        }
      });
    });

    list.querySelectorAll('.subtask-del').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        const task = state.tasks.find(t => t.id === state.selectedTaskId);
        if (task) {
          task.subtasks.splice(i, 1);
          saveState();
          render();
          renderSubtasks(task.subtasks);
        }
      });
    });
  }

  /* ============================================================
     12. LISTS SIDEBAR
     ============================================================ */
  function renderListsNav() {
    const nav   = document.getElementById('listsNav');
    const sel   = document.getElementById('detailList');

    nav.innerHTML = '';

    // Also rebuild detail list select
    if (sel) {
      sel.innerHTML = state.lists
        .map(l => `<option value="${l.id}">${l.name}</option>`)
        .join('');
    }

    state.lists.forEach(list => {
      const li = document.createElement('li');
      li.className = 'nav-item' + (state.activeView === list.id ? ' active' : '');
      li.dataset.list = list.id;
      li.innerHTML = `
        <span class="list-dot" style="background:${list.color}"></span>
        <span>${escHtml(list.name)}</span>
        <span class="nav-badge" id="${list.id}Count">0</span>`;
      li.addEventListener('click', () => setView(list.id));
      nav.appendChild(li);
    });
  }

  /* ============================================================
     13. NAVIGATION
     ============================================================ */
  function setView(view) {
    state.activeView = view;
    state.activeTag  = null;

    // Update nav active classes
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active',
        el.dataset.view === view || el.dataset.list === view);
    });

    render();
  }

  // Bind category nav items
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', () => setView(el.dataset.view));
  });

  /* ============================================================
     14. FILTER BUTTONS
     ============================================================ */
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeFilter = btn.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTasks();
    });
  });

  /* ============================================================
     15. ADD TASK
     ============================================================ */
  const newTaskInput    = document.getElementById('newTaskInput');
  const newTaskPriority = document.getElementById('newTaskPriority');
  const newTaskDate     = document.getElementById('newTaskDate');
  const addTaskBtn      = document.getElementById('addTaskBtn');

  function handleAddTask() {
    addTask(
      newTaskInput.value,
      newTaskPriority.value,
      newTaskDate.value
    );
    newTaskInput.value    = '';
    newTaskDate.value     = '';
    newTaskPriority.value = 'medium';
    newTaskInput.focus();
  }

  addTaskBtn.addEventListener('click', handleAddTask);
  newTaskInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddTask();
  });

  // Pre-fill today's date
  newTaskDate.value = today();

  /* ============================================================
     16. SIDEBAR SEARCH
     ============================================================ */
  document.getElementById('sidebarSearch').addEventListener('input', e => {
    state.searchQuery = e.target.value.trim();
    renderTasks();
  });

  /* ============================================================
     17. DETAIL PANEL INTERACTIONS
     ============================================================ */
  // Close detail
  document.getElementById('closeDetailBtn').addEventListener('click', hideDetailPanel);

  // Priority selector
  document.querySelectorAll('.priority-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Tag input: add on Enter
  document.getElementById('detailTagInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const input = e.target;
      const val   = input.value.trim().replace(/\s+/g, '-').toLowerCase();
      if (!val) return;
      const task = state.tasks.find(t => t.id === state.selectedTaskId);
      if (!task || task.tags.includes(val)) { input.value = ''; return; }
      task.tags.push(val);
      saveState();
      render();
      renderDetailTags(task.tags);
      input.value = '';
    }
  });

  // Subtask input: add on Enter
  document.getElementById('subtaskInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const input = e.target;
      const val   = input.value.trim();
      if (!val) return;
      const task = state.tasks.find(t => t.id === state.selectedTaskId);
      if (!task) return;
      task.subtasks.push({ text: val, done: false });
      saveState();
      render();
      renderSubtasks(task.subtasks);
      input.value = '';
    }
  });

  // Save Changes
  document.getElementById('saveChangesBtn').addEventListener('click', () => {
    if (!state.selectedTaskId) return;
    const activePriority = document.querySelector('.priority-btn.active')?.dataset.priority || 'medium';
    updateTask(state.selectedTaskId, {
      name:        document.getElementById('detailTitle').value.trim() || 'Untitled',
      description: document.getElementById('detailDesc').value,
      dueDate:     document.getElementById('detailDate').value,
      priority:    activePriority,
      list:        document.getElementById('detailList').value,
    });
    showToast('Changes saved');
  });

  // Delete from detail
  document.getElementById('deleteTaskDetailBtn').addEventListener('click', () => {
    if (state.selectedTaskId) deleteTask(state.selectedTaskId);
  });

  /* ============================================================
     18. ADD LIST MODAL
     ============================================================ */
  const addListModal   = document.getElementById('addListModal');
  let   selectedColor  = '#6C63FF';

  document.getElementById('addListBtn').addEventListener('click', () => {
    addListModal.classList.add('open');
    document.getElementById('newListName').value = '';
    document.getElementById('newListName').focus();
  });
  document.getElementById('cancelListBtn').addEventListener('click', () => {
    addListModal.classList.remove('open');
  });
  addListModal.addEventListener('click', e => {
    if (e.target === addListModal) addListModal.classList.remove('open');
  });

  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      selectedColor = sw.dataset.color;
    });
  });

  document.getElementById('confirmListBtn').addEventListener('click', () => {
    const name = document.getElementById('newListName').value.trim();
    if (!name) { showToast('Enter a list name', 'error'); return; }
    const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + uid().slice(0, 4);
    state.lists.push({ id, name, color: selectedColor });
    saveState();
    renderListsNav();
    updateBadges();
    addListModal.classList.remove('open');
    showToast(`List "${name}" created`);
  });

  /* ============================================================
     19. CLEAR COMPLETED
     ============================================================ */
  document.getElementById('clearAllBtn').addEventListener('click', clearCompleted);

  /* ============================================================
     20. MOBILE SIDEBAR TOGGLE
     ============================================================ */
  const sidebar        = document.getElementById('sidebar');
  const hamburger      = document.getElementById('hamburgerBtn');
  const sidebarClose   = document.getElementById('sidebarCloseBtn');

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);

  function openSidebar()  { sidebar.classList.add('open'); overlay.classList.add('visible'); }
  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('visible'); }

  hamburger.addEventListener('click', openSidebar);
  sidebarClose.addEventListener('click', closeSidebar);
  overlay.addEventListener('click', closeSidebar);

  /* Mobile detail panel toggle */
  document.getElementById('mobileDetailsBtn').addEventListener('click', () => {
    if (state.selectedTaskId) {
      detailPanel.classList.toggle('open');
    } else {
      showToast('Select a task first', 'info');
    }
  });

  /* ============================================================
     21. SORT
     ============================================================ */
  let sortMode = 'createdAt'; // 'createdAt' | 'dueDate' | 'priority' | 'name'
  const sortCycle = ['createdAt', 'dueDate', 'priority', 'name'];
  const sortLabels = { createdAt: 'Newest first', dueDate: 'By due date', priority: 'By priority', name: 'A → Z' };

  document.getElementById('sortSelect').addEventListener('change', (e) => {
  sortMode = e.target.value;
  showToast(`Sorted by ${e.target.options[e.target.selectedIndex].text}`, 'info');
  render();
});

  function sortTasks(tasks) {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return [...tasks].sort((a, b) => {
      switch (sortMode) {
        case 'dueDate':
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate);
        case 'priority':
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return b.createdAt - a.createdAt;
      }
    });
  }

  // Patch getVisibleTasks to include sort
  const _getVisible = getVisibleTasks;
  // We override by modifying render flow to sort after filtering:

  /* ============================================================
     22. MASTER RENDER
     ============================================================ */
  function render() {
    renderListsNav();
    renderTasks();
    renderTagsCloud();
    updateBadges();
    lucide.createIcons(); // Re-init icons after any DOM change
  }

  // Patch renderTasks to sort
  const _renderTasks = renderTasks;
  function renderTasksSorted() {
    const visible = sortTasks(getVisibleTasks());

    panelTitle.textContent = (() => {
      const titles = { today: 'Today', upcoming: 'Upcoming', calendar: 'Calendar' };
      return titles[state.activeView] || (state.lists.find(l => l.id === state.activeView)?.name ?? 'Tasks');
    })();

    const remaining = visible.filter(t => !t.done).length;
    counterEl.textContent = `${remaining} task${remaining !== 1 ? 's' : ''} remaining`;

    taskListEl.innerHTML = '';

    if (!visible.length) {
      emptyEl.classList.add('visible');
    } else {
      emptyEl.classList.remove('visible');
      visible.forEach(task => taskListEl.appendChild(buildTaskCard(task)));
    }

    lucide.createIcons();
  }

  // Override render to use sorted version
  function render() {
    renderListsNav();
    renderTasksSorted();
    renderTagsCloud();
    updateBadges();
    lucide.createIcons();
  }

  /* ============================================================
     23. SEED DATA (first-time users)
     ============================================================ */
  function seedData() {
    if (state.tasks.length) return; // already has data
    const seeds = [
      { name: 'Review project proposal',    priority: 'high',   dueDate: today(),      list: 'work',     tags: ['urgent'] },
      { name: 'Buy groceries',              priority: 'medium', dueDate: today(),      list: 'shopping', tags: ['errands'] },
      { name: 'Morning run — 5km',          priority: 'low',    dueDate: today(),      list: 'personal', tags: ['health'] },
      { name: 'Team standup call',          priority: 'high',   dueDate: today(),      list: 'work',     tags: ['meeting'] },
      { name: 'Refactor authentication',    priority: 'medium', dueDate: getFuture(2), list: 'work',     tags: ['dev'] },
      { name: 'Read "Deep Work" chapter 3', priority: 'low',    dueDate: getFuture(3), list: 'personal', tags: ['reading'] },
    ];
    seeds.forEach(s => {
      state.tasks.push(createTask(s.name, s));
    });
    saveState();
  }

  function getFuture(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /* ============================================================
     24. INIT
     ============================================================ */
  function init() {
    loadState();
    seedData();
    render();
    lucide.createIcons();
    // Keyboard shortcut: N to focus add task
    document.addEventListener('keydown', e => {
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        newTaskInput.focus();
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        hideDetailPanel();
        closeSidebar();
      }
    });
  }

  init();

})();