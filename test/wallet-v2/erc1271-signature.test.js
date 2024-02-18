let { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
let { expect } = require("chai");
const { ethers } = require("hardhat");

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

        await smartAccountV2.initialize(owner.address, "0x");

        return {
            owner,
            entrypoint0_6,
            smartAccountV2
        };
    }

    describe("signature", function () {
        it("verify the signature correctly", async function () {
            let {
                smartAccountV2, owner
            } = await loadFixture(deploy);

            const signature = await owner._signTypedData(
                {
                    name: "SmartAccount",
                    version: "1.0.0",
                    verifyingContract: smartAccountV2.address,
                    chainId: (await ethers.provider.getNetwork()).chainId.toString()
                },
                { isValidSignature: [{ name: "_hash", type: "bytes32" }] },
                { "_hash": "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470" }
            )

            let r = await smartAccountV2.isValidSignature(
                "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
                signature
            );
            expect(r).to.equal("0x1626ba7e");

            // try with invalid hash
            r = await smartAccountV2.isValidSignature(
                "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a471",
                signature
            );
            expect(r).to.equal("0xffffffff");
        })
    });
});