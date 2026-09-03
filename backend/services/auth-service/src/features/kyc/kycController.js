const kycService = require("./kycService");
const { upload } = require("./kycStorage");

const submit = [
  upload.single("document"),
  async (req, res, next) => {
    try {
      const result = await kycService.submitKyc({
        userId: req.userId,
        shopName: req.body.shopName,
        idCardNumber: req.body.idCardNumber,
        address: req.body.address,
        bankAccount: req.body.bankAccount,
        file: req.file,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
];

async function mine(req, res, next) {
  try {
    res.json(await kycService.getMine(req.userId));
  } catch (err) {
    next(err);
  }
}

async function viewDocument(req, res, next) {
  try {
    const { path: filePath, fileType } = await kycService.viewDocument({
      applicationId: req.params.applicationId,
      userId: req.userId,
      permissions: req.permissions,
    });
    res.setHeader("Content-Type", fileType);
    require("fs").createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
}

module.exports = { submit, mine, viewDocument };
