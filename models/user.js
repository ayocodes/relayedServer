const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userSchema = new Schema(
  {
    UPAddress: {
      type: String,
      required: true,
    },
    newUser: { type: Boolean, default: false },
    transaction: [
      {
        success: Boolean,
        transactionHash: String,
        controllerAccount: String,
        date: Date,
        gasUsed: Number,
      },
    ],
    quota: {
      gas: {type:Number, default: 3405950},
      remainingQuota: Number,
      totalQuota: Number,
      unit: { type: String, default: "rlyx" },
      date: Date,
    },
    shareQuota: [{ UPAddress: String }],
    receiveQuota: [{ UPAddress: String, quota: Number}],
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
