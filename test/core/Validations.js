let { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
let { expect } = require("chai");

describe("Validations", function () {
    async function deploy() {
        let [owner, alice, bob] = await ethers.getSigners();
        let Validations = await ethers.getContractFactory("Validations");
        let validations = await Validations.deploy(owner.address);

        return {
            owner, alice, bob, validations
        };
    }

    describe("setBundlerOfficialWhitelistBatch", function () {
        it("should revert with setBundlerOfficialWhitelistBatch", async function () {
            const { owner, alice, bob, validations } =
                await loadFixture(deploy);
            await expect(validations.setBundlerOfficialWhitelistBatch([alice.address, bob.address], [true, true, true])).to.be.revertedWith("incorrect arrary length")
            await expect(validations.setBundlerOfficialWhitelistBatch([alice.address, bob.address], [true])).to.be.revertedWith("incorrect arrary length")
        });

        it("should success with emit event", async function () {
            const { owner, alice, bob, validations } = await loadFixture(deploy);
            const tx = await validations.setBundlerOfficialWhitelistBatch(
                [alice.address, bob.address],
                [true, true]
            );
            const rc = await tx.wait();

            expect(tx).to.emit(validations, "BundlerWhitelistSet");

            expect(rc.events.find((event) => event.event === "BundlerWhitelistSet" && event.args.bundler === alice.address).args.allowed).to.equal(true);

            expect(rc.events.find((event) => event.event === "BundlerWhitelistSet" && event.args.bundler === bob.address).args.allowed).to.equal(true);

        });
        it("should change storage correctly", async function () {
            const { owner, alice, bob, validations } =
                await loadFixture(deploy);
            await expect(await validations.officialBundlerWhiteList(alice.address)).to.equal(false);

            await expect(await validations.officialBundlerWhiteList(bob.address)).to.equal(false);

            await validations.setBundlerOfficialWhitelistBatch([alice.address, bob.address], [true, true]);

            await expect(await validations.officialBundlerWhiteList(alice.address)).to.equal(true);

            await expect(await validations.officialBundlerWhiteList(bob.address)).to.equal(true);

            await validations.setBundlerOfficialWhitelistBatch([alice.address, bob.address], [false, false]);

            await expect(await validations.officialBundlerWhiteList(alice.address)).to.equal(false);

            await expect(await validations.officialBundlerWhiteList(bob.address)).to.equal(false);
        });


    });

});
