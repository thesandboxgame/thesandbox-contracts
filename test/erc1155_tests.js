const tap = require('tap');
const assert = require('assert');
const rocketh = require('rocketh');
const accounts = rocketh.accounts;

const {
    getEventsFromReceipt,
    tx,
    gas,
    expectThrow,
    call,
} = require('./utils');

const {
    TransferSingleEvent,
    URIEvent,
    TransferBatchEvent
} = require('./erc1155');

const creator = accounts[0];
const user1 = accounts[1];
const operator = accounts[2];

function runERC1155tests(title, resetContract, mintERC1155) {
    tap.test(title + ' as ERC1155', async (t)=> {
        let contract;
        let assetsId;

        t.beforeEach(async () => {
          contract = await resetContract();
          assetsId = [];
          assetsId.push(await mintERC1155(contract, creator, 10));
          assetsId.push(await mintERC1155(contract, creator, 1));
          assetsId.push(await mintERC1155(contract, creator, 5));
        });
  
        t.test('transfers', async (t) => {
            t.test('transfer one instance of an item results in erc1155 transfer event', async () => {
                const receipt = await tx(contract, 'transferFrom', {from: creator, gas}, creator, user1, assetsId[1], 1);
                const eventsMatching = await getEventsFromReceipt(contract, TransferSingleEvent, receipt);
                assert.equal(eventsMatching.length, 1);
            });
            t.test('transfer multiple instance of an item results in erc1155 transfer event', async () => {
                const receipt = await tx(contract, 'transferFrom', {from: creator, gas}, creator, user1, assetsId[0], 2);
                const eventsMatching = await getEventsFromReceipt(contract, TransferSingleEvent, receipt);
                assert.equal(eventsMatching.length, 1);
            });
            t.test('should not be able to transfer more item than you own', async () => {
                await expectThrow(tx(contract, 'transferFrom', {from: creator, gas}, creator, user1, assetsId[0], 11));
            });
            t.test('should not be able to transfer more item of 1 supply', async () => {
                await expectThrow(tx(contract, 'transferFrom', {from: creator, gas}, creator, user1, assetsId[1], 2));
            });
        });

        t.test('batch transfers', async (t) => {
            t.test('transferring a item with 1 supply results in erc1155 transfer event', async () => {
                const receipt = await tx(contract, 'batchTransferFrom', {from: creator, gas}, creator, user1, [assetsId[1]], [1]);
                const eventsMatching = await getEventsFromReceipt(contract, TransferBatchEvent, receipt);
                assert.equal(eventsMatching.length, 1);
            });
            t.test('transfer a item with n>1 supply results in erc1155 transfer event', async () => {
                const receipt = await tx(contract, 'batchTransferFrom', {from: creator, gas}, creator, user1, [assetsId[0]], [3]);
                const eventsMatching = await getEventsFromReceipt(contract, TransferBatchEvent, receipt);
                assert.equal(eventsMatching.length, 1);
            });
            t.test('should not be able to transfer more items than you own', async () => {
                await expectThrow(tx(contract, 'batchTransferFrom', {from: creator, gas}, creator, user1, [assetsId[0]], [11]));
            });
            t.test('sshould not be able to transfer more item of 1 supply', async () => {
                await expectThrow(tx(contract, 'batchTransferFrom', {from: creator, gas}, creator, user1, [assetsId[1]], [2]));
            });
        
            t.test('should be able to transfer item with 1 or more supply at the same time', async () => {
                const tokenIdsToTransfer = [
                    assetsId[0],
                    assetsId[1]
                ];
                const balancesToTransfer = [
                    3,
                    1
                ];
                await tx(contract, 'batchTransferFrom', {from: creator, gas}, creator, user1, tokenIdsToTransfer, balancesToTransfer);
                for (let i = 0; i < tokenIdsToTransfer.length; i++) {
                    const tokenId = tokenIdsToTransfer[i];
                    const expectedbalance = balancesToTransfer[i];
                    const balance = await call(contract, 'balanceOf', null, user1, tokenId);
                    assert.equal(balance, expectedbalance);
                }
            });
        
            t.test('should be able to get balance of batch', async () => {
                const balances = [10, 20, 30, 40, 50, 60, 70, 80];

                const tokenIds = [];
                for(let i = 0; i < balances.length/2; i++) {
                    tokenIds.push(await mintERC1155(contract, creator, balances[i]));
                }
                for(let i = balances.length/2; i < balances.length; i++) {
                    tokenIds.push(await mintERC1155(contract, user1, balances[i]));
                }
                const batchBalances = await call(contract, 'balanceOfBatch', {from: creator},
                    [creator, creator, creator, creator, user1, user1, user1, user1],
                    tokenIds
                );
            
                for (let i = 0; i < batchBalances.length; i++) {
                    assert.equal(batchBalances[i], balances[i]);
                }
            });
        });

        t.test('approvalForAll', async (t) => {
            t.test('without approval, operator should not be able to transfer', async () => {
                await expectThrow(tx(contract, 'transferFrom', {from: operator, gas}, creator, user1, assetsId[0], 2));
            });
            t.test('without approval, operator should not be able to transfer, even supply 1', async () => {
                await expectThrow(tx(contract, 'transferFrom', {from: operator, gas}, creator, user1, assetsId[1], 1));
            });
            t.test('after operator setApprovalForAll, operator should be able to transfer', async () => {
                await tx(contract, 'setApprovalForAll', {from: creator, gas}, operator, true);
                const receipt = await tx(contract, 'transferFrom', {from: operator, gas}, creator, user1, assetsId[0], 2);
                const eventsMatching = await getEventsFromReceipt(contract, TransferSingleEvent, receipt);
                assert.equal(eventsMatching.length, 1);
            });
            t.test('after removing setApprovalForAll, operator should not be able to transfer', async () => {
                await tx(contract, 'setApprovalForAll', {from: creator, gas}, operator, true);
                await tx(contract, 'transferFrom', {from: operator, gas}, creator, user1, assetsId[0], 2);
                await tx(contract, 'setApprovalForAll', {from: creator, gas}, operator, false);
                await expectThrow(tx(contract, 'transferFrom', {from: operator, gas}, creator, user1, assetsId[0], 2));
            });
        })
    });
}

module.exports = {
    runERC1155tests,
}