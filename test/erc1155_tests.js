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
    getBlockNumber,
    getPastEvents,
    zeroAddress,
    emptyBytes,
    deployContract,
} = require('./utils');

const {
    TransferSingleEvent,
    URIEvent,
    ApprovalForAllEvent,
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
          assetsId.push(await mintERC1155(contract, creator, 1));
          assetsId.push(await mintERC1155(contract, creator, 12));
          assetsId.push(await mintERC1155(contract, creator, 1));
          assetsId.push(await mintERC1155(contract, creator, 1111));
          assetsId.push(await mintERC1155(contract, creator, 1));
        });
  
        t.test('mint', async (t) => {
            t.test('minting an item results in a URI event', async () => {
                const blockNumber = await getBlockNumber();
                const uri = 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
                const newTokenId = await mintERC1155(contract, creator, 2, uri);
                const eventsMatching = await getPastEvents(contract, URIEvent, {fromBlock:blockNumber+1});
                assert.equal(eventsMatching.length, 1);
                const values = eventsMatching[0].returnValues;
                assert.equal(values[0], uri);
                assert.equal(values[1], newTokenId);
            });

            t.test('minting an item results in TransferSingle event', async () => {
                const blockNumber = await getBlockNumber();
                const newTokenId = await mintERC1155(contract, creator, 2);
                const eventsMatching = await getPastEvents(contract, TransferSingleEvent, {fromBlock:blockNumber+1});
                assert.equal(eventsMatching.length, 1);
                const values = eventsMatching[0].returnValues;
                assert.equal(values[0], creator);
                assert.equal(values[1], zeroAddress);
                assert.equal(values[2], creator);
                assert.equal(values[3], newTokenId);
                assert.equal(values[4], 2);
            });


        });

        t.test('transfers', async (t) => {
            t.test('transfer one instance of an item results in erc1155 transferSingle event', async () => {
                const receipt = await tx(contract, 'safeTransferFrom', {from: creator, gas}, creator, user1, assetsId[1], 1, emptyBytes);
                const eventsMatching = await getEventsFromReceipt(contract, TransferSingleEvent, receipt);
                assert.equal(eventsMatching.length, 1);
                const values = eventsMatching[0].returnValues;
                assert.equal(values[0], creator);
                assert.equal(values[1], creator);
                assert.equal(values[2], user1);
                assert.equal(values[3], assetsId[1]);
                assert.equal(values[4], 1);
            });
            t.test('transfer multiple instance of an item results in erc1155 transferSingle event', async () => {
                const receipt = await tx(contract, 'safeTransferFrom', {from: creator, gas}, creator, user1, assetsId[0], 2, emptyBytes);
                const eventsMatching = await getEventsFromReceipt(contract, TransferSingleEvent, receipt);
                assert.equal(eventsMatching.length, 1);
                const values = eventsMatching[0].returnValues;
                assert.equal(values[0], creator);
                assert.equal(values[1], creator);
                assert.equal(values[2], user1);
                assert.equal(values[3], assetsId[0]);
                assert.equal(values[4], 2);
            });

            t.test('transfer a item with 1 supply do NOT results in erc1155 transferBatch event', async () => {
                const receipt = await tx(contract, 'safeTransferFrom', {from: creator, gas}, creator, user1, assetsId[1], 1, emptyBytes);
                const eventsMatching = await getEventsFromReceipt(contract, TransferBatchEvent, receipt);
                assert.equal(eventsMatching.length, 0);
            });

            t.test('transfer a item with x>1 supply do NOT results in erc1155 transferBatch event', async () => {
                const receipt = await tx(contract, 'safeTransferFrom', {from: creator, gas}, creator, user1, assetsId[0], 2, emptyBytes);
                const eventsMatching = await getEventsFromReceipt(contract, TransferBatchEvent, receipt);
                assert.equal(eventsMatching.length, 0);
            });

            t.test('pass if sending to normal address address', async () => {
                await tx(contract, 'safeTransferFrom', {from: creator, gas}, creator, user1, assetsId[0], 4, emptyBytes);
            });
            t.test('should throw if sending to zero address', async () => {
                await expectThrow(tx(contract, 'safeTransferFrom', {from: creator, gas}, creator, zeroAddress, assetsId[0], 4, emptyBytes));
            });

            t.test('should not be able to transfer more item than you own', async () => {
                await expectThrow(tx(contract, 'safeTransferFrom', {from: creator, gas}, creator, user1, assetsId[0], 11, emptyBytes));
            });
            t.test('should not be able to transfer more item of 1 supply', async () => {
                await expectThrow(tx(contract, 'safeTransferFrom', {from: creator, gas}, creator, user1, assetsId[1], 2, emptyBytes));
            });

            t.test('transfering a MCFT to a contract that do not accept erc1155 token should fails', async () => {
                const receiverContract = await deployContract(creator, 'TestERC1155Receiver', contract.options.address, false, true, false, true);
                const receiverAddress = receiverContract.options.address;
                await expectThrow(tx(contract, 'safeTransferFrom', {from: creator, gas}, creator, receiverAddress, assetsId[0], 1, emptyBytes));
            });
            t.test('transfering multiple copy of an MCFT to a contract that do not accept erc1155 token should fails', async () => {
                const receiverContract = await deployContract(creator, 'TestERC1155Receiver', contract.options.address, false, true, false, true);
                const receiverAddress = receiverContract.options.address;
                await expectThrow(tx(contract, 'safeTransferFrom', {from: creator, gas}, creator, receiverAddress, assetsId[0], 3, emptyBytes));
            });
            t.test('transfering a assetof supply 1 to a contract that do not accept erc1155 token should fails', async () => {
                const receiverContract = await deployContract(creator, 'TestERC1155Receiver', contract.options.address, false, true, false, true);
                const receiverAddress = receiverContract.options.address;
                await expectThrow(tx(contract, 'safeTransferFrom', {from: creator, gas}, creator, receiverAddress, assetsId[1], 1, emptyBytes));
            });

            t.test('transfering a assetof supply 1 to a contract that return incorrect magic value upon receiving erc1155 token should fails', async () => {
                const receiverContract = await deployContract(creator, 'TestERC1155Receiver', contract.options.address, true, false, true, false);
                const receiverAddress = receiverContract.options.address;
                await expectThrow(tx(contract, 'safeTransferFrom', {from: creator, gas}, creator, receiverAddress, assetsId[1], 1, emptyBytes));
            });

            t.test('transfering to a contract that do accept erc1155 token should not fail', async () => {
                const receiverContract = await deployContract(creator, 'TestERC1155Receiver', contract.options.address, true, true, false, true);
                const receiverAddress = receiverContract.options.address;
                await tx(contract, 'safeTransferFrom', {from: creator, gas}, creator, receiverAddress, assetsId[0], 3, emptyBytes);
                const balance = await call(contract, 'balanceOf', null, receiverAddress, assetsId[0]);
                assert.equal(balance, "3");
            });
        });

        t.test('batch transfers', async (t) => {
            t.test('transferring a item with 1 supply results in erc1155 transferBatch event', async () => {
                const receipt = await tx(contract, 'safeBatchTransferFrom', {from: creator, gas}, creator, user1, [assetsId[1]], [1], emptyBytes);
                const eventsMatching = await getEventsFromReceipt(contract, TransferBatchEvent, receipt);
                assert.equal(eventsMatching.length, 1);
                const eventValues = eventsMatching[0].returnValues;
                assert.equal(eventValues[0], creator);
                assert.equal(eventValues[1], creator);
                assert.equal(eventValues[2], user1);
                assert.equal(eventValues[3][0], assetsId[1]);
                assert.equal(eventValues[4][0], 1);
            });
            t.test('transfer a item with n>1 supply results in erc1155 transferBatch event', async () => {
                const receipt = await tx(contract, 'safeBatchTransferFrom', {from: creator, gas}, creator, user1, [assetsId[0]], [3], emptyBytes);
                const eventsMatching = await getEventsFromReceipt(contract, TransferBatchEvent, receipt);
                assert.equal(eventsMatching.length, 1);
                const eventValues = eventsMatching[0].returnValues;
                assert.equal(eventValues[0], creator);
                assert.equal(eventValues[1], creator);
                assert.equal(eventValues[2], user1);
                assert.equal(eventValues[3][0], assetsId[0]);
                assert.equal(eventValues[4][0], 3);
            });


            t.test('transfer multiple items with results one erc1155 transferBatch event', async () => {
                const receipt = await tx(contract, 'safeBatchTransferFrom', {from: creator, gas}, 
                creator,
                user1,
                [assetsId[0], assetsId[2], assetsId[1], assetsId[3], assetsId[4]],
                [3,4,1,1,3],
                emptyBytes);
                const eventsMatching = await getEventsFromReceipt(contract, TransferBatchEvent, receipt);
                assert.equal(eventsMatching.length, 1);
                const eventValues = eventsMatching[0].returnValues;
                assert.equal(eventValues[0], creator);
                assert.equal(eventValues[1], creator);
                assert.equal(eventValues[2], user1);
                assert.equal(eventValues[3][0], assetsId[0]);
                assert.equal(eventValues[3][1], assetsId[2]);
                assert.equal(eventValues[3][2], assetsId[1]);
                assert.equal(eventValues[3][3], assetsId[3]);
                assert.equal(eventValues[3][4], assetsId[4]);
                assert.equal(eventValues[4][0], 3);
                assert.equal(eventValues[4][1], 4);
                assert.equal(eventValues[4][2], 1);
                assert.equal(eventValues[4][3], 1);
                assert.equal(eventValues[4][4], 3);
            });


            t.test('batch transfer a item with 1 supply do NOT results in erc1155 transferSingle event', async () => {
                const receipt = await tx(contract, 'safeBatchTransferFrom', {from: creator, gas}, creator, user1, [assetsId[0]], [1], emptyBytes);
                const eventsMatching = await getEventsFromReceipt(contract, TransferSingleEvent, receipt);
                assert.equal(eventsMatching.length, 0);
            });

            t.test('batch transfer a item with n>1 supply do NOT results in erc1155 transferSingle event', async () => {
                const receipt = await tx(contract, 'safeBatchTransferFrom', {from: creator, gas}, creator, user1, [assetsId[0]], [3], emptyBytes);
                const eventsMatching = await getEventsFromReceipt(contract, TransferSingleEvent, receipt);
                assert.equal(eventsMatching.length, 0);
            });

            t.test('pass if sending to normal address address', async () => {
                await tx(contract, 'safeBatchTransferFrom', {from: creator, gas}, creator, user1, [assetsId[0]], [3], emptyBytes);
            });
            t.test('should throw if sending to zero address', async () => {
                await expectThrow(tx(contract, 'safeBatchTransferFrom', {from: creator, gas}, creator, zeroAddress, [assetsId[0]], [3], emptyBytes));
            });

            t.test('should not be able to transfer if arrays length do not match', async () => {
                await expectThrow(tx(contract, 'safeBatchTransferFrom', {from: creator, gas}, creator, user1, [assetsId[0], assetsId[1]], [11], emptyBytes));
            });

            t.test('should not be able to transfer more items than you own', async () => {
                await expectThrow(tx(contract, 'safeBatchTransferFrom', {from: creator, gas}, creator, user1, [assetsId[0]], [11], emptyBytes));
            });
            t.test('sshould not be able to transfer more item of 1 supply', async () => {
                await expectThrow(tx(contract, 'safeBatchTransferFrom', {from: creator, gas}, creator, user1, [assetsId[1]], [2], emptyBytes));
            });

            t.test('transfering a items to a contract that do not accept erc1155 token should fails', async () => {
                const receiverContract = await deployContract(creator, 'TestERC1155Receiver', contract.options.address, false, true, false, true);
                const receiverAddress = receiverContract.options.address;
                await expectThrow(tx(contract, 'safeBatchTransferFrom', {from: creator, gas}, creator, receiverAddress, [assetsId[0],assetsId[1], assetsId[2]], [2,1,3], emptyBytes));
            });

            t.test('transfering a assets to a contract that return incorrect magic value upon receiving erc1155 token should fails', async () => {
                const receiverContract = await deployContract(creator, 'TestERC1155Receiver', contract.options.address, true, false, true, false);
                const receiverAddress = receiverContract.options.address;
                await expectThrow(tx(contract, 'safeBatchTransferFrom', {from: creator, gas}, creator, receiverAddress, [assetsId[0],assetsId[1], assetsId[2]], [2,1,3], emptyBytes));
            });

            t.test('transfering to a contract that do accept erc1155 token should not fail', async () => {
                const receiverContract = await deployContract(creator, 'TestERC1155Receiver', contract.options.address, false, true, true, true);
                const receiverAddress = receiverContract.options.address;
                await tx(contract, 'safeBatchTransferFrom', {from: creator, gas}, creator, receiverAddress, [assetsId[0],assetsId[1], assetsId[2]], [3,1,3], emptyBytes);
                const balance = await call(contract, 'balanceOf', null, receiverAddress, assetsId[0]);
                assert.equal(balance, "3");
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
                await tx(contract, 'safeBatchTransferFrom', {from: creator, gas}, creator, user1, tokenIdsToTransfer, balancesToTransfer, emptyBytes);
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
            t.test('setting approval results in ApprovalForAll event', async () => {
                const receipt = await tx(contract, 'setApprovalForAll', {from: creator, gas}, operator, true);
                const eventsMatching = await getEventsFromReceipt(contract, ApprovalForAllEvent, receipt);
                assert.equal(eventsMatching.length, 1);
                const values = eventsMatching[0].returnValues;
                assert.equal(values[0], creator);
                assert.equal(values[1], operator);
                assert.equal(values[2], true);
            });
            t.test('unsetting approval results in ApprovalForAll event', async () => {
                await tx(contract, 'setApprovalForAll', {from: creator, gas}, operator, true);
                const receipt = await tx(contract, 'setApprovalForAll', {from: creator, gas}, operator, false);
                const eventsMatching = await getEventsFromReceipt(contract, ApprovalForAllEvent, receipt);
                assert.equal(eventsMatching.length, 1);
                const values = eventsMatching[0].returnValues;
                assert.equal(values[0], creator);
                assert.equal(values[1], operator);
                assert(!values[2]);
            });

            t.test('without approval, operator should not be able to transfer', async () => {
                await expectThrow(tx(contract, 'safeTransferFrom', {from: operator, gas}, creator, user1, assetsId[0], 2, emptyBytes));
            });
            t.test('without approval, operator should not be able to transfer, even supply 1', async () => {
                await expectThrow(tx(contract, 'safeTransferFrom', {from: operator, gas}, creator, user1, assetsId[1], 1, emptyBytes));
            });
            t.test('after operator setApprovalForAll, operator should be able to transfer', async () => {
                await tx(contract, 'setApprovalForAll', {from: creator, gas}, operator, true);
                const receipt = await tx(contract, 'safeTransferFrom', {from: operator, gas}, creator, user1, assetsId[0], 2, emptyBytes);
                const eventsMatching = await getEventsFromReceipt(contract, TransferSingleEvent, receipt);
                assert.equal(eventsMatching.length, 1);
            });
            t.test('after removing setApprovalForAll, operator should not be able to transfer', async () => {
                await tx(contract, 'setApprovalForAll', {from: creator, gas}, operator, true);
                await tx(contract, 'safeTransferFrom', {from: operator, gas}, creator, user1, assetsId[0], 2, emptyBytes);
                await tx(contract, 'setApprovalForAll', {from: creator, gas}, operator, false);
                await expectThrow(tx(contract, 'safeTransferFrom', {from: operator, gas}, creator, user1, assetsId[0], 2, emptyBytes));
            });
        });

        t.test('supportsInterface', async (t) => {
            t.test('claim to support erc165', async () => {
                const result = await call(contract, 'supportsInterface', null, '0x01ffc9a7');
                assert.equal(result, true);
            });

            t.test('claim to support base erc1155 interface', async () => {
                const result = await call(contract, 'supportsInterface', null, '0xd9b67a26');
                assert.equal(result, true);
            });

            t.test('does not claim to support random interface', async () => {
                const result = await call(contract, 'supportsInterface', null, '0x77777777');
                assert.equal(result, false);
            });

            t.test('does not claim to support the invalid interface', async () => {
                const result = await call(contract, 'supportsInterface', null, '0xFFFFFFFF');
                assert.equal(result, false);
            });
        });
    });
}

module.exports = {
    runERC1155tests,
}