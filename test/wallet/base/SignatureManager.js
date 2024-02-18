let { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
let { expect } = require("chai");
let Utils = require("../../Utils.js");

describe("SignatureManager", function () {
    async function deploy() {
        let [owner, bundler, Alice] = await ethers.getSigners();

        // setEntryPoint to owner to simplify testing
        let EntryPoint = owner.address;
        let SimulationContract = owner.address;

        let DefaultCallbackHandlerFactory = await ethers.getContractFactory(
            "contracts/wallet/handler/DefaultCallbackHandler.sol:DefaultCallbackHandler"
        );
        let DefaultCallbackHandler = await DefaultCallbackHandlerFactory.deploy();

        let Validations = await ethers.getContractFactory("Validations");
        let validations = await Validations.deploy(owner.address);

        await validations.setBundlerOfficialWhitelist(owner.address, true);

        let SmartAccountFactory = await ethers.getContractFactory(
            "contracts/wallet/v1/SmartAccount.sol:SmartAccount"
        );
        let SmartAccount = await SmartAccountFactory.deploy(
            EntryPoint,
            SimulationContract,
            DefaultCallbackHandler.address,
            validations.address,
            "SA",
            "1.0"
        );

        let SmartAccountProxysFactory = await ethers.getContractFactory(
            "contracts/wallet/v1/SmartAccountProxyFactory.sol:SmartAccountProxyFactory"
        );
        let SmartAccountProxyFactory = await SmartAccountProxysFactory.deploy(
            SmartAccount.address,
            owner.address
        );

        let initializeData = SmartAccount.interface.encodeFunctionData(
            "Initialize",
            [Alice.address]
        );

        let tx = await SmartAccountProxyFactory.createAccount(
            SmartAccount.address,
            initializeData,
            0
        );

        let events = await SmartAccountProxyFactory.queryFilter("ProxyCreation");
        await expect(events.length).to.equal(1);
        let AA = await SmartAccount.attach(events[0].args.proxy);

        let SmartAccountProxy = await ethers.getContractFactory(
            "contracts/wallet/v1/SmartAccountProxy.sol:SmartAccountProxy"
        );
        let AAProxy = await SmartAccountProxy.attach(AA.address);

        let UserOpHelperFactory = await ethers.getContractFactory(
            "UserOperationHelper"
        );
        let UserOpHelper = await UserOpHelperFactory.deploy(
            ethers.constants.AddressZero,
            EntryPoint,
            owner.address
        );

        let SignatureManagerFactory = await ethers.getContractFactory(
            "contracts/mock/MockSignatureManager.sol:MockSignatureManager",
            owner
        );
        let SignatureManager = await SignatureManagerFactory.connect(owner).deploy(
            EntryPoint,
            "SA",
            "1.0"
        );

        await SignatureManager.connect(owner).changeOwner(owner.address);

        return {
            owner,
            EntryPoint,
            SmartAccount,
            UserOpHelper,
            DefaultCallbackHandler,
            Alice,
            AA,
            AAProxy,
            SignatureManager
        };
    }

    describe("check SignatureManager", function () {
        it("shuold revert not equal", async function () {
            let { SignatureManager, EntryPoint, owner } = await loadFixture(deploy);
            // enocde functioncall of updateImplement
            await expect(await SignatureManager.entryPoint()).to.equal(EntryPoint);
            await expect(await SignatureManager.getOwner()).to.equal(owner.address);

        });
        it("should revert is validation", async function () {
            let { SignatureManager, SmartAccount, EntryPoint, owner, Alice, UserOpHelper } = await loadFixture(deploy);

            let userOp = await Utils.generateSignedUOP({
                sender: owner.address,
                nonce: 0,
                initCode: "0x",
                callData: "0x12345678",
                paymasterAndData: "0x",
                owner: owner,
                SmartAccount: SmartAccount,
                EntryPoint: EntryPoint,
                sigType: 1,
                sigTime: 123456,
            });

            let userOpHash = await UserOpHelper.getUserOpHash(userOp, EntryPoint);
            let validateDataReturn = await SignatureManager.getValidateSignatureReturn(
                userOp,
                userOpHash,
            );

            let sigTime = ethers.BigNumber.from("123456");
            sigTime = sigTime.mul(ethers.BigNumber.from("2").pow(160));

            await expect(validateDataReturn).to.emit(SignatureManager, "Validation")
                .withArgs(
                    sigTime
                );
        });
    });



});
