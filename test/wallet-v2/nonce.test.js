let { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
let { expect } = require("chai");

describe("SmartAccount", function () {
    async function deploy() {
        let [owner] = await ethers.getSigners();

        let EntryPoint0_6 = await ethers.getContractFactory(
            "MockEntryPointV06"
        );
        let entrypoint0_6 = await EntryPoint0_6.deploy();

        let SmartAccountV2 = await ethers.getContractFactory("SmartAccountV2");

        let smartAccountV2 = await SmartAccountV2.deploy(
            entrypoint0_6.address, // entry point
            owner.address, // fallback
            owner.address, // validation
            "SmartAccount",// name
            "1.0.0"        // version
        );

        return {
            owner,
            entrypoint0_6,
            smartAccountV2
        };
    }

    describe("nonce", function () {
        it("should return nonce correctly", async function () {
            let {
                entrypoint0_6,
                smartAccountV2
            } = await loadFixture(deploy);

            await expect(await smartAccountV2.nonce()).to.be.equal(0)
            await entrypoint0_6.incrementNonceForTarget(smartAccountV2.address, 0)
            await expect(await smartAccountV2.nonce()).to.be.equal(1)
        });
    });
});