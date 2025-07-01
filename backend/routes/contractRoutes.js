/**
 * Contract routes - Flow 3
 * Handles contract upload, approval, and email notifications
 */

const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const axios = require('axios');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validation');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Validation schemas
const searchSchema = Joi.object({
  indent_number: Joi.string().required()
});

const approveSchema = Joi.object({
  contract_id: Joi.string().uuid().required()
});

/**
 * @route   GET /api/contract/search
 * @desc    Search procurement details by indent number
 * @access  Private
 */
router.get('/search', 
  authenticateToken,
  validateQuery(searchSchema),
  asyncHandler(async (req, res) => {
    const { indent_number } = req.query;

    const { data: procurement, error } = await supabase
      .from('procurement_dump')
      .select(`
        *,
        allocation:allocation_id (
          *,
          branch_information:branch_id (
            branch_name,
            branch_code,
            zone,
            state,
            branch_email_id
          )
        )
      `)
      .eq('indent_number', indent_number)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
      

    if (error || !procurement) {
      return res.status(404).json({
        success: false,
        message: 'Procurement details not found for the given indent number'
      });
    }

    res.json({
      success: true,
      data: {
        procurement
      }
    });
  })
);

/**
 * @route   POST /api/contract/upload
 * @desc    Upload contract PDF file
 * @access  Private
 */
router.post('/upload', 
  authenticateToken,
  upload.single('contract'),
  asyncHandler(async (req, res) => {
    const { indent_number, firm_name } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Contract PDF file is required'
      });
    }

    if (!indent_number || !firm_name) {
      return res.status(400).json({
        success: false,
        message: 'Indent number and firm name are required'
      });
    }

    // Generate unique filename
    const fileExtension = '.pdf';
    const fileName = `${firm_name.replace(/[^a-zA-Z0-9]/g, '_')}_${indent_number}_PurchaseContract_${uuidv4()}${fileExtension}`;
    const filePath = `contracts/${fileName}`;

    try {
      // Upload file to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('contracts')
        .upload(filePath, req.file.buffer, {
          contentType: 'application/pdf',
          cacheControl: '3600'
        });

      if (uploadError) {
        throw new Error(`File upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('contracts')
        .getPublicUrl(filePath);

      // Save contract record to database
      const contractData = {
        indent_number,
        firm_name,
        file_url: urlData.publicUrl,
        file_name: fileName,
        uploaded_by: req.user.id,
        status: 'pending'
      };

      const { data: contract, error: contractError } = await supabase
        .from('purchase_contract_table')
        .insert(contractData)
        .select()
        .single();

      if (contractError) {
        // If database insert fails, try to delete the uploaded file
        await supabase.storage
          .from('contracts')
          .remove([filePath])
          .catch(console.error);

        throw new Error(`Failed to save contract record: ${contractError.message}`);
      }

      // Log contract upload
      await supabase
        .from('contract_logs')
        .insert({
          contract_id: contract.id,
          action: 'uploaded',
          user_id: req.user.id,
          notes: `Contract uploaded: ${fileName}`
        });

      // Log to audit table
      await supabase
        .from('audit_log')
        .insert({
          table_name: 'purchase_contract_table',
          record_id: contract.id,
          action: 'CONTRACT_UPLOADED',
          user_id: req.user.id,
          new_values: contractData
        });

      // Trigger n8n webhook for admin notification
      try {
        const webhookUrl = `${process.env.N8N_BASE_URL}${process.env.N8N_CONTRACT_UPLOAD_NOTIFICATION_WEBHOOK}`;
        
        await axios.post(webhookUrl, {
          contract_id: contract.id,
          indent_number,
          firm_name,
          uploaded_by: {
            id: req.user.id,
            name: `${req.user.first_name} ${req.user.last_name}`,
            email: req.user.email
          },
          uploaded_at: contract.uploaded_at
        });
      } catch (webhookError) {
        console.error('n8n webhook notification failed:', webhookError);
        // Don't fail the request if webhook fails
      }

      res.status(201).json({
        success: true,
        message: 'Contract uploaded successfully. Waiting for admin approval.',
        data: {
          contract
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  })
);

/**
 * @route   POST /api/contract/approve-send
 * @desc    Approve contract and send via email
 * @access  Private (Admin only)
 */
router.post('/approve-send', 
  authenticateToken,
  authorizeRoles('admin'),
  validateBody(approveSchema),
  asyncHandler(async (req, res) => {
    const { contract_id } = req.body;

    // Fetch contract details
    const { data: contract, error: contractError } = await supabase
      .from('purchase_contract_table')
      .select('*')
      .eq('id', contract_id)
      .single();

    if (contractError || !contract) {
      return res.status(404).json({
        success: false,
        message: 'Contract not found'
      });
    }

    if (contract.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Contract is not in pending status'
      });
    }

    // Get branch email from procurement details
    const { data: procurement, error: procurementError } = await supabase
      .from('procurement_dump')
      .select(`
        *,
        allocation:allocation_id (
          branch_information:branch_id (
            branch_email_id,
            branch_name
          )
        )
      `)
      .eq('indent_number', contract.indent_number)
      .single();

    if (procurementError || !procurement) {
      return res.status(404).json({
        success: false,
        message: 'Procurement details not found'
      });
    }

    const branchEmail = procurement.allocation.branch_information.branch_email_id;
    
    if (!branchEmail) {
      return res.status(400).json({
        success: false,
        message: 'Branch email not found'
      });
    }

    try {
      // Update contract status
      const { data: updatedContract, error: updateError } = await supabase
        .from('purchase_contract_table')
        .update({
          status: 'approved',
          approved_by: req.user.id,
          approved_at: new Date().toISOString(),
          sent_to_email: branchEmail,
          sent_at: new Date().toISOString()
        })
        .eq('id', contract_id)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update contract: ${updateError.message}`);
      }

      // Log contract approval
      await supabase
        .from('contract_logs')
        .insert({
          contract_id,
          action: 'approved',
          user_id: req.user.id,
          notes: `Contract approved and sent to ${branchEmail}`
        });

      // Log to audit table
      await supabase
        .from('audit_log')
        .insert({
          table_name: 'purchase_contract_table',
          record_id: contract_id,
          action: 'CONTRACT_APPROVED_SENT',
          user_id: req.user.id,
          old_values: { status: 'pending' },
          new_values: { status: 'approved', sent_to: branchEmail }
        });

      // Trigger n8n webhook to send email
      const webhookUrl = `${process.env.N8N_BASE_URL}${process.env.N8N_CONTRACT_APPROVE_SEND_WEBHOOK}`;
      
      const emailData = {
        to_email: branchEmail,
        subject: `New Purchase Contract for Indent #${contract.indent_number}`,
        contract_details: {
          indent_number: contract.indent_number,
          firm_name: contract.firm_name,
          branch_name: procurement.allocation.branch_information.branch_name,
          file_url: contract.file_url,
          approved_by: `${req.user.first_name} ${req.user.last_name}`
        },
        approved_by: req.user.id
      };

      const response = await axios.post(webhookUrl, emailData);

      // Update contract with sent status
      await supabase
        .from('purchase_contract_table')
        .update({ status: 'sent' })
        .eq('id', contract_id);

      res.json({
        success: true,
        message: 'Contract approved and sent successfully',
        data: {
          contract: updatedContract,
          email_sent_to: branchEmail,
          n8n_response: response.data
        }
      });
    } catch (error) {
      console.error('Contract approval error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to approve and send contract',
        error: error.message
      });
    }
  })
);

/**
 * @route   GET /api/contract/pending
 * @desc    Get all pending contracts for admin approval
 * @access  Private (Admin only)
 */
router.get('/pending', 
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    const { data: contracts, error } = await supabase
      .from('purchase_contract_table')
      .select(`
        *,
        uploaded_user:uploaded_by (
          first_name,
          last_name,
          email
        )
      `)
      .eq('status', 'pending')
      .order('uploaded_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch pending contracts',
        error: error.message
      });
    }

    res.json({
      success: true,
      data: {
        contracts,
        count: contracts.length
      }
    });
  })
);

/**
 * @route   GET /api/contract/logs
 * @desc    Get contract logs (audit trail)
 * @access  Private (Admin only)
 */
router.get('/logs', 
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { data: logs, error, count } = await supabase
      .from('contract_logs')
      .select(`
        *,
        purchase_contract_table:contract_id (
          indent_number,
          firm_name,
          status
        ),
        users:user_id (
          first_name,
          last_name,
          email
        )
      `, { count: 'exact' })
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch contract logs',
        error: error.message
      });
    }

    const totalPages = Math.ceil(count / limit);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          current_page: page,
          total_pages: totalPages,
          total_records: count,
          has_next: page < totalPages,
          has_previous: page > 1,
          per_page: limit
        }
      }
    });
  })
);

module.exports = router;