let { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
let { expect } = require("chai");
let Utils = require("../../Utils.js");

describe("FallbackManager", function () {
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

        return {
            owner,
            EntryPoint,
            SmartAccount,
            DefaultCallbackHandler,
            Alice,
            AA,
            AAProxy,
        };
    }

    describe("setFallbackHandler", function () {
        it("should revert with handler illegal", async function () {
            let { Alice, AA } = await loadFixture(deploy);

            // enocde functioncall of updateImplement
            let setFallbackHandlerCalldata = AA.interface.encodeFunctionData(
                "setFallbackHandler",
                [AA.address]
            );

            await expect(AA.execTransactionFromEntrypoint(
                AA.address,
                0,
                setFallbackHandlerCalldata
            )).to.be.revertedWith("handler illegal");

            setFallbackHandlerCalldata = AA.interface.encodeFunctionData(
                "setFallbackHandler",
                [Alice.address]
            );
            let tx = await AA.execTransactionFromEntrypoint(
                AA.address,
                0,
                setFallbackHandlerCalldata
            );
            await expect(await AA.getFallbackHandler()).to.equal(Alice.address);
        });

        it("should change slot correctly", async function () {
            let { Alice, AA } = await loadFixture(deploy);

            let setFallbackHandlerCalldata = AA.interface.encodeFunctionData(
                "setFallbackHandler",
                [Alice.address]
            );
            let tx = await AA.execTransactionFromEntrypoint(
                AA.address,
                0,
                setFallbackHandlerCalldata
            );
            await expect(await AA.getFallbackHandler()).to.equal(Alice.address);
        });
    });
});
