const tap = require('tap');
const assert = require('assert');
const BN = require('bn.js');

const rocketh = require('rocketh');

const zeroAddress = '0x0000000000000000000000000000000000000000';

rocketh.launch().then(main);

function approximately(value, expected, range) {
  return value.gte(expected.sub(range)) && value.lte(expected.add(range));
}

const emptyBytes = '0x';

async function main({accounts}) {
  const {gas, expectThrow, getEventsFromReceipt, getPastEvents, toChecksumAddress, web3, deployContract, sendSignedTransaction} = require('../utils');
  const {
    TransferEvent,
    ApproveEvent,
    transfer,
    transferFrom,
    approve,
    getBalance,
    getAllowance,
    MintedEvent,
    SentEvent,
    burn,
    BurnedEvent,
    send,
    operatorSend,
    authorizeOperator,
    revokeOperator,
    AuthorizedOperatorEvent,
    RevokedOperatorEvent,
    tx,
    encodeCall,
    executePreTransferMetaTx,
    executePreApprovalMetaTx,
    executePreApprovalMetaTxViaBasicSignature,
    signEIP712MetaTx,
    signEIP712Approval
  } = require('../sand-utils');

  const creator = toChecksumAddress(accounts[0]);
  const sandOwner = creator;
  const user1 = toChecksumAddress(accounts[1]);
  const user2 = toChecksumAddress(accounts[2]);
  const user3 = toChecksumAddress(accounts[3]);
  const operator = toChecksumAddress(accounts[4]);
  const executor = toChecksumAddress(accounts[5]);
  const signingAcount = {
    address: '0xFA8A6079E7B85d1be95B6f6DE1aAE903b6F40c00',
    privateKey: '0xeee5270a5c46e5b92510d70fa4d445a8cdd5010dde5b1fccc6a2bd1a9df8f5c0'
  };

  const otherSigner = {
    address: '0x75aE6abE03070a906d7a9d5C1607605DE73a0880',
    privateKey: '0x3c42a6c587e8a82474031cc06f1e6af7f5301bb2417b89d98eb3023d0ce659f6'
  };

  function runERC20Tests(title, resetContracts) {
    tap.test(title, async (t) => {
      let contracts;
      t.beforeEach(async () => {
        contracts = await resetContracts();
      });

      t.test('deploy should emit Transfer event', async () => {
        const contracts = await resetContracts();
        const events = await getPastEvents(contracts.Sand, TransferEvent);
        assert.equal(events[0].returnValues[0], '0x0000000000000000000000000000000000000000');
        assert.equal(events[0].returnValues[1], sandOwner);
        assert.equal(events[0].returnValues[2], '3000000000000000000000000000');
      });

      t.test('transfering from user1 to user2 should adjust their balance accordingly', async () => {
        await transfer(contracts.Sand, user2, '1000', {from: user1, gas});
        const user1Balance = await getBalance(contracts.Sand, user1);
        const user2Balance = await getBalance(contracts.Sand, user2);
        assert.equal(user2Balance.toString(10), '1000');
        assert.equal(user1Balance.toString(10), '999000');
      });

      t.test('transfering from user1 more token that it owns should fails', async () => {
        await expectThrow(transfer(contracts.Sand, user2, '2000000', {from: user1, gas}));
      });

      t.test('transfering from user1 by user2 should fails', async () => {
        await expectThrow(transferFrom(contracts.Sand, user1, user2, '1000', {from: user2, gas}));
      });

      t.test('transfering from user1 to user2 should trigger a transfer event', async () => {
        const receipt = await transfer(contracts.Sand, user2, '1000', {from: user1, gas});
        const events = await getEventsFromReceipt(contracts.Sand, TransferEvent, receipt);
        assert.equal(events[0].returnValues[0], user1);
        assert.equal(events[0].returnValues[1], user2);
        assert.equal(events[0].returnValues[2], '1000');
      });

      t.test('transfering from user1 to user2 by operator after approval, should adjust their balance accordingly', async () => {
        await approve(contracts.Sand, operator, '1000', {from: user1, gas});
        await transferFrom(contracts.Sand, user1, user2, '1000', {from: operator, gas});
        const user1Balance = await getBalance(contracts.Sand, user1);
        const user2Balance = await getBalance(contracts.Sand, user2);
        assert.equal(user2Balance.toString(10), '1000');
        assert.equal(user1Balance.toString(10), '999000');
      });
      t.test('transfering from user1 to user2 by operator after approval and approval reset, should fail', async () => {
        await approve(contracts.Sand, operator, '1000', {from: user1, gas});
        await approve(contracts.Sand, operator, '0', {from: user1, gas});
        await expectThrow(transferFrom(contracts.Sand, user1, user2, '1000', {from: operator, gas}));
      });
      t.test('transfering from user1 to user2 by operator after approval, should adjust the operator alowance accordingly', async () => {
        await approve(contracts.Sand, operator, '1010', {from: user1, gas});
        await transferFrom(contracts.Sand, user1, user2, '1000', {from: operator, gas});
        const allowance = await getAllowance(contracts.Sand, user1, operator);
        assert.equal(allowance.toString(10), '10');
      });
      t.test('transfering from user1 to user2 by operator after max approval (2**256-1), should NOT adjust the operator allowance', async () => {
        await approve(contracts.Sand, operator, '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', {from: user1, gas});
        await transferFrom(contracts.Sand, user1, user2, '1000', {from: operator, gas});
        const allowance = await getAllowance(contracts.Sand, user1, operator);
        assert.equal(allowance.toString('hex'), 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
      });
      t.test('transfering from user1 to user2 by operator after approval, but without enough allowance, should fails', async () => {
        await approve(contracts.Sand, operator, '1010', {from: user1, gas});
        await expectThrow(transferFrom(contracts.Sand, user1, user2, '2000000', {from: operator, gas}));
      });
      t.test('transfering from user1 by operators without pre-approval should fails', async () => {
        await expectThrow(transferFrom(contracts.Sand, user1, user2, '1000', {from: operator, gas}));
      });
      t.test('approving operator should trigger a Approval event', async () => {
        const receipt = await approve(contracts.Sand, operator, '1000', {from: user1, gas});
        const events = await getEventsFromReceipt(contracts.Sand, ApproveEvent, receipt);
        assert.equal(events[0].returnValues[2], '1000');
      });
      t.test('disapproving operator (allowance to zero) should trigger a Approval event', async () => {
        const receipt = await approve(contracts.Sand, operator, '0', {from: user1, gas});
        const events = await getEventsFromReceipt(contracts.Sand, ApproveEvent, receipt);
        assert.equal(events[0].returnValues[2], '0');
      });

      t.test('burn', async (t) => {
        t.test('burn should emit erc20 transfer event to zero address', async () => {
          const receipt = await burn(contracts.Sand, '1000', {from: user1, gas});
          const events = await getEventsFromReceipt(contracts.Sand, TransferEvent, receipt);
          assert.equal(events[0].returnValues[0], user1);
          assert.equal(events[0].returnValues[1], '0x0000000000000000000000000000000000000000');
          assert.equal(events[0].returnValues[2], '1000');
        });
        t.test('burn should emit erc777 Burned event', async () => {
          const receipt = await burn(contracts.Sand, '1000', {from: user1, gas});
          const events = await getEventsFromReceipt(contracts.Sand, BurnedEvent, receipt);
          assert.equal(events[0].returnValues[0], user1);
          assert.equal(events[0].returnValues[1], user1);
          assert.equal(events[0].returnValues[2], '1000');
          assert.equal(events[0].returnValues[3], null);
          assert.equal(events[0].returnValues[4], null);
        });
        t.test('burning more token that a user owns should fails', async () => {
          await expectThrow(burn(contracts.Sand, '2000000', {from: user1, gas}));
        });
      });

      t.test('transfering from user1 to user2 should trigger a ERC777 Sent event', async () => {
        const receipt = await transfer(contracts.Sand, user2, '1000', {from: user1, gas});
        const events = await getEventsFromReceipt(contracts.Sand, SentEvent, receipt);
        assert.equal(events[0].returnValues[0], user1);
        assert.equal(events[0].returnValues[1], user1);
        assert.equal(events[0].returnValues[2], user2);
        assert.equal(events[0].returnValues[3], '1000');
        assert.equal(events[0].returnValues[4], null);
        assert.equal(events[0].returnValues[5], null);
      });

      t.test('deploy should emit ERC777 Minted event', async () => {
        const contracts = await resetContracts();
        const events = await getPastEvents(contracts.Sand, MintedEvent);
        assert.equal(events[0].returnValues[0], creator);
        assert.equal(events[0].returnValues[1], sandOwner);
        assert.equal(events[0].returnValues[2], '3000000000000000000000000000');
        assert.equal(events[0].returnValues[3], null);
      });
    });
  }

  const approvalTypeHash = web3.utils.soliditySha3({type:'string', value:'Approve(address from,uint256 messageId,address target,uint256 amount)'});
  function runERC20ApproveExtensionTests(title, resetContracts) {
    tap.test(title, async (t) => {
      let contracts;
      t.beforeEach(async () => {
        contracts = await resetContracts();
        await transfer(contracts.Sand, signingAcount.address, '1000000', {from: sandOwner, gas});
      });

      t.test('approveAndCall should fail if method call fails', async () => {
        const ERC20Fund = await deployContract(creator, 'ERC20Fund', contracts.Sand.options.address);
        const callData = encodeCall(ERC20Fund, 'fail');
        await expectThrow(tx(contracts.Sand, 'approveAndCall', {from: user1, gas}, ERC20Fund.options.address, 1000, callData));
      });

      t.test('approveAndCall should fail if allowance not enough', async () => {
        const ERC20Fund = await deployContract(creator, 'ERC20Fund', contracts.Sand.options.address);
        const callData = encodeCall(ERC20Fund, 'take', user1, 10000);
        await expectThrow(tx(contracts.Sand, 'approveAndCall', {from: user1, gas}, ERC20Fund.options.address, 1000, callData));
      });

      t.test('approveAndCall should fail if passing wrong sender in data', async () => {
        const ERC20Fund = await deployContract(creator, 'ERC20Fund', contracts.Sand.options.address);
        const callData = encodeCall(ERC20Fund, 'take', user2, 10000);
        await expectThrow(tx(contracts.Sand, 'approveAndCall', {from: user1, gas}, ERC20Fund.options.address, 10000, callData));
      });

      t.test('approveAndCall should fail if trying to call on behalf of someone else', async () => {
        const ERC20Fund = await deployContract(creator, 'ERC20Fund', contracts.Sand.options.address);
        const callData = encodeCall(ERC20Fund, 'take', user1, 10000);
        await expectThrow(tx(contracts.Sand, 'approveAndCall', {from: user2, gas}, ERC20Fund.options.address, 10000, callData));
      });

      t.test('approveAndCall', async () => {
        const ERC20Fund = await deployContract(creator, 'ERC20Fund', contracts.Sand.options.address);
        const callData = encodeCall(ERC20Fund, 'take', user1, 100);
        await tx(contracts.Sand, 'approveAndCall', {from: user1, gas}, ERC20Fund.options.address, 1000, callData);
        const user1Balance = await getBalance(contracts.Sand, user1);
        const ERC20FundBalance = await getBalance(contracts.Sand, ERC20Fund.options.address);
        assert.equal(ERC20FundBalance.toString(10), '100');
        assert.equal(user1Balance.toString(10), '999900');
      });

      t.test('approveViaBasicSignature fails if approved for someone else', async () => {
        const hash = web3.utils.soliditySha3(
          {type: 'address', value: contracts.Sand.options.address},
          {type: 'bytes32', value: approvalTypeHash},
          {type: 'address', value: user1},
          {type: 'uint256', value: 1},
          {type: 'address', value: user3},
          {type: 'uint256', value: 10000},
        );
        const signature = await web3.eth.sign(hash, user1);
        await tx(contracts.Sand, 'approveViaBasicSignature', {from: user2, gas}, user1, 1, user3, 10000, signature, false);
        await expectThrow(transferFrom(contracts.Sand, user1, user2, 1000, {from: user2, gas}));
      });

      t.test('approveViaBasicSignature fails if wrong signature', async () => {
        const hash = web3.utils.soliditySha3(
          {type: 'address', value: contracts.Sand.options.address},
          {type: 'bytes32', value: approvalTypeHash},
          {type: 'address', value: user1},
          {type: 'uint256', value: 1},
          {type: 'address', value: user2},
          {type: 'uint256', value: 1000},
        );
        const signature = await web3.eth.sign(hash, user1);
        await expectThrow(tx(contracts.Sand, 'approveViaBasicSignature', {from: user2, gas}, user1, 1, user2, 10000, signature, false));
      });

      t.test('approveViaBasicSignature', async () => {
        const hash = web3.utils.soliditySha3(
          {type: 'address', value: contracts.Sand.options.address},
          {type: 'bytes32', value: approvalTypeHash},
          {type: 'address', value: user1},
          {type: 'uint256', value: 1},
          {type: 'address', value: user2},
          {type: 'uint256', value: 10000},
        );
        const signature = await web3.eth.sign(hash, user1);
        await tx(contracts.Sand, 'approveViaBasicSignature', {from: user2, gas}, user1, 1, user2, 10000, signature, false);
        await transferFrom(contracts.Sand, user1, user2, 1000, {from: user2, gas});
        const user1Balance = await getBalance(contracts.Sand, user1);
        const user2Balance = await getBalance(contracts.Sand, user2);
        assert.equal(user2Balance.toString(10), '1000');
        assert.equal(user1Balance.toString(10), '999000');
      });

      t.test('approveViaBasicSignature fails if used second time', async () => {
        const hash = web3.utils.soliditySha3(
          {type: 'address', value: contracts.Sand.options.address},
          {type: 'bytes32', value: approvalTypeHash},
          {type: 'address', value: user1},
          {type: 'uint256', value: 1},
          {type: 'address', value: user2},
          {type: 'uint256', value: 10000},
        );
        const signature = await web3.eth.sign(hash, user1);
        await tx(contracts.Sand, 'approveViaBasicSignature', {from: user2, gas}, user1, 1, user2, 10000, signature, false);
        await expectThrow(tx(contracts.Sand, 'approveViaBasicSignature', {from: user2, gas}, user1, 1, user2, 10000, signature, false));
      });

      t.test('approveViaBasicSignature fails if used after being revoked', async () => {
        const hash = web3.utils.soliditySha3(
          {type: 'address', value: contracts.Sand.options.address},
          {type: 'bytes32', value: approvalTypeHash},
          {type: 'address', value: user1},
          {type: 'uint256', value: 1},
          {type: 'address', value: user2},
          {type: 'uint256', value: 10000},
        );
        const signature = await web3.eth.sign(hash, user1);
        await tx(contracts.Sand, 'revokeApprovalMessage', {from: user1, gas}, 1);
        await expectThrow(tx(contracts.Sand, 'approveViaBasicSignature', {from: user2, gas}, user1, 1, user2, 10000, signature, false));
      });

      t.test('approveViaBasicSignature on behalf of identity contract', async () => {
        const IdentityContract = await deployContract(creator, 'ERC1271Wallet', user1);
        await transfer(contracts.Sand, IdentityContract.options.address, '1000000', {from: sandOwner, gas});
        const hash = web3.utils.soliditySha3(
          {type: 'address', value: contracts.Sand.options.address},
          {type: 'bytes32', value: approvalTypeHash},
          {type: 'address', value: IdentityContract.options.address},
          {type: 'uint256', value: 1},
          {type: 'address', value: user2},
          {type: 'uint256', value: 10000},
        );
        const signature = await web3.eth.sign(hash, user1);
        await tx(contracts.Sand, 'approveViaBasicSignature', {from: user2, gas}, IdentityContract.options.address, 1, user2, 10000, signature, true);
        await transferFrom(contracts.Sand, IdentityContract.options.address, user2, 1000, {from: user2, gas});
        const identityBalance = await getBalance(contracts.Sand, IdentityContract.options.address);
        const user2Balance = await getBalance(contracts.Sand, user2);
        assert.equal(user2Balance.toString(10), '1000');
        assert.equal(identityBalance.toString(10), '999000');
      });

      t.test('approveViaBasicSignature on behalf of identity contract fails if not approved', async () => {
        const IdentityContract = await deployContract(creator, 'ERC1271Wallet', user1);
        await transfer(contracts.Sand, IdentityContract.options.address, '1000000', {from: sandOwner, gas});
        const hash = web3.utils.soliditySha3(
          {type: 'address', value: contracts.Sand.options.address},
          {type: 'bytes32', value: approvalTypeHash},
          {type: 'address', value: IdentityContract.options.address},
          {type: 'uint256', value: 1},
          {type: 'address', value: user2},
          {type: 'uint256', value: 10000},
        );
        const signature = await web3.eth.sign(hash, user3);
        await expectThrow(tx(contracts.Sand, 'approveViaBasicSignature', {from: user2, gas}, IdentityContract.options.address, 1, user2, 10000, signature, true));
      });

      t.test('approveViaSignature', async () => {
        const chainId = await web3.eth.net.getId();
        const signature = signEIP712Approval(signingAcount, contracts.Sand.options.address, chainId, {messageId: 1, target: user2, amount:10000});
        await tx(contracts.Sand, 'approveViaSignature', {from: user2, gas}, signingAcount.address, 1, user2, 10000, signature, false);
        await transferFrom(contracts.Sand, signingAcount.address, user2, 1000, {from: user2, gas});
        const user2Balance = await getBalance(contracts.Sand, user2);
        const signingUserBalance = await getBalance(contracts.Sand, signingAcount.address);
        assert.equal(signingUserBalance.toString(10), '999000');
        assert.equal(user2Balance.toString(10), '1000');
      });
      t.test('approveViaSignature fails if approved for someone else', async () => {
        const chainId = await web3.eth.net.getId();
        const signature = signEIP712Approval(signingAcount, contracts.Sand.options.address, chainId, {messageId: 1, target: user3, amount: 10000});
        await tx(contracts.Sand, 'approveViaSignature', {from: user2, gas}, signingAcount.address, 1, user3, 10000, signature, false);
        await expectThrow(transferFrom(contracts.Sand, signingAcount.address, user2, 1000, {from: user2, gas}));
      });
      t.test('approveViaSignature fails if not enough allowance', async () => {
        const chainId = await web3.eth.net.getId();
        const signature = signEIP712Approval(signingAcount, contracts.Sand.options.address, chainId, {messageId: 1, target: user2, amount:1000});
        await tx(contracts.Sand, 'approveViaSignature', {from: user2, gas}, signingAcount.address, 1, user2, 1000, signature, false);
        await expectThrow(transferFrom(contracts.Sand, signingAcount.address, user2, 10000, {from: user2, gas}));
      });
      t.test('approveViaSignature fails if wrong signature', async () => {
        const chainId = await web3.eth.net.getId();
        const signature = signEIP712Approval(signingAcount, contracts.Sand.options.address, chainId, {messageId: 1, target: user2, amount:1000});
        await expectThrow(tx(contracts.Sand, 'approveViaSignature', {from: user2, gas}, signingAcount.address, 1, user2, 10000, signature, false));
      });

      t.test('approveViaSignature fails if used second time', async () => {
        const chainId = await web3.eth.net.getId();
        const signature = signEIP712Approval(signingAcount, contracts.Sand.options.address, chainId, {messageId: 1, target: user2, amount:10000});
        await tx(contracts.Sand, 'approveViaSignature', {from: user2, gas}, signingAcount.address, 1, user2, 10000, signature, false);
        await expectThrow(tx(contracts.Sand, 'approveViaSignature', {from: user2, gas}, signingAcount.address, 1, user2, 10000, signature, false));
      });

      t.test('approveViaSignature fails if used after being revoked', async () => {
        const chainId = await web3.eth.net.getId();
        await web3.eth.sendTransaction({from: sandOwner, gas, to: signingAcount.address, value: 1000000000000000000}); // give some eth so signer can revoke
        const signature = signEIP712Approval(signingAcount, contracts.Sand.options.address, chainId, {messageId: 1, target: user2, amount:10000});
        const callData = encodeCall(contracts.Sand, 'revokeApprovalMessage', 1);
        await sendSignedTransaction(callData, contracts.Sand.options.address, signingAcount.privateKey);
        await expectThrow(tx(contracts.Sand, 'approveViaSignature', {from: user2, gas}, signingAcount.address, 1, user2, 10000, signature, false));
      });

      t.test('approveViaSignature on behalf of identity contract', async () => {
        const IdentityContract = await deployContract(creator, 'ERC1271Wallet', otherSigner.address);
        await transfer(contracts.Sand, IdentityContract.options.address, '1000000', {from: sandOwner, gas});
        const chainId = await web3.eth.net.getId();
        const signature = signEIP712Approval(otherSigner, contracts.Sand.options.address, chainId, {messageId: 1, target: user2, amount:10000, from: IdentityContract.options.address});
        await tx(contracts.Sand, 'approveViaSignature', {from: user2, gas}, IdentityContract.options.address, 1, user2, 10000, signature, true);
        await transferFrom(contracts.Sand, IdentityContract.options.address, user2, 1000, {from: user2, gas});
        const user2Balance = await getBalance(contracts.Sand, user2);
        const identityBalance = await getBalance(contracts.Sand, IdentityContract.options.address);
        assert.equal(identityBalance.toString(10), '999000');
        assert.equal(user2Balance.toString(10), '1000');
      });

      t.test('approveViaSignature on behalf of identity contract fails if not approved', async () => {
        const IdentityContract = await deployContract(creator, 'ERC1271Wallet', signingAcount.address);
        await transfer(contracts.Sand, IdentityContract.options.address, '1000000', {from: sandOwner, gas});
        const chainId = await web3.eth.net.getId();
        const signature = signEIP712Approval(otherSigner, contracts.Sand.options.address, chainId, {messageId: 1, target: user2, amount:10000, from: IdentityContract.options.address});
        await expectThrow(tx(contracts.Sand, 'approveViaSignature', {from: user2, gas}, IdentityContract.options.address, 1, user2, 10000, signature, true));
      });
    });
  }

  function runMetaTxExtensionTests(title, resetContracts, use777) {
    tap.test(title, async (t) => {
      const initialSand = new BN('1000000000000000000000000');
      let contracts;
      t.beforeEach(async () => {
        contracts = await resetContracts();
        if(use777) {
          contracts.Receiver = await deployContract(creator, 'Sand777Receiver', contracts.Sand.options.address, true);
        } else {
          contracts.Receiver = await deployContract(creator, 'ERC20MetaTxReceiver', contracts.Sand.options.address, 150);
        }
        
        await transfer(contracts.Sand, signingAcount.address, initialSand.toString(10), {from: sandOwner, gas});
      });

      t.test('executeMetaTx simple transfer', async () => {
        const chainId = await web3.eth.net.getId();
        const receipt = await executePreApprovalMetaTx(signingAcount,
          contracts.Sand,
          chainId,
          {from:executor, gas, gasPrice:1},
          {nonce:1, gasPrice:1, gasLimit:2000000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, use777},
          user2,
          150);

        const signerBalance = await getBalance(contracts.Sand, signingAcount.address);
        const user2Balance = await getBalance(contracts.Sand, user2);
        
        const tokenSpentForGas = new BN(37941);
        const expectedSandLeftForSigner = initialSand.sub(new BN('150')).sub(tokenSpentForGas)
        assert.ok(signerBalance, expectedSandLeftForSigner, 1000);
        assert.equal(user2Balance.toString(10), '150');        
      });

      t.test('executeMetaTx simple transfer via basic signature', async () => {
        await transfer(contracts.Sand, user1, new BN('1000000000000000000000000').toString(10), {from: sandOwner, gas});
        const user1InitialSand = await getBalance(contracts.Sand, user1);
        const receipt = await executePreApprovalMetaTxViaBasicSignature(
          web3,
          user1,
          contracts.Sand,
          {from:executor, gas, gasPrice:1},
          {nonce:1, gasPrice:1, gasLimit:2000000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, use777},
          user2,
          150);

        const user1Balance = await getBalance(contracts.Sand, signingAcount.address);
        const user2Balance = await getBalance(contracts.Sand, user2);
        
        const tokenSpentForGas = new BN(37941);
        const expectedSandLeftForUser1 = user1InitialSand.sub(new BN('150')).sub(tokenSpentForGas)
        assert.ok(user1Balance, expectedSandLeftForUser1, 1000);
        assert.equal(user2Balance.toString(10), '150');        
      });

      t.test('executeMetaTx simple transfer via identity contract', async () => {
        const chainId = await web3.eth.net.getId();
        const IdentityContract = await deployContract(creator, 'ERC1271Wallet', signingAcount.address);
        const identityAddress = IdentityContract.options.address;
        await transfer(contracts.Sand, identityAddress, initialSand.toString(10), {from: sandOwner, gas});
        const receipt = await executePreApprovalMetaTx(signingAcount,
          contracts.Sand,
          chainId,
          {from:executor, gas, gasPrice:1},
          {from: identityAddress, nonce:1, gasPrice:1, gasLimit:2000000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, signedOnBehalf: true, use777},
          user2,
          150);

        const identityBalance = await getBalance(contracts.Sand, identityAddress);
        const user2Balance = await getBalance(contracts.Sand, user2);
        
        const tokenSpentForGas = new BN(37941);
        const expectedSandLeftForIdentity = initialSand.sub(new BN('150')).sub(tokenSpentForGas)
        assert.ok(identityBalance, expectedSandLeftForIdentity, 1000);
        assert.equal(user2Balance.toString(10), '150');        
      });

      t.test('executeMetaTx simple transfer via identity contract fails when not approved', async () => {
        const chainId = await web3.eth.net.getId();
        const IdentityContract = await deployContract(creator, 'ERC1271Wallet', otherSigner.address);
        const identityAddress = IdentityContract.options.address;
        await transfer(contracts.Sand, identityAddress, initialSand.toString(10), {from: sandOwner, gas});
        await expectThrow(executePreApprovalMetaTx(signingAcount,
          contracts.Sand,
          chainId,
          {from:executor, gas, gasPrice:1},
          {from: identityAddress, nonce:1, gasPrice:1, gasLimit:2000000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, signedOnBehalf: true, use777},
          user2,
          150));
      });

      // if(use777) {
      //   // TODO allow
      //   return;
      // }
      t.test('executeMetaTx transfer and call', async () => {
        const chainId = await web3.eth.net.getId();
        const receiverAddress = contracts.Receiver.options.address;
        await executePreApprovalMetaTx(signingAcount,
          contracts.Sand,
          chainId,
          {from:executor, gas, gasPrice:1},
          {nonce:1, gasPrice:1, gasLimit:2000000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, use777},
          contracts.Receiver,
          150,
          'receiveMeta', signingAcount.address, 'test', 150, 111);
        
        const signerBalance = await getBalance(contracts.Sand, signingAcount.address);
        const receiverBalance = await getBalance(contracts.Sand, receiverAddress);
        
        const tokenSpentForGas = new BN(37658);
        const expectedSandLeftForSigner = initialSand.sub(new BN('150')).sub(tokenSpentForGas)
        assert.ok(signerBalance, expectedSandLeftForSigner, 1000);
        assert.equal(receiverBalance.toString(10), '150');        
      });

      t.test('executeMetaTx transfer and call via basic signature', async () => {
        await transfer(contracts.Sand, user1, new BN('1000000000000000000000000').toString(10), {from: sandOwner, gas});
        const user1InitialSand = await getBalance(contracts.Sand, user1);
        const receiverAddress = contracts.Receiver.options.address;
        const receipt = await executePreApprovalMetaTxViaBasicSignature(
          web3,
          user1,
          contracts.Sand,
          {from:executor, gas, gasPrice:1},
          {nonce:1, gasPrice:1, gasLimit:2000000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, use777},
          contracts.Receiver,
          150,
          'receiveMeta', user1, 'test', 150, 111);

        const user1Balance = await getBalance(contracts.Sand, signingAcount.address);
        const receiverBalance = await getBalance(contracts.Sand, receiverAddress);
        
        const tokenSpentForGas = new BN(37941);
        const expectedSandLeftForUser1 = user1InitialSand.sub(new BN('150')).sub(tokenSpentForGas)
        assert.ok(user1Balance, expectedSandLeftForUser1, 1000);
        assert.equal(receiverBalance.toString(10), '150');        
      });

      t.test('executeMetaTx transfer and call via basic signature and identity contract', async () => {
        const receiverAddress = contracts.Receiver.options.address;
        const IdentityContract = await deployContract(creator, 'ERC1271Wallet', user1);
        const identityAddress = IdentityContract.options.address;
        await transfer(contracts.Sand, identityAddress, initialSand.toString(10), {from: sandOwner, gas});
        const identityInitialSand = await getBalance(contracts.Sand, user1);
        const receipt = await executePreApprovalMetaTxViaBasicSignature(
          web3,
          user1,
          contracts.Sand,
          {from:executor, gas, gasPrice:1},
          {from: identityAddress, nonce:1, gasPrice:1, gasLimit:2000000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, signedOnBehalf: true, use777},
          contracts.Receiver,
          150,
          'receiveMeta', identityAddress, 'test', 150, 111);

        const identityBalance = await getBalance(contracts.Sand, identityAddress);
        const receiverBalance = await getBalance(contracts.Sand, receiverAddress);
        
        const tokenSpentForGas = new BN(37941);
        const expectedSandLeftForIdentity = identityInitialSand.sub(new BN('150')).sub(tokenSpentForGas)
        assert.ok(identityBalance, expectedSandLeftForIdentity, 1000);
        assert.equal(receiverBalance.toString(10), '150');        
      });

      t.test('executeMetaTx transfer and call via basic signature and identity contract fails if not approved', async () => {
        const receiverAddress = contracts.Receiver.options.address;
        const IdentityContract = await deployContract(creator, 'ERC1271Wallet', user3);
        const identityAddress = IdentityContract.options.address;
        await transfer(contracts.Sand, identityAddress, initialSand.toString(10), {from: sandOwner, gas});
        const identityInitialSand = await getBalance(contracts.Sand, user1);
        await expectThrow(executePreApprovalMetaTxViaBasicSignature(
          web3,
          user1,
          contracts.Sand,
          {from:executor, gas, gasPrice:1},
          {from: identityAddress, nonce:1, gasPrice:1, gasLimit:2000000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, signedOnBehalf: true, use777},
          contracts.Receiver,
          150,
          'receiveMeta', user1, 'test', 150, 111));      
      });

      t.test('executeMetaTx transfer and call via identity contract', async () => {
        const chainId = await web3.eth.net.getId();
        const receiverAddress = contracts.Receiver.options.address;
        const IdentityContract = await deployContract(creator, 'ERC1271Wallet', signingAcount.address);
        const identityAddress = IdentityContract.options.address;
        await transfer(contracts.Sand, identityAddress, initialSand.toString(10), {from: sandOwner, gas});
        await executePreApprovalMetaTx(signingAcount,
          contracts.Sand,
          chainId,
          {from:executor, gas, gasPrice:1},
          {from: identityAddress, nonce:1, gasPrice:1, gasLimit:2000000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, signedOnBehalf: true, use777},
          contracts.Receiver,
          150,
          'receiveMeta', identityAddress, 'test', 150, 111); //address does not matter here
        
        const identityBalance = await getBalance(contracts.Sand, identityAddress);
        const receiverBalance = await getBalance(contracts.Sand, receiverAddress);
        
        const tokenSpentForGas = new BN(37658);
        const expectedSandLeftForIdentity = initialSand.sub(new BN('150')).sub(tokenSpentForGas)
        assert.ok(identityBalance, expectedSandLeftForIdentity, 1000);
        assert.equal(receiverBalance.toString(10), '150');        
      });

      t.test('executeMetaTx transfer and call via identity contract fails if not approved', async () => {
        const chainId = await web3.eth.net.getId();
        const receiverAddress = contracts.Receiver.options.address;
        const IdentityContract = await deployContract(creator, 'ERC1271Wallet', otherSigner.address);
        const identityAddress = IdentityContract.options.address;
        await transfer(contracts.Sand, identityAddress, initialSand.toString(10), {from: sandOwner, gas});
        await expectThrow(executePreApprovalMetaTx(signingAcount,
          contracts.Sand,
          chainId,
          {from:executor, gas, gasPrice:1},
          {from: identityAddress, nonce:1, gasPrice:1, gasLimit:2000000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, signedOnBehalf: true, use777},
          contracts.Receiver,
          150,
          'receiveMeta', signingAcount.address, 'test', 150, 111)); //address does not matter here
      });

    });
  }

  function runERC777Tests(title, resetContracts) {
    tap.test(title, async (t) => {
      let contracts;
      t.beforeEach(async () => {
        contracts = await resetContracts();
      });

      t.test('sending from user1 to user2 should adjust their balance accordingly', async () => {
        await send(contracts.Sand, user2, '1000', emptyBytes, {from: user1, gas});
        const user1Balance = await getBalance(contracts.Sand, user1);
        const user2Balance = await getBalance(contracts.Sand, user2);
        assert.equal(user2Balance.toString(10), '1000');
        assert.equal(user1Balance.toString(10), '999000');
      });
      t.test('sending from user1 more token that it owns should fails', async () => {
        await expectThrow(send(contracts.Sand, user2, '2000000', emptyBytes, {from: user1, gas}));
      });
      t.test('sending from user1 by user2 should fails', async () => {
        await expectThrow(operatorSend(contracts.Sand, user1, user2, '1000', emptyBytes, emptyBytes, {from: user2, gas}));
      });

      t.test('sending from user1 to user2 should trigger a Sent event', async () => {
        const receipt = await send(contracts.Sand, user2, '1000', emptyBytes, {from: user1, gas});
        const events = await getEventsFromReceipt(contracts.Sand, SentEvent, receipt);
        assert.equal(events[0].returnValues[3], '1000');
      });

      t.test('sending (erc777) from user1 to user2 by operator after erc20 approval, should fails', async () => {
        await approve(contracts.Sand, operator, '1000', {from: user1, gas});
        await expectThrow(operatorSend(contracts.Sand, user1, user2, '1000', emptyBytes, emptyBytes, {from: operator, gas}));
      });
      t.test('sending from user1 to user2 by operator after authorization, should adjust the balances accordingly', async () => {
        await authorizeOperator(contracts.Sand, operator, {from: user1, gas});
        await operatorSend(contracts.Sand, user1, user2, '1000', emptyBytes, emptyBytes, {from: operator, gas});
        const user1Balance = await getBalance(contracts.Sand, user1);
        const user2Balance = await getBalance(contracts.Sand, user2);
        assert.equal(user2Balance.toString(10), '1000');
        assert.equal(user1Balance.toString(10), '999000');
      });
      t.test('sending from user1 by operators without pre-authorization should fails', async () => {
        await expectThrow(operatorSend(contracts.Sand, user1, user2, '1000', emptyBytes, emptyBytes, {from: operator, gas}));
      });

      t.test('sending from user1 by operators with authorization and then revokation should fails', async () => {
        await authorizeOperator(contracts.Sand, operator, {from: user1, gas});
        await revokeOperator(contracts.Sand, operator, {from: user1, gas});
        await expectThrow(operatorSend(contracts.Sand, user1, user2, '1000', emptyBytes, emptyBytes, {from: operator, gas}));
      });

      t.test('authorizing operator should trigger a AuthorizeOperator event', async () => {
        const receipt = await authorizeOperator(contracts.Sand, operator, {from: user1, gas});
        const events = await getEventsFromReceipt(contracts.Sand, AuthorizedOperatorEvent, receipt);
        assert.equal(events[0].returnValues[0], operator);
      });

      t.test('sending to contract should fail if contract does not implement tokensReceived', async () => {
        const ERC20Fund = await deployContract(creator, 'ERC20Fund', contracts.Sand.options.address);
        await expectThrow(send(contracts.Sand, ERC20Fund.options.address, '1000', emptyBytes, {from: user1, gas}));
      });

      t.test('sending to contract should succeed if contract implements tokensReceived and accept', async () => {
        const Sand777Receiver = await deployContract(creator, 'Sand777Receiver', contracts.Sand.options.address, true);
        await send(contracts.Sand, Sand777Receiver.options.address, '1000', emptyBytes, {from: user1, gas});
        const user1Balance = await getBalance(contracts.Sand, user1);
        const sand777ReceiverBalance = await getBalance(contracts.Sand, Sand777Receiver.options.address);
        assert.equal(sand777ReceiverBalance.toString(10), '1000');
        assert.equal(user1Balance.toString(10), '999000');
      });

      t.test('sending to contract should fails if contract implements tokensReceived and reject', async () => {
        const Sand777Receiver = await deployContract(creator, 'Sand777Receiver', contracts.Sand.options.address, false);
        await expectThrow(send(contracts.Sand, Sand777Receiver.options.address, '1000', emptyBytes, {from: user1, gas}));
      });

      t.test('transfering (erc20) to contract should fails if contract implements tokensReceived and reject', async () => {
        const Sand777Receiver = await deployContract(creator, 'Sand777Receiver', contracts.Sand.options.address, false);
        await expectThrow(transfer(contracts.Sand, Sand777Receiver.options.address, '1000', {from: user1, gas}));
      });

      t.test('transfering (erc20) to contract should NOT fail if contract does not implement tokensReceived', async () => {
        const ERC20Fund = await deployContract(creator, 'ERC20Fund', contracts.Sand.options.address);
        await transfer(contracts.Sand, ERC20Fund.options.address, '1000', {from: user1, gas});
        const user1Balance = await getBalance(contracts.Sand, user1);
        const ERC20FundReceiverBalance = await getBalance(contracts.Sand, ERC20Fund.options.address);
        assert.equal(ERC20FundReceiverBalance.toString(10), '1000');
        assert.equal(user1Balance.toString(10), '999000');
      });

      t.test('transfering (erc20) to contract should succeed if contract implements tokensReceived and accept', async () => {
        const Sand777Receiver = await deployContract(creator, 'Sand777Receiver', contracts.Sand.options.address, true);
        await transfer(contracts.Sand, Sand777Receiver.options.address, '1000', {from: user1, gas});
        const user1Balance = await getBalance(contracts.Sand, user1);
        const sand777ReceiverBalance = await getBalance(contracts.Sand, Sand777Receiver.options.address);
        assert.equal(sand777ReceiverBalance.toString(10), '1000');
        assert.equal(user1Balance.toString(10), '999000');
      });

      t.test('sending from contract should NOT fail if contract does not implement tokensToSend', async () => {
        const Sand777Receiver = await deployContract(creator, 'Sand777Receiver', contracts.Sand.options.address, true);
        await send(contracts.Sand, Sand777Receiver.options.address, '1000', emptyBytes, {from: user1, gas});
        await tx(Sand777Receiver, 'send', {from: user1, gas}, user1, '100');
        const user1Balance = await getBalance(contracts.Sand, user1);
        const sand777ReceiverBalance = await getBalance(contracts.Sand, Sand777Receiver.options.address);
        assert.equal(sand777ReceiverBalance.toString(10), '900');
        assert.equal(user1Balance.toString(10), '999100');
      });

      t.test('sending from contract should succeed if contract implements tokensToSend and accept', async () => {
        const Sand777Sender = await deployContract(creator, 'Sand777Sender', contracts.Sand.options.address, true);
        await send(contracts.Sand, Sand777Sender.options.address, '1000', emptyBytes, {from: user1, gas});
        await tx(Sand777Sender, 'send', {from: user1, gas}, user1, '100');
        const user1Balance = await getBalance(contracts.Sand, user1);
        const sand777SenderBalance = await getBalance(contracts.Sand, Sand777Sender.options.address);
        assert.equal(sand777SenderBalance.toString(10), '900');
        assert.equal(user1Balance.toString(10), '999100');
      });

      t.test('sending from contract should fails if contract implements tokensToSend and reject', async () => {
        const Sand777Sender = await deployContract(creator, 'Sand777Sender', contracts.Sand.options.address, false);
        await send(contracts.Sand, Sand777Sender.options.address, '1000', emptyBytes, {from: user1, gas});
        await expectThrow(tx(Sand777Sender, 'send', {from: user1, gas}, user1, '100'));
      });

      t.test('transfering (erc20) from contract should fails if contract implements tokensToSend and reject', async () => {
        const Sand777Sender = await deployContract(creator, 'Sand777Sender', contracts.Sand.options.address, false);
        await send(contracts.Sand, Sand777Sender.options.address, '1000', emptyBytes, {from: user1, gas});
        await expectThrow(tx(Sand777Sender, 'transfer', {from: user1, gas}, user1, '100'));
      });

      t.test('transfering (erc20) from contract should NOT fail if contract does not implement tokensToSend', async () => {
        const Sand777Receiver = await deployContract(creator, 'Sand777Receiver', contracts.Sand.options.address, true);
        await send(contracts.Sand, Sand777Receiver.options.address, '1000', emptyBytes, {from: user1, gas});
        await tx(Sand777Receiver, 'transfer', {from: user1, gas}, user1, '100');
        const user1Balance = await getBalance(contracts.Sand, user1);
        const sand777ReceiverBalance = await getBalance(contracts.Sand, Sand777Receiver.options.address);
        assert.equal(sand777ReceiverBalance.toString(10), '900');
        assert.equal(user1Balance.toString(10), '999100');
      });

      t.test('transfering (erc20) from contract should succeed if contract implements tokensToSend and accept', async () => {
        const Sand777Sender = await deployContract(creator, 'Sand777Sender', contracts.Sand.options.address, true);
        await send(contracts.Sand, Sand777Sender.options.address, '1000', emptyBytes, {from: user1, gas});
        await tx(Sand777Sender, 'transfer', {from: user1, gas}, user1, '100');
        const user1Balance = await getBalance(contracts.Sand, user1);
        const sand777SenderBalance = await getBalance(contracts.Sand, Sand777Sender.options.address);
        assert.equal(sand777SenderBalance.toString(10), '900');
        assert.equal(user1Balance.toString(10), '999100');
      });
    });
  }

  function failERC777Tests(title, resetContracts) {
    tap.test(title, async (t) => {
      let contracts;
      t.beforeEach(async () => {
        contracts = await resetContracts();
        const Sand777ContractInfo = rocketh.contractInfo('Sand777');
        contracts.Sand = new web3.eth.Contract(Sand777ContractInfo.abi, contracts.Sand.options.address);
      });

      t.test('sending from user1 to user2 should fail', async () => {
        await expectThrow(send(contracts.Sand, user2, '1000', emptyBytes, {from: user1, gas}));
      });
      t.test('authorizeOperator should fails', async () => {
        await expectThrow(authorizeOperator(contracts.Sand, operator, {from: user1, gas}));
      });
    });
  }

  async function nonUpgradeableBasicSand() {
    const contracts = {};
    contracts.Sand = await deployContract(creator, 'Sand20Basic', sandOwner);
    await transfer(contracts.Sand, user1, '1000000', {from: creator, gas});
    return contracts;
  }

  async function nonUpgradeableSand() {
    const chainId = await web3.eth.net.getId();
    const contracts = {};
    contracts.Sand = await deployContract(creator, 'Sand20', sandOwner, chainId);
    await transfer(contracts.Sand, user1, '1000000', {from: creator, gas});
    return contracts;
  }

  async function nonUpgradeableSand777() {
    const chainId = await web3.eth.net.getId();
    const contracts = {};
    contracts.Sand = await deployContract(creator, 'Sand777', sandOwner, chainId);
    await transfer(contracts.Sand, user1, '1000000', {from: creator, gas});
    return contracts;
  }

  async function upgradableBasicSand() {
    const contracts = {};
    contracts.Sand20 = await deployContract(creator, 'Sand20Basic', sandOwner);
    const initData = contracts.Sand20.methods.initSand(sandOwner).encodeABI();
    contracts.AdminUpgradeabilityProxy = await deployContract(creator, 'AdminUpgradeabilityProxy', contracts.Sand20.options.address, initData);
    contracts.Sand = new web3.eth.Contract(contracts.Sand20.options.jsonInterface, contracts.AdminUpgradeabilityProxy.options.address);
    await transfer(contracts.Sand, user1, '1000000', {from: sandOwner, gas});
    return contracts;
  }

  async function upgradableSand() {
    const chainId = await web3.eth.net.getId();
    const contracts = {};
    contracts.Sand20 = await deployContract(creator, 'Sand20', sandOwner, chainId);
    const initData = contracts.Sand20.methods.initSand(sandOwner, chainId).encodeABI();
    contracts.AdminUpgradeabilityProxy = await deployContract(creator, 'AdminUpgradeabilityProxy', contracts.Sand20.options.address, initData);
    contracts.Sand = new web3.eth.Contract(contracts.Sand20.options.jsonInterface, contracts.AdminUpgradeabilityProxy.options.address);
    await transfer(contracts.Sand, user1, '1000000', {from: sandOwner, gas});
    return contracts;
  }

  async function erc777UpgradedFrom20() {
    const chainId = await web3.eth.net.getId();
    const contracts = {};
    contracts.Sand20 = await deployContract(creator, 'Sand20', sandOwner, chainId);
    const initData = contracts.Sand20.methods.initSand(sandOwner, chainId).encodeABI();
    contracts.Sand777 = await deployContract(creator, 'Sand777', sandOwner, chainId);
    contracts.AdminUpgradeabilityProxy = await deployContract(creator, 'AdminUpgradeabilityProxy', contracts.Sand20.options.address, initData);
    const matchingEvents = await contracts.AdminUpgradeabilityProxy.getPastEvents('AdminChanged');
    const adminAddress = matchingEvents[0].returnValues.newAdmin;
    const ProxyAdminContractInfo = rocketh.contractInfo('ProxyAdmin');
    contracts.ProxyAdmin = new web3.eth.Contract(ProxyAdminContractInfo.abi, adminAddress);
    contracts.Sand = new web3.eth.Contract(contracts.Sand777.options.jsonInterface, contracts.AdminUpgradeabilityProxy.options.address);
    await contracts.ProxyAdmin.methods.upgradeToAndCall(contracts.Sand777.options.address, initData).send({from: creator, gas});
    await transfer(contracts.Sand, user1, '1000000', {from: sandOwner, gas});
    return contracts;
  }

  async function upgradedTo777AndThenDowngradedTo20() {
    const chainId = await web3.eth.net.getId();
    const contracts = {};
    contracts.Sand20 = await deployContract(creator, 'Sand20', sandOwner, chainId);
    const initData = contracts.Sand20.methods.initSand(sandOwner, chainId).encodeABI();
    contracts.Sand777 = await deployContract(creator, 'Sand777', sandOwner, chainId);
    contracts.AdminUpgradeabilityProxy = await deployContract(creator, 'AdminUpgradeabilityProxy', contracts.Sand20.options.address, initData);
    const matchingEvents = await contracts.AdminUpgradeabilityProxy.getPastEvents('AdminChanged');
    const adminAddress = matchingEvents[0].returnValues.newAdmin;
    const ProxyAdminContractInfo = rocketh.contractInfo('ProxyAdmin');
    contracts.ProxyAdmin = new web3.eth.Contract(ProxyAdminContractInfo.abi, adminAddress);
    contracts.Sand = new web3.eth.Contract(contracts.Sand20.options.jsonInterface, contracts.AdminUpgradeabilityProxy.options.address);
    await contracts.ProxyAdmin.methods.upgradeToAndCall(contracts.Sand777.options.address, initData).send({from: creator, gas});
    await contracts.ProxyAdmin.methods.upgradeTo(contracts.Sand20.options.address).send({from: creator, gas});
    await transfer(contracts.Sand, user1, '1000000', {from: sandOwner, gas});
    return contracts;
  }

  runERC20Tests('non-upgradeable Basic SAND (with ERC777 events)', nonUpgradeableBasicSand);

  runERC20Tests('non-upgradeable SAND with ERC777 events', nonUpgradeableSand);

  runERC20Tests('upgradeable Basic SAND (with ERC777 events)', upgradableBasicSand);

  runERC20Tests('upgradeable SAND with ERC777 events', upgradableSand);

  runERC20Tests('SAND upgraded to ERC777', erc777UpgradedFrom20);

  runERC20Tests('SAND upgraded to ERC777 and then downgraded to ERC20', upgradedTo777AndThenDowngradedTo20);

  runERC20ApproveExtensionTests('non-upgradeable sand approve extenstion', nonUpgradeableSand);
  runERC20ApproveExtensionTests('upgradeable sand approve extenstion', upgradableSand);
  runERC20ApproveExtensionTests('erc777 upgradeable sand approve extenstion', erc777UpgradedFrom20);
  runERC20ApproveExtensionTests('upgradedTo777AndThenDowngradedTo20 approve extension', upgradedTo777AndThenDowngradedTo20);

  runMetaTxExtensionTests('upgradeable sand 20 meta-tx extenstion', upgradableSand);

  runMetaTxExtensionTests('upgradeable sand 777 meta-tx extenstion', erc777UpgradedFrom20, true);

  runERC777Tests('SAND upgraded to ERC777', erc777UpgradedFrom20);

  runERC777Tests('non upgradeable Sand777', nonUpgradeableSand777);

  failERC777Tests('SAND upgraded to ERC777 and then downgraded to ERC20', upgradedTo777AndThenDowngradedTo20);
}
