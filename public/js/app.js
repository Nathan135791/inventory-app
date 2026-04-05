// API Base URL
const API_URL = '/api';

// State
let items = [];
let currentView = 'dashboard';

// DOM Elements
const views = document.querySelectorAll('.view');
const navBtns = document.querySelectorAll('.nav-btn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupForms();
    loadItems();
});

// Navigation
function setupNavigation() {
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });
}

function switchView(viewName) {
    currentView = viewName;

    // Update nav buttons
    navBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Update views
    views.forEach(view => {
        view.classList.toggle('active', view.id === viewName);
    });

    // Load data for specific views
    if (viewName === 'dashboard') {
        loadItems();
    } else if (viewName === 'checkout') {
        populateItemSelects();
    } else if (viewName === 'history') {
        loadTransactions();
    }
}

// Setup Forms
function setupForms() {
    // Toggle between new and existing item forms
    const toggleBtns = document.querySelectorAll('.toggle-btn');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            toggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const type = btn.dataset.type;
            document.getElementById('newItemForm').classList.toggle('hidden', type !== 'new');
            document.getElementById('existingItemForm').classList.toggle('hidden', type !== 'existing');
        });
    });

    // New Item Form
    document.getElementById('newItemForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('newItemName').value;
        const quantity = document.getElementById('newItemQty').value;
        const notes = document.getElementById('newItemNotes').value;

        try {
            await fetch(`${API_URL}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, quantity, notes })
            });
            showToast('Item added successfully!', 'success');
            e.target.reset();
            loadItems();
        } catch (error) {
            showToast('Failed to add item', 'error');
        }
    });

    // Existing Item Check-in Form
    document.getElementById('existingItemForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const item_id = document.getElementById('existingItemSelect').value;
        const quantity = document.getElementById('addQty').value;
        const notes = document.getElementById('addNotes').value;

        try {
            await fetch(`${API_URL}/checkin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item_id, quantity, notes })
            });
            showToast('Check-in successful!', 'success');
            e.target.reset();
            loadItems();
        } catch (error) {
            showToast('Failed to check in', 'error');
        }
    });

    // Checkout Form - Updated with new fields
    document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const item_id = document.getElementById('checkoutItemSelect').value;
        const quantity = document.getElementById('checkoutQty').value;
        const notes = document.getElementById('checkoutNotes').value;
        const borrowed_by = document.getElementById('borrowedBy').value;
        const purpose = document.getElementById('purpose').value;
        const duration = document.getElementById('duration').value;

        try {
            const res = await fetch(`${API_URL}/checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item_id, quantity, notes, borrowed_by, purpose, duration })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Checkout failed');
            }

            showToast('Check-out successful!', 'success');
            e.target.reset();
            document.getElementById('checkoutItemInfo').classList.add('hidden');
            loadItems();
            populateItemSelects();
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    // Return Form
    document.getElementById('returnForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const item_id = document.getElementById('returnItemSelect').value;
        const notes = document.getElementById('returnNotes').value;

        try {
            const res = await fetch(`${API_URL}/return`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item_id, notes })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Return failed');
            }

            showToast('Item returned successfully!', 'success');
            e.target.reset();
            document.getElementById('returnItemInfo').classList.add('hidden');
            loadItems();
            populateItemSelects();
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    // Show available quantity on item select
    document.getElementById('checkoutItemSelect').addEventListener('change', (e) => {
        const itemId = e.target.value;
        const item = items.find(i => i.id === itemId);
        const infoDiv = document.getElementById('checkoutItemInfo');

        if (item) {
            document.getElementById('availableQty').textContent = item.quantity;
            document.getElementById('checkoutQty').max = item.quantity;
            infoDiv.classList.remove('hidden');
        } else {
            infoDiv.classList.add('hidden');
        }
    });

    // Show return item info on select
    document.getElementById('returnItemSelect').addEventListener('change', (e) => {
        const itemId = e.target.value;
        const item = items.find(i => i.id === itemId);
        const infoDiv = document.getElementById('returnItemInfo');

        if (item && item.status === 'checked_out') {
            document.getElementById('returnBorrowedBy').textContent = item.borrowed_by || '-';
            document.getElementById('returnPurpose').textContent = item.purpose || '-';
            document.getElementById('returnCheckedOutAt').textContent = item.checked_out_at ? formatDate(item.checked_out_at) : '-';
            infoDiv.classList.remove('hidden');
        } else {
            infoDiv.classList.add('hidden');
        }
    });

    // Search
    document.getElementById('searchBtn').addEventListener('click', () => {
        const query = document.getElementById('searchInput').value;
        loadItems(query);
    });

    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value;
            loadItems(query);
        }
    });
}

// Load Items
async function loadItems(search = '') {
    try {
        const url = search ? `${API_URL}/items?search=${encodeURIComponent(search)}` : `${API_URL}/items`;
        const res = await fetch(url);
        items = await res.json();
        renderInventoryTable();
        updateStats();
    } catch (error) {
        console.error('Error loading items:', error);
        showToast('Failed to load items', 'error');
    }
}

// Render Inventory Table - Updated with status
function renderInventoryTable() {
    const tbody = document.getElementById('inventoryBody');

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No items found. Add your first item!</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(item => {
        const isCheckedOut = item.status === 'checked_out';
        const statusBadge = isCheckedOut
            ? '<span class="badge checkout">Checked Out</span>'
            : '<span class="badge checkin">Available</span>';

        const withPurpose = isCheckedOut
            ? `<strong>${escapeHtml(item.borrowed_by || '-')}</strong><br><small>${escapeHtml(item.purpose || '-')}</small>`
            : '<span class="home-status">Back Home</span>';

        const dueDate = isCheckedOut && item.due_date
            ? formatDate(item.due_date)
            : '-';

        const returnBtn = isCheckedOut
            ? `<button class="btn-small btn-return" onclick="returnItem('${item.id}')">Return</button>`
            : '';

        return `
            <tr class="${isCheckedOut ? 'checked-out' : ''} ${item.quantity <= 5 ? 'low-stock' : ''}">
                <td>${escapeHtml(item.name)}</td>
                <td>${item.quantity}</td>
                <td>${statusBadge}</td>
                <td>${withPurpose}</td>
                <td>${dueDate}</td>
                <td>
                    ${returnBtn}
                    <button class="btn-small btn-edit" onclick="editItem('${item.id}')">Edit</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Update Stats
function updateStats() {
    document.getElementById('totalItems').textContent = items.length;
    document.getElementById('totalQuantity').textContent = items.reduce((sum, i) => sum + i.quantity, 0);
    const checkedOut = items.filter(i => i.status === 'checked_out').length;
    document.getElementById('lowStock').textContent = checkedOut;
    // Update label
    const lowStockLabel = document.querySelector('#lowStock').nextElementSibling;
    if (lowStockLabel) lowStockLabel.textContent = 'Checked Out';
}

// Populate Item Selects
function populateItemSelects() {
    const existingSelect = document.getElementById('existingItemSelect');
    const checkoutSelect = document.getElementById('checkoutItemSelect');
    const returnSelect = document.getElementById('returnItemSelect');

    // Available items for checkout
    const availableItems = items.filter(i => i.status !== 'checked_out' && i.quantity > 0);
    // Checked out items for return
    const checkedOutItems = items.filter(i => i.status === 'checked_out');

    if (existingSelect) {
        existingSelect.innerHTML = '<option value="">-- Select Item --</option>' +
            items.map(item => `<option value="${item.id}">${escapeHtml(item.name)} (${item.quantity})</option>`).join('');
    }

    if (checkoutSelect) {
        checkoutSelect.innerHTML = '<option value="">-- Select Item --</option>' +
            availableItems.map(item => `<option value="${item.id}">${escapeHtml(item.name)} (${item.quantity} available)</option>`).join('');
    }

    if (returnSelect) {
        returnSelect.innerHTML = '<option value="">-- Select Checked Out Item --</option>' +
            checkedOutItems.map(item => `<option value="${item.id}">${escapeHtml(item.name)} (with ${escapeHtml(item.borrowed_by || 'Unknown')})</option>`).join('');
    }
}

// Load Transactions
async function loadTransactions() {
    try {
        const res = await fetch(`${API_URL}/transactions`);
        const transactions = await res.json();
        renderTransactions(transactions);
    } catch (error) {
        console.error('Error loading transactions:', error);
        showToast('Failed to load history', 'error');
    }
}

// Render Transactions - Updated with borrowed_by and purpose
function renderTransactions(transactions) {
    const tbody = document.getElementById('historyBody');

    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No transactions yet</td></tr>';
        return;
    }

    tbody.innerHTML = transactions.map(t => `
        <tr>
            <td>${formatDate(t.created_at)}</td>
            <td>${escapeHtml(t.inventory_items?.name || 'Unknown')}</td>
            <td><span class="badge ${t.type}">${t.type === 'checkin' ? 'RETURNED' : 'OUT'}</span></td>
            <td>${escapeHtml(t.borrowed_by || '-')}</td>
            <td>${escapeHtml(t.purpose || '-')}</td>
            <td>${escapeHtml(t.notes || '-')}</td>
        </tr>
    `).join('');
}

// Edit Item
async function editItem(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;

    const name = prompt('Item name:', item.name);
    if (name === null) return;

    const quantity = prompt('Quantity:', item.quantity);
    if (quantity === null) return;

    const notes = prompt('Notes:', item.notes || '');
    if (notes === null) return;

    try {
        await fetch(`${API_URL}/items/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, quantity: parseInt(quantity), notes })
        });
        showToast('Item updated!', 'success');
        loadItems();
    } catch (error) {
        showToast('Failed to update item', 'error');
    }
}

// Delete Item
async function deleteItem(id) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
        await fetch(`${API_URL}/items/${id}`, { method: 'DELETE' });
        showToast('Item deleted!', 'success');
        loadItems();
    } catch (error) {
        showToast('Failed to delete item', 'error');
    }
}

// Return Item from Dashboard
async function returnItem(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;

    if (!confirm(`Return "${item.name}" from ${item.borrowed_by}?`)) return;

    try {
        const res = await fetch(`${API_URL}/return`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_id: id, notes: 'Returned from dashboard' })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Return failed');
        }

        showToast('Item returned successfully!', 'success');
        loadItems();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Toast Notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Utility Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
