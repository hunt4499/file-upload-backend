const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const mongoose = require('mongoose');
const File = require('../models/File');
const authMiddleware = require('../middleware/auth');
const { uploadToS3, deleteFromS3 } = require('../services/fileStorage');

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'video/mp4'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// File upload route with additional validation
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { tags } = req.body;
    const file = req.file;
    
    // Validate tags if they exist
    if (tags && !Array.isArray(tags)) {
      throw new Error('Tags must be an array');
    }
    
    // Upload file to S3
    const path = await uploadToS3(file);
    const shareableLink = crypto.randomBytes(32).toString('hex');
    
    const fileDoc = new File({
      userId: req.user.userId,
      filename: file.originalname,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      path,
      tags: tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [],
      shareableLink,
    });
    await fileDoc.save();
    
    res.status(201).json(fileDoc);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get list of files with validation for userId
router.get('/list', authMiddleware, async (req, res) => {
  try {
    const files = await File.find({ userId: req.user.userId });
    res.json(files);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Share file and increment view count
router.post('/:fileId/share', authMiddleware, async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      throw new Error('Invalid file ID');
    }

    const file = await File.findOne({
      _id: fileId,
      userId: req.user.userId,
    });
    
    if (!file) {
      throw new Error('File not found');
    }

    file.views += 1;
    await file.save();

    if (!file.shareableLink) {
      file.shareableLink = crypto.randomBytes(32).toString('hex');
      await file.save();
    }

    res.json(file);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// Shared file access via link
router.get('/shared/:link', async (req, res) => {
  try {
    const file = await File.findOne({ shareableLink: req.params.link });
    if (!file) throw new Error('File not found');
    
    file.views += 1;
    await file.save();
    
    res.json(file);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// Stats for a file
router.get('/stats/:fileId', authMiddleware, async (req, res) => {
  try {
    const { fileId } = req.params;

    // Validate fileId format
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      throw new Error('Invalid file ID');
    }

    const file = await File.findOne({
      _id: fileId,
      userId: req.user.userId,
    });
    if (!file) throw new Error('File not found');
    
    res.json({ views: file.views });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// Delete file route with validation
router.delete('/:fileId', authMiddleware, async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      throw new Error('Invalid file ID');
    }

    const file = await File.findOne({
      _id: fileId,
      userId: req.user.userId,
    });
    
    if (!file) throw new Error('File not found or not authorized to delete');
    
    await deleteFromS3(file.path);
    await File.findOneAndDelete({ _id: fileId });
    
    res.status(200).json({ message: 'File deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Add tags to file with validation
router.post('/:fileId/tags', authMiddleware, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { tags } = req.body;

    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      throw new Error('Invalid file ID');
    }

    if (!Array.isArray(tags)) {
      throw new Error('Tags must be an array');
    }
    if (tags.length === 0) {
      throw new Error('At least one tag is required');
    }

    const file = await File.findOne({
      _id: fileId,
      userId: req.user.userId,
    });

    if (!file) {
      throw new Error('File not found');
    }

    file.tags = [...new Set([...file.tags, ...tags])]; 
    await file.save();

    res.json(file);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

module.exports = router;
