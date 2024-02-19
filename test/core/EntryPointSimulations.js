let { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
let { expect } = require("chai");
let Utils = require("../Utils.js");

describe("EntryPointSimulations", function () {
    async function deploy() {
        let [owner, signer, bundler, Alice] = await ethers.getSigners();
        let maxPrice = ethers.utils.parseEther("1");

        let MockEntryPointSimulationFactory0_6 = await ethers.getContractFactory(
            "MockEntryPointSimulations"
        );
        let EntryPoint = await MockEntryPointSimulationFactory0_6.deploy();

        let FreeGasPaymasterFactory = await ethers.getContractFactory(
            "FreeGasPaymaster"
        );

        let FreeGasPaymaster = await FreeGasPaymasterFactory.deploy(
            signer.address,
            owner.address
        );
        await FreeGasPaymaster.connect(owner).addSupportedEntryPoint(EntryPoint.address);

        let DefaultCallbackHandlerFactory = await ethers.getContractFactory(
            "contracts/wallet/handler/DefaultCallbackHandler.sol:DefaultCallbackHandler"
        );
        let DefaultCallbackHandler = await DefaultCallbackHandlerFactory.deploy();

        let Validations = await ethers.getContractFactory("Validations");
        let validations = await Validations.deploy(owner.address);

        await validations.connect(owner).setBundlerOfficialWhitelist(bundler.address, true);

        let SmartAccountFactory = await ethers.getContractFactory(
            "contracts/wallet/v2/SmartAccountV2.sol:SmartAccountV2"
        );

        let SmartAccount = await SmartAccountFactory.deploy(
            EntryPoint.address,
            DefaultCallbackHandler.address,
            validations.address,
            "SA",
            "1.0"
        );

        let SmartAccountFactoryV2Factory = await ethers.getContractFactory(
            "contracts/wallet/v2/AccountFactoryV2.sol:AccountFactoryV2"
        );
        let SmartAccountFactoryV2 = await SmartAccountFactoryV2Factory.deploy();

        let AccountFactoryProxyFactory = await ethers.getContractFactory(
            "contracts/wallet/v2/AccountFactoryProxy.sol:AccountFactoryProxy"
        );

        let AccountFactoryProxy = await AccountFactoryProxyFactory.deploy(
            SmartAccountFactoryV2.address,
            owner.address,
            SmartAccount.address
        );

        let SmartAccountProxyFactory = await ethers
            .getContractFactory("contracts/wallet/v2/AccountFactoryV2.sol:AccountFactoryV2")
            .then((f) => f.attach(AccountFactoryProxy.address));

        let MockChainlinkOracleFactory = await ethers.getContractFactory(
            "MockChainlinkOracle"
        );
        let MockChainlinkOracle = await MockChainlinkOracleFactory.deploy(
            owner.address
        );

        let MockChainlinkOracleETH = await MockChainlinkOracleFactory.deploy(
            owner.address
        );

        await MockChainlinkOracle.connect(owner).setPrice(1_000_000);
        await MockChainlinkOracle.connect(owner).setDecimals(6);

        await MockChainlinkOracleETH.connect(owner).setPrice(200_0000_000);
        await MockChainlinkOracleETH.connect(owner).setDecimals(6);

        let TestTokenFactory = await ethers.getContractFactory("TestToken");
        let TestToken = await TestTokenFactory.deploy();

        let PriceOracleFactory = await ethers.getContractFactory(
            "ChainlinkOracleAdapter"
        );
        let PriceOracle = await PriceOracleFactory.deploy(owner.address);

        let TokenPaymasterFactory = await ethers.getContractFactory(
            "TokenPaymaster"
        );
        let TokenPaymaster = await TokenPaymasterFactory.deploy(
            signer.address,
            owner.address
        );
        await TokenPaymaster.connect(owner).setPriceOracle(PriceOracle.address);
        await TokenPaymaster.connect(owner).addSupportedEntryPoint(EntryPoint.address);

        await PriceOracle.connect(owner).setPriceFeed(
            TestToken.address,
            MockChainlinkOracle.address
        );
        await PriceOracle.setDecimals(TestToken.address, 6);

        await PriceOracle.connect(owner).setPriceFeed(
            await PriceOracle.NATIVE_TOKEN(),
            MockChainlinkOracleETH.address
        );
        await PriceOracle.setDecimals(await PriceOracle.NATIVE_TOKEN(), 18);

        await EntryPoint.connect(owner).depositTo(TokenPaymaster.address, {
            value: ethers.utils.parseUnits("1"),
        });

        return {
            owner,
            signer,
            bundler,
            Alice,
            EntryPoint,
            TestToken,
            TokenPaymaster,
            SmartAccount,
            SmartAccountProxyFactory,
            PriceOracle,
            FreeGasPaymaster,
            validations
        };
    }

    describe("simulateHandleOps", function () {
        it("Should correctly revert call revert reason", async function () {
            let {
                owner,
                signer,
                bundler,
                Alice,
                EntryPoint,
                TestToken,
                TokenPaymaster,
                SmartAccount,
                SmartAccountProxyFactory,
                PriceOracle,
                FreeGasPaymaster,
                validations
            } = await loadFixture(deploy);

            let initializeData = ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [Alice.address, "0x"]
            );

            const AAAddress = await SmartAccountProxyFactory.getAddress(
                SmartAccount.address,
                initializeData,
                0
            );

            // add some fund
            await owner.sendTransaction({
                value: ethers.utils.parseEther("1.0"),
                to: AAAddress,
            });

            // update safeSingleton to 0.6
            await SmartAccountProxyFactory.setSafeSingleton(
                SmartAccount.address,
                true
            );


            await SmartAccountProxyFactory.createAccount(
                SmartAccount.address,
                initializeData,
                0
            );

            let events = await SmartAccountProxyFactory.queryFilter("ProxyCreation");
            await expect(events[0].args.proxy).to.equal(AAAddress);

            oneEther = ethers.utils.parseEther("1.0");

            let transferCallData = TestToken.interface.encodeFunctionData(
                "transfer",
                [owner.address, oneEther]
            );

            callData = SmartAccount.interface.encodeFunctionData(
                "execTransactionFromEntrypoint",
                [TestToken.address, ethers.utils.parseEther("0"), transferCallData]
            );

            let userOp = await Utils.generateSignedUOP({
                sender: AAAddress,
                nonce: 0,
                initCode: "0x",
                callData: callData,
                paymasterAndData: "0x",
                owner: owner,
                SmartAccount: SmartAccount,
                EntryPoint: EntryPoint.address,
                sigType: 1,
                sigTime: 0,
            });

            const callDetails = {
                to: EntryPoint.address,
                data: EntryPoint.interface.encodeFunctionData(
                    "simulateHandleOp",
                    [userOp, ethers.constants.AddressZero, "0x"]
                ),
            };

            const parsedError = EntryPoint.interface.parseError(
                await bundler.call(callDetails)
            );
            // equal to "ERC20: transfer amount exceeds balance"
            revertMessage = "0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002645524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e63650000000000000000000000000000000000000000000000000000"
            await expect(parsedError.args.execErrMsg).to.equal(revertMessage);
        });


        it("Should correctly revert gas Limit", async function () {
            let {
                owner,
                signer,
                bundler,
                Alice,
                EntryPoint,
                TestToken,
                TokenPaymaster,
                SmartAccount,
                SmartAccountProxyFactory,
                PriceOracle,
                FreeGasPaymaster,
                validations
            } = await loadFixture(deploy);

            let initializeData = ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [Alice.address, "0x"]
            );

            const AAAddress = await SmartAccountProxyFactory.getAddress(
                SmartAccount.address,
                initializeData,
                0
            );

            // add some fund
            await owner.sendTransaction({
                value: ethers.utils.parseEther("1.0"),
                to: AAAddress,
            });

            // update safeSingleton to 0.6
            await SmartAccountProxyFactory.setSafeSingleton(
                SmartAccount.address,
                true
            );


            await SmartAccountProxyFactory.createAccount(
                SmartAccount.address,
                initializeData,
                0
            );

            let events = await SmartAccountProxyFactory.queryFilter("ProxyCreation");
            await expect(events[0].args.proxy).to.equal(AAAddress);

            callData = SmartAccount.interface.encodeFunctionData(
                "execTransactionFromEntrypoint",
                [Alice.address, ethers.utils.parseEther("0.1"), "0x"]
            );

            let userOp = await Utils.generateSignedUOP({
                sender: AAAddress,
                nonce: 0,
                initCode: "0x",
                callData: callData,
                paymasterAndData: "0x",
                owner: Alice,
                SmartAccount: SmartAccount,
                EntryPoint: EntryPoint.address,
                sigType: 1,
                sigTime: 0,
            });

            const callDetails = {
                to: EntryPoint.address,
                data: EntryPoint.interface.encodeFunctionData(
                    "simulateHandleOp",
                    [userOp, ethers.constants.AddressZero, "0x"]
                ),
            };

            const parsedError = EntryPoint.interface.parseError(
                await bundler.call(callDetails)
            );


            k = 1.5;

            userOp = await Utils.generateSignedUOPWithManualGasLimit({
                sender: AAAddress,
                nonce: 0,
                initCode: "0x",
                callData: callData,
                paymasterAndData: "0x",
                owner: Alice,
                SmartAccount: SmartAccount,
                EntryPoint: EntryPoint.address,
                sigType: 1,
                sigTime: 0,
                manualVerificationGasLimit: (parsedError.args.preOpGas
                    .mul(k * 10))
                    .div(10),
                manualPreVerificationGas: 0,
                manualCallGasLimit: (parsedError.args.actualGasUsed
                    .sub(parsedError.args.preOpGas)
                    .sub(parsedError.args.postOpGas))
                    .mul(k * 10).div(10),
            });

            let tx = await EntryPoint
                .connect(bundler)
                .handleOps([userOp], owner.address);

            await tx.wait();
        });


        it("Should correctly revert aggeragator", async function () {
            let {
                owner,
                signer,
                bundler,
                Alice,
                EntryPoint,
                TestToken,
                TokenPaymaster,
                SmartAccount,
                SmartAccountProxyFactory,
                PriceOracle,
                FreeGasPaymaster,
                validations
            } = await loadFixture(deploy);



            let initializeData = ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [Alice.address, "0x"]
            );

            const AAAddress = await SmartAccountProxyFactory.getAddress(
                SmartAccount.address,
                initializeData,
                0
            );

            // add some fund
            await owner.sendTransaction({
                value: ethers.utils.parseEther("1.0"),
                to: AAAddress,
            });

            // update safeSingleton to 0.6
            await SmartAccountProxyFactory.setSafeSingleton(
                SmartAccount.address,
                true
            );


            await SmartAccountProxyFactory.createAccount(
                SmartAccount.address,
                initializeData,
                0
            );

            let events = await SmartAccountProxyFactory.queryFilter("ProxyCreation");
            await expect(events[0].args.proxy).to.equal(AAAddress);


            callData = SmartAccount.interface.encodeFunctionData(
                "execTransactionFromEntrypoint",
                [Alice.address, ethers.utils.parseEther("0.1"), "0x"]
            );

            let userOp = await Utils.generateSignedUOP({
                sender: AAAddress,
                nonce: 0,
                initCode: "0x",
                callData: callData,
                paymasterAndData: "0x",
                owner: owner,
                SmartAccount: SmartAccount,
                EntryPoint: EntryPoint.address,
                sigType: 1,
                sigTime: 0,
            });

            let callDetails = {
                to: EntryPoint.address,
                data: EntryPoint.interface.encodeFunctionData(
                    "simulateHandleOp",
                    [userOp, ethers.constants.AddressZero, "0x"]
                ),
            };

            let parsedError = EntryPoint.interface.parseError(
                await bundler.call(callDetails)
            );

            await expect(parsedError.args.validationAggregator).to.equal("0x0000000000000000000000000000000000000001");
        });
    });
});
