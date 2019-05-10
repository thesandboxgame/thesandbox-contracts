const BN = require('bn.js');
const tap = require('tap');
const assert = require('assert');
const rocketh = require('rocketh');
const accounts = rocketh.accounts;

const {
    getEventsFromReceipt,
    encodeEventSignature,
    tx,
    call,
    gas,
    expectThrow,
    zeroAddress,
    deployContract,
    emptyBytes,
} = require('../utils');

const {
    TransferSingleEvent,
    TransferBatchEvent,
    URIEvent
} = require('../erc1155');

const {
    getERC20Balance,
} = require('../erc20');

const {
    TransferEvent
} = require('../erc721');

const {
    mintAndReturnTokenId,
    mintTokensWithSameURIAndSupply,
    mintTokensIncludingNFTWithSameURI,
    mintMultiple,
    mintMultipleWithNFTs,
    generateTokenId,
} = require('../asset-utils');

const CreatorEvent = encodeEventSignature('Creator(uint256,address)');

const {
    sandAdmin,
    others,
    mintingFeeCollector,
} = rocketh.namedAccounts

const creator = others[0];
const user1 = others[1];
const operator = others[2];
const newFeeCollector = others[3];
const feeCollectorOwner = others[4];

const ipfsHashString = 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';

function runFixedIDAssetTests(title, resetContracts) {
    tap.test(title + ' specific tests', async (t)=> {
        let contracts;
        t.beforeEach(async () => {
          contracts = await resetContracts();
        });

        t.test('minting a NFT with fixed id return the id', async () => {
            const tokenID = await mintAndReturnTokenId(contracts.Asset, ipfsHashString,1,creator, 4);
            assert.equal(tokenID, generateTokenId(creator, 1, 4, 0));
        });

        t.test('minting a NFT with same id twice fails', async () => {
            await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, 4, ipfsHashString, 1, creator, emptyBytes);
            await expectThrow(tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, 4, ipfsHashString, 1, creator, emptyBytes));
        });

        t.test('minting a NFT with different id succeed', async () => {
            await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, 4, ipfsHashString, 1, creator, emptyBytes);
            await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, 5, ipfsHashString, 1, creator, emptyBytes);
        });

        // t.test('minting 2 NFT with no fixed id succeed', async () => {
        //     await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, 0, ipfsHashString, 1, creator, emptyBytes);
        //     await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, 0, ipfsHashString, 1, creator, emptyBytes);
        // });

        t.test('minting a MCFT (supply > 1) with same id twice fails', async () => {
            await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, 4, ipfsHashString, 1033, creator, emptyBytes);
            await expectThrow(tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, 4, ipfsHashString, 4, creator, emptyBytes));
        });

        t.test('minting a MCFT with fixed id return the id', async () => {
            const tokenID = await mintAndReturnTokenId(contracts.Asset, ipfsHashString,1033,creator, 4);
            assert.equal(tokenID, generateTokenId(creator, 1033, 4, 0));
        });

        t.test('minting a MCFT (supply > 1) with different id succeed', async () => {
            await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, 4, ipfsHashString, 1033, creator, emptyBytes);
            await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, 5, ipfsHashString, 4, creator, emptyBytes);
        });

        t.test('minting multiple MCFT (supply > 1) succeed', async () => {
            await mintTokensWithSameURIAndSupply(contracts.Asset, 17, "dsd", 1234, creator, 101);
        });

        t.test('minting one MCFT (supply > 1) succeed', async () => {
            await mintAndReturnTokenId(contracts.Asset, "dsd", 1234, creator, 101);
        });

        t.test('minting one NFT (supply = 1) succeed', async () => {
            await mintAndReturnTokenId(contracts.Asset, "dsd", 1, creator, 101);
        });

        t.test('minting multiple Assets succeed', async () => {
            await mintTokensIncludingNFTWithSameURI(contracts.Asset, 7, "dsd", 1234, 7, creator, 101);
        });

        t.test('minting only multiple NFTS succeed', async () => {
            await mintTokensIncludingNFTWithSameURI(contracts.Asset, 0, "dsd", 1234, 7, creator, 101);
        });

        t.test('minting multiple MCFT (supply > 1) then minting with overlaping range fails', async () => {
            await mintTokensWithSameURIAndSupply(contracts.Asset, 17, "dsd", 1234, creator, 101);
            await expectThrow(mintTokensWithSameURIAndSupply(contracts.Asset, 8, "dsd", 111, creator, 117));
        });

        t.test('minting multiple MCFT (supply > 1) then minting with no overlaping range succeed', async () => {
            await mintTokensWithSameURIAndSupply(contracts.Asset, 17, "dsd", 1234, creator, 101);
            await mintTokensWithSameURIAndSupply(contracts.Asset, 8, "dsd", 111, creator, 118);
        });

        t.test('minting multiple Assets then minting with overlaping range fails', async () => {
            const tokenIds = await mintTokensIncludingNFTWithSameURI(contracts.Asset, 7, "dsd", 1234, 7, creator, 101);
            // console.log('tokenIds', tokenIds);
            // const otherTokenIds = await mintTokensIncludingNFTWithSameURI(contracts.Asset, 8, "dsd", 111, 2, creator, 114)
            // console.log('otherTokenIds', otherTokenIds);
            await expectThrow(mintTokensIncludingNFTWithSameURI(contracts.Asset, 8, "dsd", 111, 2, creator, 114));
        });

        t.test('minting multiple Assets with fixed id gives the correct ids', async () => {
            let tokenIDs = await mintTokensIncludingNFTWithSameURI(contracts.Asset, 7, "dsd", 1234, 7, creator, 101);
            assert.deepStrictEqual(
                tokenIDs,
                Array(7+7).fill().map(
                    (_, i) => {
                        if(i < 7) {
                            return generateTokenId(creator, 1234, 101, i);
                        } else {
                            return generateTokenId(creator, 1, 101, i);
                        }
                    }
                )
            )
        });

        t.test('minting multiple Assets then minting with existing id fails', async () => {
            const tokenIds = await mintTokensIncludingNFTWithSameURI(contracts.Asset, 7, "dsd", 1234, 7, creator, 101);
            // console.log('exi tokenIds', tokenIds);
            await expectThrow(tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, 114, ipfsHashString, 4, creator, emptyBytes));
        });

        t.test('minting multiple Assets then minting NFT with existing id fails', async () => {
            await mintTokensIncludingNFTWithSameURI(contracts.Asset, 7, "dsd", 1234, 7, creator, 101);
            await expectThrow(tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, 114, ipfsHashString, 1, creator, emptyBytes));
        });

        t.test('minting multiple Assets then minting NFT with different id succeeds', async () => {
            await mintTokensIncludingNFTWithSameURI(contracts.Asset, 7, "dsd", 1234, 7, creator, 101);
            await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, 115, ipfsHashString, 1, creator, emptyBytes);
        });

        t.test('minting multiple Assets then minting with no overlaping range succeed', async () => {
            await mintTokensIncludingNFTWithSameURI(contracts.Asset, 7, "dsd", 1234, 7, creator, 101);
            await mintTokensIncludingNFTWithSameURI(contracts.Asset, 8, "dsd", 111, 2, creator, 115);
        });

        t.test('minting multiple Assets then minting with backward overlaping range fails', async () => {
            await mintTokensIncludingNFTWithSameURI(contracts.Asset, 8, "dsd", 111, 2, creator, 114);
            await expectThrow(mintTokensIncludingNFTWithSameURI(contracts.Asset, 7, "dsd", 1234, 7, creator, 101));
        });
    });
}

module.exports = {
    runFixedIDAssetTests
}