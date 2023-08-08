const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const fs = require("fs");

let callGasLimit = 500000;
let verificationGasLimit = 7000000;
let preVerificationGas = 0;
let maxFeePerGas = 100000000;
let maxPriorityFeePerGas = 100000000;


async function generateUOP(
  sender,
  nonce,
  initCode,
  callData,
  paymasterAndData,
  manualVerificationGasLimit,
  manualPreVerificationGas,
  manualCallGasLimit
) {

  let userOp = {
    sender: sender,
    nonce: nonce,
    initCode: initCode,
    callData: callData,
    callGasLimit: manualCallGasLimit !== null ? manualCallGasLimit : callGasLimit,
    verificationGasLimit: manualVerificationGasLimit !== null ? manualVerificationGasLimit : verificationGasLimit,
    preVerificationGas: manualPreVerificationGas !== null ? manualPreVerificationGas : preVerificationGas,
    maxFeePerGas: maxFeePerGas,
    maxPriorityFeePerGas: maxPriorityFeePerGas,
    paymasterAndData: paymasterAndData,
    signature: "0x",
  };

  return userOp;
}

async function generateSignedUOP(params) {
  let userOp = await generateUOP(
    params.sender,
    params.nonce,
    params.initCode,
    params.callData,
    params.paymasterAndData,
    params.manualVerificationGasLimit,
    params.manualPreVerificationGas,
    params.manualCallGasLimit
  );

  userOp.signature = await generateSignature(
    params.owner,
    params.SmartAccount,
    params.EntryPoint,
    userOp,
    params.sigTime,
    params.sigType
  );

  return userOp;
}


async function generateSignature(
  owner,
  SmartAccount,
  EntryPoint,
  userOp,
  sigTime,
  sigType
) {
  if (sigTime == null || sigTime == 0) {
    sigTime = ethers.BigNumber.from(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );
  }

  if (sigType == null || sigType == 0) {
    sigType = ethers.BigNumber.from("0");

    const network = await hre.ethers.provider.getNetwork();

    let domain = {
      name: JSON.parse(fs.readFileSync("DeployInformation.json"))[
        "SmartAccount"
      ]["name"],
      version: JSON.parse(fs.readFileSync("DeployInformation.json"))[
        "SmartAccount"
      ]["version"],
      chainId: network.chainId,
      verifyingContract: SmartAccount.address,
    };

    let types = {
      SignMessage: [
        { name: "sender", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "initCode", type: "bytes" },
        { name: "callData", type: "bytes" },
        { name: "callGasLimit", type: "uint256" },
        { name: "verificationGasLimit", type: "uint256" },
        { name: "preVerificationGas", type: "uint256" },
        { name: "maxFeePerGas", type: "uint256" },
        { name: "maxPriorityFeePerGas", type: "uint256" },
        { name: "paymasterAndData", type: "bytes" },
        { name: "EntryPoint", type: "address" },
        { name: "sigTime", type: "uint256" },
      ],
    };

    let value = {
      sender: userOp.sender,
      nonce: userOp.nonce,
      initCode: userOp.initCode,
      callData: userOp.callData,
      callGasLimit: userOp.callGasLimit,
      verificationGasLimit: userOp.verificationGasLimit,
      preVerificationGas: userOp.preVerificationGas,
      maxFeePerGas: userOp.maxFeePerGas,
      maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
      paymasterAndData: userOp.paymasterAndData,
      EntryPoint: EntryPoint,
      sigTime: sigTime,
    };

    let signature = await owner._signTypedData(domain, types, value);

    signature = ethers.utils.solidityPack(
      ["uint8", "uint256", "bytes"],
      [
        ethers.utils.hexZeroPad(sigType, 1),
        ethers.utils.hexZeroPad(sigTime, 32),
        signature,
      ]
    );
    return signature;
  } else {
    sigType = ethers.BigNumber.from("1");
    userOp.signature = ethers.utils.solidityPack(
      ["uint8", "uint256"],
      [
        ethers.utils.hexZeroPad(sigType, 1),
        ethers.utils.hexZeroPad(sigTime, 32),
      ]
    );

    var orderHash = await SmartAccount.getUOPHash(sigType, EntryPoint, userOp);

    let signature = ethers.utils.solidityPack(
      ["uint8", "uint256", "bytes"],
      [
        ethers.utils.hexZeroPad(sigType, 1),
        ethers.utils.hexZeroPad(sigTime, 32),
        await owner.signMessage(ethers.utils.arrayify(orderHash)),
      ]
    );

    return signature;
  }
}



module.exports = {
  generateUOP,
  generateSignedUOP,
  generateSignature,
};
