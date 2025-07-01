/**
 * Allocation routes - Flow 2
 * Handles allocation listing and management
 */

const express = require('express');
const Joi = require('joi');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validateQuery } = require('../middleware/validation');

const router = express.Router();

// Validation schemas
const getAllocationsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().valid('pending', 'active', 'completed', 'cancelled'),
  branch_id: Joi.string().uuid(),
  search: Joi.string().max(100)
});

/**
 * @route   GET /api/allocations
 * @desc    Get list of allocations with pagination and filtering
 * @access  Private (All authenticated users)
 */
router.get('/', 
  authenticateToken, 
  validateQuery(getAllocationsSchema), 
  asyncHandler(async (req, res) => {
    const { page, limit, status, branch_id, search } = req.query;
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('allocation')
      .select(`
        *,
        branch_information:branch_id (
          branch_name,
          branch_code,
          zone
        ),
        parsed_data:parsed_data_id (
          firm_name,
          centre_name,
          variety,
          fibre_length
        )
      `, { count: 'exact' });

    // Apply filters
    if (status) {
      query = query.eq('allocation_status', status);
    }

    if (branch_id) {
      query = query.eq('branch_id', branch_id);
    }

    if (search) {
      query = query.or(`indent_number.ilike.%${search}%,branch_name.ilike.%${search}%`);
    }

    // Role-based filtering
    if (req.user.role === 'trader') {
      // Traders can only see their own allocations
      // This would require a created_by field in allocation table
      // For now, we'll show all allocations
    }

    // Add pagination and sorting
    const { data: allocations, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch allocations',
        error: error.message
      });
    }

    // Calculate pagination info
    const totalPages = Math.ceil(count / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    res.json({
      success: true,
      data: {
        allocations,
        pagination: {
          current_page: page,
          total_pages: totalPages,
          total_records: count,
          has_next: hasNext,
          has_previous: hasPrev,
          per_page: limit
        }
      }
    });
  })
);

/**
 * @route   GET /api/allocations/:id
 * @desc    Get single allocation details
 * @access  Private
 */
router.get('/:id', 
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { data: allocation, error } = await supabase
      .from('allocation')
      .select(`
        *,
        branch_information:branch_id (
          branch_name,
          branch_code,
          zone,
          state,
          branch_email_id
        ),
        parsed_data:parsed_data_id (
          *
        ),
        procurement_dump (
          *
        )
      `)
      .eq('id', id)
      .single();

    if (error || !allocation) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found'
      });
    }

    res.json({
      success: true,
      data: {
        allocation
      }
    });
  })
);

/**
 * @route   PUT /api/allocations/:id/status
 * @desc    Update allocation status
 * @access  Private (Admin only)
 */
router.put('/:id/status', 
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['pending', 'active', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const { data: allocation, error } = await supabase
      .from('allocation')
      .update({
        allocation_status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update allocation status',
        error: error.message
      });
    }

    // Log the status change
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'allocation',
        record_id: id,
        action: 'STATUS_UPDATE',
        user_id: req.user.id,
        old_values: { status: allocation.allocation_status },
        new_values: { status, notes }
      });

    res.json({
      success: true,
      message: 'Allocation status updated successfully',
      data: {
        allocation
      }
    });
  })
);

/**
 * @route   GET /api/allocations/stats/overview
 * @desc    Get allocation statistics overview
 * @access  Private (Admin only)
 */
router.get('/stats/overview', 
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    // Get allocation counts by status
    const { data: statusCounts, error: statusError } = await supabase
      .from('allocation')
      .select('allocation_status')
      .then(({ data, error }) => {
        if (error) return { data: null, error };
        
        const counts = data.reduce((acc, item) => {
          acc[item.allocation_status] = (acc[item.allocation_status] || 0) + 1;
          return acc;
        }, {});
        
        return { data: counts, error: null };
      });

    if (statusError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        error: statusError.message
      });
    }

    // Get total bale quantities
    const { data: totalBales, error: balesError } = await supabase
      .from('allocation')
      .select('bale_quantity')
      .then(({ data, error }) => {
        if (error) return { data: 0, error };
        
        const total = data.reduce((sum, item) => sum + (item.bale_quantity || 0), 0);
        return { data: total, error: null };
      });

    if (balesError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch bale statistics',
        error: balesError.message
      });
    }

    res.json({
      success: true,
      data: {
        status_counts: statusCounts,
        total_bales: totalBales,
        generated_at: new Date().toISOString()
      }
    });
  })
);

module.exports = router;