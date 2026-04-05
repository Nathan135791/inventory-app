const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const supabase = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Routes

// Get all inventory items
app.get('/api/items', async (req, res) => {
    try {
        const { search } = req.query;
        let query = supabase
            .from('inventory_items')
            .select('*')
            .order('updated_at', { ascending: false });

        if (search) {
            query = query.ilike('name', `%${search}%`);
        }

        const { data, error } = await query;

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching items:', error);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

// Get single item
app.get('/api/items/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Item not found' });
        res.json(data);
    } catch (error) {
        console.error('Error fetching item:', error);
        res.status(500).json({ error: 'Failed to fetch item' });
    }
});

// Add new item (Check-in new item)
app.post('/api/items', async (req, res) => {
    try {
        const { name, quantity, notes } = req.body;

        if (!name || quantity === undefined) {
            return res.status(400).json({ error: 'Name and quantity are required' });
        }

        const { data, error } = await supabase
            .from('inventory_items')
            .insert([{ name, quantity: parseInt(quantity), notes }])
            .select()
            .single();

        if (error) throw error;

        // Log transaction
        await supabase.from('transactions').insert([{
            item_id: data.id,
            type: 'checkin',
            quantity: parseInt(quantity),
            notes: `Initial check-in: ${notes || ''}`
        }]);

        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating item:', error);
        res.status(500).json({ error: 'Failed to create item' });
    }
});

// Check-in (add quantity to existing item)
app.post('/api/checkin', async (req, res) => {
    try {
        const { item_id, quantity, notes } = req.body;

        if (!item_id || !quantity) {
            return res.status(400).json({ error: 'Item ID and quantity are required' });
        }

        // Get current item
        const { data: item, error: fetchError } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('id', item_id)
            .single();

        if (fetchError || !item) {
            return res.status(404).json({ error: 'Item not found' });
        }

        // Update quantity
        const newQuantity = item.quantity + parseInt(quantity);
        const { data, error } = await supabase
            .from('inventory_items')
            .update({ quantity: newQuantity })
            .eq('id', item_id)
            .select()
            .single();

        if (error) throw error;

        // Log transaction
        await supabase.from('transactions').insert([{
            item_id,
            type: 'checkin',
            quantity: parseInt(quantity),
            notes
        }]);

        res.json(data);
    } catch (error) {
        console.error('Error checking in:', error);
        res.status(500).json({ error: 'Failed to check in' });
    }
});

// Check-out (remove quantity from item)
app.post('/api/checkout', async (req, res) => {
    try {
        const { item_id, quantity, notes, borrowed_by, purpose, duration } = req.body;

        if (!item_id || !quantity) {
            return res.status(400).json({ error: 'Item ID and quantity are required' });
        }

        if (!borrowed_by) {
            return res.status(400).json({ error: 'Borrower name is required' });
        }

        // Get current item
        const { data: item, error: fetchError } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('id', item_id)
            .single();

        if (fetchError || !item) {
            return res.status(404).json({ error: 'Item not found' });
        }

        if (item.quantity < parseInt(quantity)) {
            return res.status(400).json({ error: 'Insufficient quantity' });
        }

        // Calculate due date if duration provided
        let due_date = null;
        if (duration) {
            due_date = new Date();
            const durationLower = duration.toLowerCase();
            if (durationLower.includes('day')) {
                const days = parseInt(duration) || 1;
                due_date.setDate(due_date.getDate() + days);
            } else if (durationLower.includes('week')) {
                const weeks = parseInt(duration) || 1;
                due_date.setDate(due_date.getDate() + (weeks * 7));
            } else if (durationLower.includes('month')) {
                const months = parseInt(duration) || 1;
                due_date.setMonth(due_date.getMonth() + months);
            } else {
                // Default: try to parse as days
                const days = parseInt(duration) || 1;
                due_date.setDate(due_date.getDate() + days);
            }
        }

        // Update quantity and status
        const newQuantity = item.quantity - parseInt(quantity);
        const { data, error } = await supabase
            .from('inventory_items')
            .update({
                quantity: newQuantity,
                status: 'checked_out',
                borrowed_by,
                purpose,
                duration,
                due_date,
                checked_out_at: new Date().toISOString()
            })
            .eq('id', item_id)
            .select()
            .single();

        if (error) throw error;

        // Log transaction
        await supabase.from('transactions').insert([{
            item_id,
            type: 'checkout',
            quantity: parseInt(quantity),
            notes,
            borrowed_by,
            purpose,
            duration,
            due_date
        }]);

        res.json(data);
    } catch (error) {
        console.error('Error checking out:', error);
        res.status(500).json({ error: 'Failed to check out' });
    }
});

// Return item (mark as back home)
app.post('/api/return', async (req, res) => {
    try {
        const { item_id, notes } = req.body;

        if (!item_id) {
            return res.status(400).json({ error: 'Item ID is required' });
        }

        // Get current item
        const { data: item, error: fetchError } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('id', item_id)
            .single();

        if (fetchError || !item) {
            return res.status(404).json({ error: 'Item not found' });
        }

        // Update status to available
        const { data, error } = await supabase
            .from('inventory_items')
            .update({
                status: 'available',
                borrowed_by: null,
                purpose: null,
                duration: null,
                due_date: null,
                checked_out_at: null
            })
            .eq('id', item_id)
            .select()
            .single();

        if (error) throw error;

        // Log transaction
        await supabase.from('transactions').insert([{
            item_id,
            type: 'checkin',
            quantity: 0,
            notes: notes || 'Item returned'
        }]);

        res.json(data);
    } catch (error) {
        console.error('Error returning item:', error);
        res.status(500).json({ error: 'Failed to return item' });
    }
});

// Update item
app.put('/api/items/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, quantity, notes } = req.body;

        const { data, error } = await supabase
            .from('inventory_items')
            .update({ name, quantity: parseInt(quantity), notes })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error updating item:', error);
        res.status(500).json({ error: 'Failed to update item' });
    }
});

// Delete item
app.delete('/api/items/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('inventory_items')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Item deleted successfully' });
    } catch (error) {
        console.error('Error deleting item:', error);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

// Get transaction history
app.get('/api/transactions', async (req, res) => {
    try {
        const { item_id } = req.query;
        let query = supabase
            .from('transactions')
            .select(`
                *,
                inventory_items (name)
            `)
            .order('created_at', { ascending: false })
            .limit(100);

        if (item_id) {
            query = query.eq('item_id', item_id);
        }

        const { data, error } = await query;

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
    console.log(`Inventory App running at http://localhost:${PORT}`);
});
