const { ethers } = require("hardhat");
const fs = require("fs");

let maxFeePerGas = 1000000;
let maxPriorityFeePerGas = 1000000;

class SmartAccountV2 {
  constructor(params) {
    this.ownerAddress = params.ownerAddress;
    this.random = ethers.BigNumber.from(params.random);
  }

  async initialize(params) {
    let coder = new ethers.utils.AbiCoder();
    let initializeData = coder.encode(["address", "bytes"], [this.ownerAddress, "0x"]);

    this.address = await params.SmartAccountProxyFactory.getAddress(
      params.SmartAccount.address,
      initializeData,
      this.random
    );

    this.initCode = ethers.utils.solidityPack(
      ["address", "bytes"],
      [params.SmartAccountProxyFactory.address, params.SmartAccountProxyFactory.interface.encodeFunctionData(
        "createAccount",
        [params.SmartAccount.address, initializeData, this.random]
      )]
    );

  }

  async deploy(params) {
    let sender = this.address

    let userOp = await this.generateSignedUOP({
      sender: sender,
      nonce: 0,
      initCode: this.initCode,
      callData: "0x",
      paymasterAndData: "0x",
      owner: params.owner,
      SmartAccount: params.SmartAccount,
      EntryPoint: params.EntryPoint.address,
      sigTime: params.sigTime,
      sigType: params.sigType,
      callGasLimit: params.callGasLimit,
      verificationGasLimit: params.verificationGasLimit,
      preVerificationGas: params.preVerificationGas,
    });

    if ((await ethers.provider.getCode(sender)) == "0x") {
      console.log(sender + " start deploy");
    } else {
      console.log(sender + " has deployed");
      return sender;
    }

    if ((await ethers.provider.getBalance(sender)) == 0) {
      let tx = await params.owner.sendTransaction({
        to: sender,
        value: ethers.utils.parseEther("0.01"), // Sends exactly 1.0 ether
      });
      await tx.wait();
    }

    let gas = 2000000;
    if ((await hre.ethers.provider.getNetwork().chainId) == 42161) {
      gas = 30000000;
    }

    let tx = await params.EntryPoint.connect(params.bundler).handleOps([userOp], params.bundler.address, {
      gasLimit: gas,
    });

    let recepit = await tx.wait();

    if ((await ethers.provider.getCode(sender)) == "0x") {
      console.log(sender + " deploy failed");
    } else {
      console.log(sender + " deploy success");
    }

    return sender;
  }

  async generateUOP(
    sender,
    nonce,
    initCode,
    callData,
    paymasterAndData,
    verificationGasLimit,
    preVerificationGas,
    callGasLimit
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

  async generateSignedUOP(params) {
    let userOp = await this.generateUOP(
      params.sender,
      params.nonce,
      params.initCode,
      params.callData,
      params.paymasterAndData,
      params.verificationGasLimit,
      params.preVerificationGas,
      params.callGasLimit
    );

    userOp.signature = await this.generateSignature(
      params.owner,
      params.SmartAccount,
      params.EntryPoint,
      userOp,
      params.sigTime,
      params.sigType
    );

    return userOp;
  }

  async generateSignature(
    owner,
    SmartAccount,
    EntryPoint,
    userOp,
    sigTime,
    sigType
  ) {
    sigTime = this.getSigTime(sigTime);

    if (sigType == null || sigType == 0) {
      sigType = ethers.BigNumber.from("0");

      const network = await hre.ethers.provider.getNetwork();

      let domain = {
        name: JSON.parse(fs.readFileSync("DeployInformation.json"))[
          "SmartAccountV2"
        ]["name"],
        version: JSON.parse(fs.readFileSync("DeployInformation.json"))[
          "SmartAccountV2"
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

  getSigTime(sigTime) {
    sigTime = ethers.BigNumber.from("281474976710655");
    return sigTime;
  }
}


module.exports = {
  SmartAccountV2
};
