const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const fs = require("fs");

let callGasLimit = 500000;
let verificationGasLimit = 700000;
let preVerificationGas = 0;
let maxFeePerGas = 100000000;
let maxPriorityFeePerGas = 100000000;

async function getSigTime(sigTime, isV06 = false) {
  if (sigTime == null || sigTime == 0) {
    sigTime = ethers.BigNumber.from("281474976710655");
  }

  if(isV06) {
    sigTime = sigTime.mul(ethers.BigNumber.from("2").pow(160));
  }
  return sigTime;
}

async function generateAccount(params) {
  if (params.random == null) {
    params.random = Math.floor(Math.random() * 1000001);
  }

  const nonce = 0;
  let initializeData = params.SmartAccount.interface.encodeFunctionData(
    "Initialize",
    [params.owner.address]
  );

  const sender = await params.SmartAccountProxyFactory.getAddress(
    params.SmartAccount.address,
    initializeData,
    params.random
  );

  const data = params.SmartAccountProxyFactory.interface.encodeFunctionData(
    "createAccount",
    [params.SmartAccount.address, initializeData, params.random]
  );

  const initCode = ethers.utils.solidityPack(
    ["address", "bytes"],
    [params.SmartAccountProxyFactory.address, data]
  );

  let userOp = await generateSignedUOP({
    sender: sender,
    nonce: nonce,
    initCode: initCode,
    callData: "0x",
    paymasterAndData: "0x",
    owner: params.owner,
    SmartAccount: params.SmartAccount,
    EntryPoint: params.EntryPoint.address,
    sigTime: params.sigTime,
    sigType: params.sigType,
  });

  let tx = await params.owner.sendTransaction({
    to: sender,
    value: ethers.utils.parseEther("0.01"), // Sends exactly 1.0 ether
  });
  await tx.wait();

  tx = await params.EntryPoint.connect(params.bundler).mockhandleOps([userOp]);
  await tx.wait();

  return sender;
}

async function generateUOP(
  sender,
  nonce,
  initCode,
  callData,
  paymasterAndData
) {
  let userOp = {
    sender: sender,
    nonce: nonce,
    initCode: initCode,
    callData: callData,
    callGasLimit: callGasLimit,
    verificationGasLimit: verificationGasLimit,
    preVerificationGas: preVerificationGas,
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
    params.paymasterAndData
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

async function generateFreePaymasterUOP(params, sender, nonce, callData) {
  if (params.sigTime == null || params.sigTime == 0) {
    params.sigTime = ethers.BigNumber.from(
      "0x000000000000ffffffffffff0000000000000000000000000000000000000000"
    );
  }
  let userOp = await generateUOP(sender, nonce, "0x", callData, "0x");
  const paymastersignature = await params.signer.signMessage(
    ethers.utils.arrayify(
      await params.FreeGasPaymaster.getHash(userOp, params.sigTime)
    )
  );
  userOp.paymasterAndData = ethers.utils.solidityPack(
    ["address", "bytes32", "bytes"],
    [
      params.FreeGasPaymaster.address,
      ethers.utils.hexZeroPad(params.sigTime, 32),
      paymastersignature,
    ]
  );
  userOp.signature = "0x";
  return userOp;
}

async function generateFreePaymasterWithUOP(userOp, params) {
  if (params.sigTime == null || params.sigTime == 0) {
    params.sigTime = ethers.BigNumber.from(
      "0x000000000000ffffffffffff0000000000000000000000000000000000000000"
    );
  }
  const paymastersignature = await params.signer.signMessage(
    ethers.utils.arrayify(
      await params.FreeGasPaymaster.getHash(userOp, params.sigTime)
    )
  );
  userOp.paymasterAndData = ethers.utils.solidityPack(
    ["address", "bytes32", "bytes"],
    [
      params.FreeGasPaymaster.address,
      ethers.utils.hexZeroPad(params.sigTime, 32),
      paymastersignature,
    ]
  );
  userOp.signature = "0x";
  return userOp;
}

async function paymasterSign(params, userOp, isV06 = false) {
  params.sigTime = await getSigTime(params.sigTime, isV06);

  const paymastersignature = await params.signer.signMessage(
    ethers.utils.arrayify(
      await params.TokenPaymaster.getHash(
        userOp,
        params.TestToken.address,
        params.exchangeRate,
        params.sigTime
      )
    )
  );

  let paymasterAndData = ethers.utils.solidityPack(
    ["address", "address", "uint256", "bytes32", "bytes"],
    [
      params.TokenPaymaster.address,
      params.TestToken.address,
      params.exchangeRate,
      ethers.utils.hexZeroPad(params.sigTime, 32),
      paymastersignature,
    ]
  );

  return paymasterAndData;
}

async function generatePaymasterUOP(params, sender, nonce, callData) {
  let userOp = await generateUOP(sender, nonce, "0x", callData, "0x");

  userOp.paymasterAndData = await paymasterSign(params, userOp);
  userOp.signature = "0x";

  return userOp;
}

async function generateNPaymasterUOP(params, sender, nonce, callData) {
  let UOPs = [];
  for (let index = 0; index < sender.length; index++) {
    UOP[index] = await generatePaymasterUOP(
      params,
      sender[index],
      nonce,
      callData
    );
  }

  return UOPs;
}

async function generateNUOP(sender, nonce, calldata) {
  let UOP = [];
  for (let index = 0; index < sender.length; index++) {
    UOP[index] = await generateUOP(sender[index], nonce, "0x", callData, "0x");
  }
  return UOP;
}

async function generateNSignedUOP(params, sender, nonce, callData) {
  let UOPs = [];
  for (let index = 0; index < sender.length; index++) {
    UOP[index] = await generateSignedUOP({
      sender: sender[index],
      nonce: nonce,
      initCode: "0x",
      callData: callData,
      paymasterAndData: "0x",
      owner: params.owner,
      SmartAccount: params.SmartAccount,
      EntryPoint: params.EntryPoint,
      sigTime: params.sigTime,
      sigType: params.sigType,
    });
  }

  return UOPs;
}

async function generateSignature(
  owner,
  SmartAccount,
  EntryPoint,
  userOp,
  sigTime,
  sigType
) {
  sigTime = await getSigTime(sigTime);

  if (sigType == null || sigType == 0) {
    sigType = ethers.BigNumber.from("0");

    const network = await hre.ethers.provider.getNetwork();

    let domain = {
      name: "SA",
      version: "1.0",
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

async function createDeployFactory() {
  const DeployFactory = await (
    await ethers.getContractFactory("DeployFactory")
  ).deploy();

  await DeployFactory.deployed();

  const data = fs.readFileSync("setting.json");
  const settings = JSON.parse(data);

  settings.DeployFactory = DeployFactory.address;

  const newSettingsData = JSON.stringify(settings, null, 2);

  fs.writeFileSync("setting.json", newSettingsData);

  return DeployFactory;
}

async function getDeployFactory() {
  let data = fs.readFileSync("setting.json");

  let addresses = JSON.parse(data);

  DeployFactory = await ethers
    .getContractFactory("DeployFactory")
    .then((f) => f.attach(addresses["DeployFactory"]));

  return DeployFactory;
}

async function deploy(owner, DeployFactory, SmartAccount, salt) {
  let initializeData = SmartAccount.interface.encodeFunctionData("Initialize", [
    owner.address,
  ]);

  const data = DeployFactory.interface.encodeFunctionData("createAccount", [
    SmartAccount.address,
    initializeData,
    salt,
  ]);

  await DeployFactory.createAccount(SmartAccount.address, initializeData, salt);

  return await DeployFactory.getAddress(
    SmartAccount.address,
    initializeData,
    salt
  );
}


async function generateUOPWithManualGasLimit(
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

async function generateSignedUOPWithManualGasLimit(params) {
  let userOp = await generateUOPWithManualGasLimit(
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



module.exports = {
  generateAccount,
  generateUOP,
  generateSignedUOP,
  generateSignedUOPWithManualGasLimit,
  generateNUOP,
  generateNSignedUOP,
  generateFreePaymasterUOP,
  generateFreePaymasterWithUOP,
  paymasterSign,
  generatePaymasterUOP,
  generateNPaymasterUOP,
  generateSignature,
  deploy,
  getDeployFactory,
  createDeployFactory,
  getSigTime
};
