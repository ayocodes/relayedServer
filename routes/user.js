const UniversalProfileContract = require("@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json");
const KeyManagerContract = require("@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json");
const router = require("express").Router();
const Web3 = require("web3");
let User = require("../models/user");
const axios = require("axios");
//
//create new user
router.route("/newuser/:UPAddress").get(async (req, res) => {
  const { UPAddress } = req.params;
  const oldUser = await User.findOne({ UPAddress: UPAddress }).exec();
  if (!oldUser) {
    const createdUser = await User.create({
      UPAddress: UPAddress,
      newUser: true,
      quota: { remainingQuota: 50, totalQuota: 50 },
    });
  }
  const user = await User.find({ UPAddress: UPAddress });
  res.json(user);
  // res.status(200).json(`user sent`);
});

//change newuser to false
router.route("/update").put(async (req, res) => {
  const { newUser, UPAddress } = req.body;

  await User.updateOne({ UPAddress: UPAddress }, { newUser: false })
    .then((updated) => res.status(200).json(updated))
    .catch((err) => res.status(400).json("failed"));
});

//
//get all transactions
router.route("/transactions").get((req, res) => {
  User.find()
    .then((transaction) => res.json(transaction))
    .catch((err) => res.status(400).json(`Error: ${err}`));
});

//
//get all transactions for a user
router.route("/transactions/:UPAddress").get((req, res) => {
  const { UPAddress } = req.params;
  User.find({ UPAddress: UPAddress })
    .then((transaction) => res.json(transaction))
    .catch((err) => res.status(400).json(`Error: ${err}`));
});

//updating quota share
router.route("/updateQuotaStatus").put(async (req, res) => {
  const { recieverAddress, giverUPAddress } = req.body;
  const user = await User.findOne({ UPAddress: giverUPAddress }).exec();
  const quota = user.quota.remainingQuota;

  try {
    const giver = User.updateOne(
      { UPAddress: giverUPAddress },
      { $push: { shareQuota: [{ UPAddress: recieverAddress }] } }
    );
    const receiver = User.updateOne(
      { UPAddress: recieverAddress },
      {
        $push: {
          receiveQuota: [{ UPAddress: giverUPAddress, quota: quota }],
        },
      }
    );
    Promise.all([giver, receiver]).then((update) =>
      res.status(200).json(update)
    );
  } catch (err) {
    res.status(400).json(`message: ${err}`);
  }
});

//delete user
router.route("/delete").delete(async (req, res) => {
  const { _id, UPAddress } = req.body;
  await User.findOneAndUpdate(
    { UPAddress: UPAddress },
    { $pull: { shareQuota: { _id: _id } } },
    { safe: true, multi: false }
  );
  return res.status(200).json({ message: "User Deleted Successfully" });
});

//get address that is sharing with you
router.route("/getReciveQuota/:UPAddress").get((req, res) => {
  const { UPAddress } = req.params;

  User.find({ UPAddress: UPAddress })
    .then((user) => res.json(user))
    .catch((err) => res.status(400).json(`Error: ${err}`));
});

//verify transaction on paystack
router.route("/verifyTransaction").put(async (req, res) => {
  const { reference, UPAddress } = req.body;
  const user = await User.findOne({ UPAddress: UPAddress }).exec();

  await axios
    .get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        authorization: "sk_test_3ccbe7c3f12d7e3cb16a2b50be2cf597d92995f7",
        "content-type": "application/json",
        "cache-control": "no-cache",
      },
    })
    .then((success) => {
      output = success;
    })
    .catch((error) => {
      output = error;
    });
  //check for internet connectivity issues
  if (!output.response && output.status !== 200)
    console.log("No internet Connection");
  //confirm that there was no error in verification.
  if (output.response && !output.response.data.status)
    console.log(
      "Error verifying payment, unknown Transaction or Reference Id'"
    );

  res.json(user.quota.gas);
  User.updateOne(
    { UPAddress: UPAddress },
    {
      $push: {
        quota: {
          gas: user.quota.gas + 5647484940,
          totalQuota: Math.ceil(gasBalance / 68119),
          remainingQuota: Math.ceil(gasBalance / 68119),
        },
      },
    }
  );
});

//
//executing relay call
router.route("/execute").put(async (req, res) => {
  const { UPAddress, EOA, signature, hash, nonce, abiPayload } = req.body;

  const user = await User.findOne({ UPAddress: UPAddress }).exec();
  if (!user) {
    res.status(400).json(`you are not in our database`);
    return;
  }
  //check quota balance
  if (user.quota.gas < 40000 || user.receiveQuota[0].quota < 40000) {
    res
      .status(400)
      .json("your balance is too low to complete this transaction");
    return;
  }

  try {
    const web3 = new Web3("https://rpc.l16.lukso.network");

    const d = web3.eth.accounts.recover(hash, signature);

    if (d !== EOA) {
      return;
    }

    const myUniversalProfile = new web3.eth.Contract(
      UniversalProfileContract.abi,
      UPAddress
    );

    const keyManagerAddress = await myUniversalProfile.methods.owner().call();
    const KeyManager = new web3.eth.Contract(
      KeyManagerContract.abi,
      keyManagerAddress
    );

    web3.eth.accounts.wallet.add(
      "0x06cec69e237e4eb0dd8e98c77ce7e9ee5c2cfb20f74f6550f3e86968c27edd90"
    );

    const executeRelayCallTransaction = await KeyManager.methods
      .executeRelayCall(signature, nonce, abiPayload)
      .send({
        from: "0x8707E56B689B32fCb11Bbe0580a632Ba5fFC97DE",
        gasLimit: 300_000,
      });

    const transaction = {
      success: true,
      controllerAccount: EOA,
      date: Date(),
      transactionHash: executeRelayCallTransaction.transactionHash,
      gasUsed: executeRelayCallTransaction.cumulativeGasUsed,
    };

    //deduct quota
    const gasBalance = user.quota.gas - transaction.gasUsed;
    const quotaBalance = {
      gas: gasBalance,
      remainingQuota: Math.ceil(gasBalance / 68119),
      unit: user.quota.unit,
      totalQuota: user.quota.totalQuota,
      date: Date(),
    };
    User.updateOne({ UPAddress: UPAddress }, { quota: quotaBalance }).then(
      () => {}
    );

    User.updateOne(
      { UPAddress: UPAddress },
      { $push: { transaction: [transaction] } }
    )
      .then((user) => res.status(200).json(user))
      .catch((err) => res.status(400).json(`message: ${err}`));
  } catch (err) {
    res.status(400).json(`message: ${err}`);
  }
});

module.exports = router;
