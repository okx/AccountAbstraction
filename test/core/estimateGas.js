const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const Utils = require("../Utils.js");

describe("EntryPoint", function () {
  async function deploy() {
    let [owner, signer, bundler, Alice] = await ethers.getSigners();
    let maxPrice = ethers.utils.parseEther("1");
    let EntryPointFactory = await ethers.getContractFactory("MockEntryPointL1");
    let EntryPoint = await EntryPointFactory.deploy(owner.address);

    await EntryPoint.connect(owner).setBundlerOfficialWhitelist(
      bundler.address,
      true
    );

    let DefaultCallbackHandlerFactory = await ethers.getContractFactory(
      "DefaultCallbackHandler"
    );
    let DefaultCallbackHandler = await DefaultCallbackHandlerFactory.deploy();

    let SmartAccountFactory = await ethers.getContractFactory("SmartAccount");
    let SmartAccount = await SmartAccountFactory.deploy(
      EntryPoint.address,
      DefaultCallbackHandler.address,
      "SA",
      "1.0"
    );

    let SmartAccountProxysFactory = await ethers.getContractFactory(
      "SmartAccountProxyFactory"
    );
    let SmartAccountProxyFactory = await SmartAccountProxysFactory.deploy(
      SmartAccount.address,
      EntryPoint.address
    );

    await EntryPoint.connect(owner).setWalletProxyFactoryWhitelist(
      SmartAccountProxyFactory.address
    );

    let UserOpHelperFactory = await ethers.getContractFactory(
      "UserOperationHelper"
    );
    let userOpHelper = await UserOpHelperFactory.deploy(
      ethers.constants.AddressZero,
      EntryPoint.address,
      owner.address
    );

    return {
      owner,
      signer,
      bundler,
      Alice,
      EntryPoint,
      SmartAccount,
      SmartAccountProxyFactory,
      userOpHelper,
    };
  }

  // it("estimate gas", async function () {
  //   const {
  //     owner,
  //     bundler,
  //     signer,
  //     Alice,
  //     EntryPoint,
  //     SmartAccount,
  //     SmartAccountProxyFactory,
  //     userOpHelper,
  //   } = await loadFixture(deploy);

  //   let sender = await Utils.generateAccount({
  //     owner: Alice,
  //     bundler: bundler,
  //     EntryPoint: EntryPoint,
  //     SmartAccount: SmartAccount,
  //     SmartAccountProxyFactory: SmartAccountProxyFactory,
  //     random: 0,
  //   });

  //   let oneEther = ethers.utils.parseEther("1.0");
  //   await owner.sendTransaction({
  //     value: oneEther,
  //     to: sender,
  //   });

  //   let userOp1 = await Utils.generateSignedUOP({
  //     sender: sender,
  //     nonce: 1,
  //     initCode: "0x",
  //     callData: "0x",
  //     paymasterAndData: "0x",
  //     owner: Alice,
  //     SmartAccount: SmartAccount,
  //     EntryPoint: EntryPoint.address,
  //     sigType: 1,
  //     sigTime: 0,
  //   });

  //   let userOp2 = await Utils.generateSignedUOP({
  //     sender: sender,
  //     nonce: 2,
  //     initCode: "0x",
  //     callData: "0x",
  //     paymasterAndData: "0x",
  //     owner: Alice,
  //     SmartAccount: SmartAccount,
  //     EntryPoint: EntryPoint.address,
  //     sigType: 1,
  //     sigTime: 0,
  //   });

  //   let { encoded, length } = await userOpHelper.getLengthOfEncodedUserOP(
  //     userOp1
  //   );

  //   encoded =
  //     "0x532d3ac900000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000020f5d2ea8e60c53bdaa5d1ba049b28365976053f00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000272be000000000000000000000000000000000000000000000000000000000001c985000000000000000000000000000000000000000000000000000000000000b0d60000000000000000000000000000000000000000000000000000000010642ac00000000000000000000000000000000000000000000000000000000010642ac000000000000000000000000000000000000000000000000000000000000004c000000000000000000000000000000000000000000000000000000000000004e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000030483aa7c9e00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000001800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000da0d7f342b9c0f7f5f456e0c0a3ec6fe925eaef3000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000044a22cb46500000000000000000000000000000000000000adc04c56bf30ac9d3c0aaf14dc00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f8b973fdf2e6f700a775aa94ff72180688b5a044000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000044a22cb46500000000000000000000000000000000000000adc04c56bf30ac9d3c0aaf14dc00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000062000000000000000000000000000000000000000000000000000000000064c22522c91241132c8d9921a977336588a83815b0005e27dd3d7467a7a358dc1b7530861f3038b6e1d9a83f92febdc5cf145b016afb963423ce1fe19f900d8267efc1a01c000000000000000000000000000000000000000000000000000000000000";

  //   // calculate encoded cost 4 for zero bytes 16 for non-zero bytes
  //   let callDataCost = 0;
  //   for (let i = 0; i < encoded.length; i += 2) {
  //     if (encoded[i] == 0 && encoded[i + 1] == 0) {
  //       callDataCost += 4;
  //     } else {
  //       callDataCost += 16;
  //     }
  //   }

  //   console.log("callDataCost:", callDataCost);

  //   let lengthInWord = (encoded.length + 63) / 64;
  //   let userOpCount = 1;

  //   // 无paymaster
  //   let perUserOp = 18000;
  //   let fixedCost = 24676;
  //   let preVerificationGas =
  //     2 * callDataCost + fixedCost / userOpCount + perUserOp + 4 * lengthInWord;

  //   console.log("preVerificationGas:", preVerificationGas);

  //   let expectCost = preVerificationGas + 61500;

  //   console.log("expectCost: ", expectCost);

  //   // let tx = await userOpHelper.gasEstimate(userOp1, EntryPoint.address, false);

  //   let tx = await EntryPoint.connect(bundler).mockhandleOps([
  //     userOp1,
  //     //   userOp2,
  //     //   userOp,
  //   ]);
  //   let receipt = await tx.wait();
  //   // console.log("receipt: ", receipt);
  //   console.log("actualCost: ", receipt.gasUsed.toNumber());

  //   // console.log(101802 - 61500 - 24676 - 21 * 4 - 4268);
  // });
});

// 169820 188865 19045 + 45270 = 64315

// 19045 + 4000 23045
