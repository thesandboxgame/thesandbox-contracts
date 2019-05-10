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
    emptyBytes,
} = require('../utils');

const {
    TransferSingleEvent,
    TransferBatchEvent,
    URIEvent
} = require('../erc1155')

const {
    TransferEvent
} = require('../erc721')

const {
    ExtractionEvent,
    mintAndReturnTokenId,
    mintMultipleAndReturnTokenIds,
    mintTokensWithSameURIAndSupply,
    mintTokensIncludingNFTWithSameURI,
} = require('../asset-utils');

const creator = accounts[0];
const user1 = accounts[1];

const ipfsHashString = 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';

function runERC721ExtractionTests(title, resetContract) {
    tap.test(title + ' erc721 extraction', async (t)=> {
        let contract;
        t.beforeEach(async () => {
          contract = await resetContract();
        });
  
        t.test('should be able to extract an NFT (1 ERC1155 value -> 1 ERC721)', async () => {
            const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 100, creator);
            const receipt = await tx(contract, 'extractERC721', {from: creator, gas}, creator, tokenId, ipfsHashString);
            assert.equal((await getEventsFromReceipt(contract, ExtractionEvent, receipt)).length, 1);
        });
    
        t.test('should work with mintMultiple', async () => {
            const uris = [ipfsHashString + '_1', ipfsHashString + '_2'];
            const tokenIds = await mintMultipleAndReturnTokenIds(contract, uris, [10, 20], creator);
    
            const receipt1 = await tx(contract, 'extractERC721', {from: creator, gas}, creator, tokenIds[0], uris[0]);
            assert.equal((await getEventsFromReceipt(contract, ExtractionEvent, receipt1)).length, 1);
    
            const receipt2 = await tx(contract, 'extractERC721', {from: creator, gas}, creator, tokenIds[1], uris[1]);
            assert.equal((await getEventsFromReceipt(contract, ExtractionEvent, receipt2)).length, 1);
        });
    
        t.test('should decrease balance by one', async () => {
            const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 100, creator);
            const balanceBefore = await call(contract, 'balanceOf', {from: creator}, creator, tokenId);
            await tx(contract, 'extractERC721', {from: creator, gas}, creator, tokenId, ipfsHashString);
            const balanceAfter = await call(contract, 'balanceOf', {from: creator}, creator, tokenId);
            assert.equal(balanceAfter, balanceBefore - 1);
        });
    
        t.test('should burn one token balance', async () => {
            const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 100, creator);
            await tx(contract, 'extractERC721', {from: creator, gas}, creator, tokenId, ipfsHashString);
            const balanceLeft = await call(contract, 'balanceOf', {from: creator}, creator, tokenId);
            assert.equal(balanceLeft, 99);
        });
    
        t.test('should be owner, extractor', async () => {
            const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 100, creator);
            const receipt = await tx(contract, 'extractERC721', {from: creator, gas}, creator, tokenId, ipfsHashString);
            const extractionEvent = await getEventsFromReceipt(contract, ExtractionEvent, receipt);
            const newTokenId = extractionEvent[0].returnValues._toId;
            const ownerOf = await call(contract, 'ownerOf', null, newTokenId);
            assert.equal(ownerOf, creator);
        });
    
        t.test('should have same ipfsHash', async () => {
            const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 100, creator);
            const receipt = await tx(contract, 'extractERC721', {from: creator, gas}, creator, tokenId, ipfsHashString);
            const extractionEvent = await getEventsFromReceipt(contract, ExtractionEvent, receipt);
            const newTokenId = extractionEvent[0].returnValues._toId;

            // console.log(newTokenId)

            const extractedIpfsHash = await call(contract, 'tokenURI', null, newTokenId);
            assert.equal(extractedIpfsHash, ipfsHashString);
        });
    
        t.test('should be able to extract if not creator', async () => {
            const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 100, creator);
            await tx(contract, 'safeTransferFrom', {from: creator, gas}, creator, user1, tokenId, 1, emptyBytes);
            const receipt = await tx(contract, 'extractERC721', {from: user1, gas}, user1, tokenId, ipfsHashString);
            const extractionEvent = await getEventsFromReceipt(contract, ExtractionEvent, receipt);
            const newTokenId = extractionEvent[0].returnValues._toId;
            const ownerOf = await call(contract, 'ownerOf', null, newTokenId);
            assert.equal(ownerOf, user1);
        });
    
        t.test('should have same creator', async () => {
            const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 100, creator);
            await tx(contract, 'safeTransferFrom', {from: creator, gas}, creator, user1, tokenId, 1, emptyBytes);
            const receipt = await tx(contract, 'extractERC721', {from: user1, gas}, user1, tokenId, ipfsHashString);
            const extractionEvent = await getEventsFromReceipt(contract, ExtractionEvent, receipt);
            const newTokenId = extractionEvent[0].returnValues._toId;
            const creatorOf = await call(contract, 'creatorOf', null, newTokenId);
            assert.equal(creatorOf, creator);
        });

        t.test('should NOT extract an ERC721', async () => {
            const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 1, creator);
            await expectThrow(tx(contract, 'extractERC721', {from: creator, gas}, creator, tokenId, ipfsHashString));
            // .then(() => assert(false, 'was able to extract NFT'))
            // .catch((err) => assert(err.toString().includes('Not an ERC1155 Token'), 'Error message does not match. ' + err.toString()));
        });
    
        t.test('should NOT extract with wrong uri', async () => {
            const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 100, creator);
            await expectThrow(tx(contract, 'extractERC721', {from: creator, gas}, creator, tokenId, 'clearly wrong uri'));
            // .then(() => assert(false, 'was able to extract NFT'))
            // .catch((err) => assert(err.toString().includes('URI hash does not match'), 'Error message does not match. ' + err.toString()));
        });
    
        t.test('should NOT extract an NFT if no balance', async () => {
            const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 100, creator);
            await expectThrow(tx(contract, 'extractERC721', {from: user1, gas}, user1, tokenId, ipfsHashString));
        });


        t.test('should be able to extract as many as there is tokens -1', async () => {
            const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 2, creator);
            await tx(contract, 'extractERC721', {from: creator, gas}, creator, tokenId, ipfsHashString);
            await tx(contract, 'extractERC721', {from: creator, gas}, creator, tokenId, ipfsHashString);
        });

        t.test('should NOT extract as many as there is tokens', async () => {
            const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 2, creator);
            await tx(contract, 'extractERC721', {from: creator, gas}, creator, tokenId, ipfsHashString);
            await expectThrow(tx(contract, 'extractERC721', {from: user1, gas}, user1, tokenId, ipfsHashString));
        });

        t.test('last token should not be an NFT without owner action', async () => {
            const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 2, creator);
            await tx(contract, 'extractERC721', {from: creator, gas}, creator, tokenId, ipfsHashString);
            await expectThrow(call(contract, 'ownerOf', null, tokenId));
        });

        t.test('last token should be transferable as an ERC1155 without emitting ERC721 events', async () => {
            const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 2, creator);
            await tx(contract, 'extractERC721', {from: creator, gas}, creator, tokenId, ipfsHashString);
            const receipt = await tx(contract, 'safeTransferFrom', {from: creator, gas}, creator, user1, tokenId, 1, emptyBytes);
            const eventsMatching = await getEventsFromReceipt(contract, TransferEvent, receipt);
            assert.equal(eventsMatching.length, 0);
        });

        t.test('last token should be not be transferable via ERC721 transfer', async () => {
            const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 2, creator);
            await tx(contract, 'extractERC721', {from: creator, gas}, creator, tokenId, ipfsHashString);
            await expectThrow(tx(contract, 'transferFrom', {from: creator, gas}, creator, user1, tokenId));
        });
    });
}

module.exports = {
    runERC721ExtractionTests
}
