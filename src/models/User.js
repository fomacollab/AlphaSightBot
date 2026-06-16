const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: { type: String, default: null },
  firstName: { type: String, default: null },
  lastName: { type: String, default: null },
  country: { type: String, default: null },
  capitalRange: { type: String, default: null },
  currentStage: { type: String, default: 'IDLE' },
  lastStageReached: { type: String, default: 'IDLE' },
  awaitingEmailInput: { type: Boolean, default: false },
  emailLookupAttempts: { type: Number, default: 0 },
  registrationEmail: { type: String, default: null },
  selectedLibraryIndex: { type: Number, default: 0 },
  adminSection: { type: String, default: 'HOME' },
  nudgeHistory: { type: [String], default: [] },
  lastActionAt: { type: Date, default: Date.now },
  lastNudgeAt: { type: Date, default: null },
  lastEscalationReason: { type: String, default: null },
  handedToCharles: { type: Boolean, default: false },
  onboardingComplete: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

userSchema.pre('save', function stamp(next) {
  this.updatedAt = new Date();
  next();
});

userSchema.index(
  { registrationEmail: 1 },
  {
    unique: true,
    partialFilterExpression: { registrationEmail: { $type: 'string' } },
    collation: { locale: 'en', strength: 2 }
  }
);

module.exports = mongoose.model('User', userSchema);
