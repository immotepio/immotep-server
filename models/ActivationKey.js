const mongoose = require('mongoose');

const activationKeySchema = new mongoose.Schema({
  key: {
    type: String,
    unique: true,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  used_at: Date,
  status: {
    type: String,
    default: 'unused',
  },
  use_count: {
    type: Number,
    default: 0,
  },
  max_uses: {
    type: Number,
    default: 2,
  },
});

module.exports = mongoose.model('ActivationKey', activationKeySchema);
