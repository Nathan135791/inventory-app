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
    } else if (viewName === 'checkin' || viewName === 'checkout') {
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

    // Checkout Form
    document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const item_id = document.getElementById('checkoutItemSelect').value;
        const quantity = document.getElementById('checkoutQty').value;
        const notes = document.getElementById('checkoutNotes').value;

        try {
            const res = await fetch(`${API_URL}/checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item_id, quantity, notes })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Checkout failed');
            }

            showToast('Check-out successful!', 'success');
            e.target.reset();
            document.getElementById('checkoutItemInfo').classList.add('hidden');
            loadItems();
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

// Render Inventory Table
function renderInventoryTable() {
    const tbody = document.getElementById('inventoryBody');

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No items found. Add your first item!</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(item => `
        <tr class="${item.quantity <= 5 ? 'low-stock' : ''}">
            <td>${escapeHtml(item.name)}</td>
            <td>${item.quantity}</td>
            <td>${escapeHtml(item.notes || '-')}</td>
            <td>${formatDate(item.updated_at)}</td>
            <td>
                <button class="btn-small btn-edit" onclick="editItem('${item.id}')">Edit</button>
                <button class="btn-small btn-delete" onclick="deleteItem('${item.id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

// Update Stats
function updateStats() {
    document.getElementById('totalItems').textContent = items.length;
    document.getElementById('totalQuantity').textContent = items.reduce((sum, i) => sum + i.quantity, 0);
    document.getElementById('lowStock').textContent = items.filter(i => i.quantity <= 5).length;
}

// Populate Item Selects
function populateItemSelects() {
    const selects = [
        document.getElementById('existingItemSelect'),
        document.getElementById('checkoutItemSelect')
    ];

    selects.forEach(select => {
        if (select) {
            select.innerHTML = '<option value="">-- Select Item --</option>' +
                items.map(item => `<option value="${item.id}">${escapeHtml(item.name)} (${item.quantity})</option>`).join('');
        }
    });
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

// Render Transactions
function renderTransactions(transactions) {
    const tbody = document.getElementById('historyBody');

    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No transactions yet</td></tr>';
        return;
    }

    tbody.innerHTML = transactions.map(t => `
        <tr>
            <td>${formatDate(t.created_at)}</td>
            <td>${escapeHtml(t.inventory_items?.name || 'Unknown')}</td>
            <td><span class="badge ${t.type}">${t.type === 'checkin' ? 'IN' : 'OUT'}</span></td>
            <td>${t.type === 'checkin' ? '+' : '-'}${t.quantity}</td>
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
