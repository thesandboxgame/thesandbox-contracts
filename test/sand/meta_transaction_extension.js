const tap = require('tap');
const assert = require('assert');
const BN = require('bn.js');

const rocketh = require('rocketh');
const accounts = rocketh.accounts;

const zeroAddress = '0x0000000000000000000000000000000000000000';

const {
    gas,
    expectThrow,
    toChecksumAddress,
    deployContract,
    instantiateContract,
    tx,
    encodeCall,
    getEventsFromReceipt,
    encodeEventSignature,
} = require('../utils');
  
const {
    executeMetaTx,
    executeMetaTxViaBasicSignature,
} = require('../sand-utils');

const {
  transfer,
  getERC20Balance,
} = require('../erc20');

const {
  runERC20Tests,
} = require('../erc20_tests');

const {
    runERC777Tests,
    failERC777Tests,
} = require('../erc777_tests');

const creator = toChecksumAddress(accounts[0]);
const sandOwner = creator;
const user1 = toChecksumAddress(accounts[1]);
const user2 = toChecksumAddress(accounts[2]);
const user3 = toChecksumAddress(accounts[3]);
const operator = toChecksumAddress(accounts[4]);
const executor = toChecksumAddress(accounts[5]);
const chainId = rocketh.chainId;

const MetaTxEvent = encodeEventSignature('MetaTx(address,uint256,bool,bytes)');

const signingAcount = {
  address: '0xFA8A6079E7B85d1be95B6f6DE1aAE903b6F40c00',
  privateKey: '0xeee5270a5c46e5b92510d70fa4d445a8cdd5010dde5b1fccc6a2bd1a9df8f5c0'
};

const otherSigner = {
  address: '0x75aE6abE03070a906d7a9d5C1607605DE73a0880',
  privateKey: '0x3c42a6c587e8a82474031cc06f1e6af7f5301bb2417b89d98eb3023d0ce659f6'
};


function runMetaTxExtensionTests(title, resetContract, use777) {
  tap.test(title, async (t) => {
    // t.runOnly = true;
    const initialSand = new BN('1000000000000000000000000');
    let contract;
    let receiverContract;
    t.beforeEach(async () => {
      contract = await resetContract();
      if(use777) {
        receiverContract = await deployContract(creator, 'Sand777Receiver', contract.options.address, true);
      } else {
        receiverContract = await deployContract(creator, 'ERC20MetaTxReceiver', contract.options.address, 150);
      }
      
      await transfer(contract, signingAcount.address, initialSand.toString(10), {from: sandOwner, gas});
      // console.log('balance ', (await getERC20Balance(contract, signingAcount.address)).toString(10));
    });

    t.test('executeMetaTx simple transfer', async () => {
      const receipt = await executeMetaTx(signingAcount,
        contract,
        chainId,
        {from:executor, gas, gasPrice:1},
        {nonce:1, gasPrice:1, txGas: 2000000, gasLimit:2000000+112000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, use777},
        user2,
        150);

      const signerBalance = await getERC20Balance(contract, signingAcount.address);
      const user2Balance = await getERC20Balance(contract, user2);
      
      const tokenSpentForGas = new BN(37941);
      const expectedSandLeftForSigner = initialSand.sub(new BN('150')).sub(tokenSpentForGas)
      assert.ok(signerBalance, expectedSandLeftForSigner, 1000);
      assert.equal(user2Balance.toString(10), '150');        
    });

    t.test('executeMetaTx simple transfer fail if wrong signature', async () => {
      await expectThrow(executeMetaTx(signingAcount,
        contract,
        chainId,
        {from:executor, gas, gasPrice:1},
        {fakeSig: true, nonce:1, gasPrice:1, txGas: 2000000, gasLimit:2000000+112000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, use777},
        user2,
        150));
    });

    t.test('executeMetaTx simple transfer via basic signature', async () => {
      await transfer(contract, user1, new BN('1000000000000000000000000').toString(10), {from: sandOwner, gas});
      const user1InitialSand = await getERC20Balance(contract, user1);
      const receipt = await executeMetaTxViaBasicSignature(
        user1,
        contract,
        {from:executor, gas, gasPrice:1},
        {nonce:1, gasPrice:1, txGas: 2000000, gasLimit:2000000+112000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, use777},
        user2,
        150);

      const user1Balance = await getERC20Balance(contract, signingAcount.address);
      const user2Balance = await getERC20Balance(contract, user2);
      
      const tokenSpentForGas = new BN(37941);
      const expectedSandLeftForUser1 = user1InitialSand.sub(new BN('150')).sub(tokenSpentForGas)
      assert.ok(user1Balance, expectedSandLeftForUser1, 1000);
      assert.equal(user2Balance.toString(10), '150');        
    });

    t.test('executeMetaTx simple transfer via basic signature fails if wrong signature', async () => {
      await transfer(contract, user1, new BN('1000000000000000000000000').toString(10), {from: sandOwner, gas});
      await expectThrow(executeMetaTxViaBasicSignature(
        user1,
        contract,
        {from:executor, gas, gasPrice:1},
        {fakeSig: true, nonce:1, gasPrice:1, txGas: 2000000, gasLimit:2000000+112000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, use777},
        user2,
        150));
    });

    t.test('executeMetaTx simple transfer via identity contract', async () => {
      const IdentityContract = await deployContract(creator, 'ERC1271Wallet', signingAcount.address);
      const identityAddress = IdentityContract.options.address;
      await transfer(contract, identityAddress, initialSand.toString(10), {from: sandOwner, gas});
      const receipt = await executeMetaTx(signingAcount,
        contract,
        chainId,
        {from:executor, gas, gasPrice:1},
        {from: identityAddress, nonce:1, gasPrice:1, txGas:2000000, gasLimit:2000000+112000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, signedOnBehalf: true, use777},
        user2,
        150);

      const identityBalance = await getERC20Balance(contract, identityAddress);
      const user2Balance = await getERC20Balance(contract, user2);
      
      const tokenSpentForGas = new BN(37941);
      const expectedSandLeftForIdentity = initialSand.sub(new BN('150')).sub(tokenSpentForGas)
      assert.ok(identityBalance, expectedSandLeftForIdentity, 1000);
      assert.equal(user2Balance.toString(10), '150');        
    });

    t.test('executeMetaTx simple transfer via identity contract fails when not approved', async () => {
      const IdentityContract = await deployContract(creator, 'ERC1271Wallet', otherSigner.address);
      const identityAddress = IdentityContract.options.address;
      await transfer(contract, identityAddress, initialSand.toString(10), {from: sandOwner, gas});
      await expectThrow(executeMetaTx(signingAcount,
        contract,
        chainId,
        {from:executor, gas, gasPrice:1},
        {from: identityAddress, nonce:1, gasPrice:1, txGas:2000000, gasLimit:2000000+112000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, signedOnBehalf: true, use777},
        user2,
        150));
    });

    t.test('executeMetaTx simple transfer via identity contract fails when wrong sig', async () => {
      const IdentityContract = await deployContract(creator, 'ERC1271Wallet', signingAcount.address);
      const identityAddress = IdentityContract.options.address;
      await transfer(contract, identityAddress, initialSand.toString(10), {from: sandOwner, gas});
      await expectThrow(executeMetaTx(signingAcount,
        contract,
        chainId,
        {from:executor, gas, gasPrice:1},
        {fakeSig: true, from: identityAddress, nonce:1, gasPrice:1, txGas:2000000, gasLimit:2000000+112000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, signedOnBehalf: true, use777},
        user2,
        150));
    });

    // if(use777) {
    //   // TODO allow
    //   return;
    // }
    t.test('executeMetaTx transfer and call', async () => {
      const receiverAddress = receiverContract.options.address;
      const receipt = await executeMetaTx(signingAcount,
        contract,
        chainId,
        {from:executor, gas, gasPrice:1},
        {nonce:1, gasPrice:1, txGas: 2000000, gasLimit:2000000+112000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, use777},
        receiverContract,
        150,
        'receiveMeta', signingAcount.address, 150, 'test', 111);
      
      // console.log(JSON.stringify(receipt, null, '  '));

      const signerBalance = await getERC20Balance(contract, signingAcount.address);
      const receiverBalance = await getERC20Balance(contract, receiverAddress);
      
      const tokenSpentForGas = new BN(37658);
      const expectedSandLeftForSigner = initialSand.sub(new BN('150')).sub(tokenSpentForGas)
      assert.ok(signerBalance, expectedSandLeftForSigner, 1000);
      assert.equal(receiverBalance.toString(10), '150');        
    });

    t.test('executeMetaTx transfer and call will result in fail inner call if trying to transfer more than signed', async () => {
      const receiverAddress = receiverContract.options.address;
      const receipt = await executeMetaTx(signingAcount,
        contract,
        chainId,
        {from:executor, gas, gasPrice:1},
        {nonce:1, gasPrice:1, txGas: 2000000, gasLimit:2000000+112000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, use777},
        receiverContract,
        150,
        'receiveMeta', signingAcount.address, 150 + 1, 'test', 111);
      
      const receiverBalance = await getERC20Balance(contract, receiverAddress);
      assert.equal(receiverBalance.toString(10), '0');        
    });

    t.test('executeMetaTx transfer and call via basic signature', async () => {
      await transfer(contract, user1, new BN('1000000000000000000000000').toString(10), {from: sandOwner, gas});
      const user1InitialSand = await getERC20Balance(contract, user1);
      const receiverAddress = receiverContract.options.address;
      const receipt = await executeMetaTxViaBasicSignature(
        user1,
        contract,
        {from:executor, gas, gasPrice:1},
        {nonce:1, gasPrice:1, txGas: 2000000, gasLimit:2000000+112000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, use777},
        receiverContract,
        150,
        'receiveMeta', user1, 150, 'test', 111);

      const user1Balance = await getERC20Balance(contract, signingAcount.address);
      const receiverBalance = await getERC20Balance(contract, receiverAddress);
      
      const tokenSpentForGas = new BN(37941);
      const expectedSandLeftForUser1 = user1InitialSand.sub(new BN('150')).sub(tokenSpentForGas)
      assert.ok(user1Balance, expectedSandLeftForUser1, 1000);
      assert.equal(receiverBalance.toString(10), '150');        
    });

    t.test('executeMetaTx transfer and call via basic signature and identity contract', async () => {
      const receiverAddress = receiverContract.options.address;
      const IdentityContract = await deployContract(creator, 'ERC1271Wallet', user1);
      const identityAddress = IdentityContract.options.address;
      await transfer(contract, identityAddress, initialSand.toString(10), {from: sandOwner, gas});
      const identityInitialSand = await getERC20Balance(contract, user1);
      const receipt = await executeMetaTxViaBasicSignature(
        user1,
        contract,
        {from:executor, gas, gasPrice:1},
        {from: identityAddress, nonce:1, gasPrice:1, txGas:2000000, gasLimit:2000000+112000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, signedOnBehalf: true, use777},
        receiverContract,
        150,
        'receiveMeta', identityAddress, 150, 'test', 111);

      const identityBalance = await getERC20Balance(contract, identityAddress);
      const receiverBalance = await getERC20Balance(contract, receiverAddress);
      
      const tokenSpentForGas = new BN(37941);
      const expectedSandLeftForIdentity = identityInitialSand.sub(new BN('150')).sub(tokenSpentForGas)
      assert.ok(identityBalance, expectedSandLeftForIdentity, 1000);
      assert.equal(receiverBalance.toString(10), '150');        
    });

    t.test('executeMetaTx transfer and call via basic signature and identity contract fails if not approved', async () => {
      const receiverAddress = receiverContract.options.address;
      const IdentityContract = await deployContract(creator, 'ERC1271Wallet', user3);
      const identityAddress = IdentityContract.options.address;
      await transfer(contract, identityAddress, initialSand.toString(10), {from: sandOwner, gas});
      const identityInitialSand = await getERC20Balance(contract, user1);
      await expectThrow(executeMetaTxViaBasicSignature(
        user1,
        contract,
        {from:executor, gas, gasPrice:1},
        {from: identityAddress, nonce:1, gasPrice:1, txGas: 2000000, gasLimit:2000000+112000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, signedOnBehalf: true, use777},
        receiverContract,
        150,
        'receiveMeta', user1, 150, 'test', 111));      
    });

    t.test('executeMetaTx transfer and call via identity contract', async () => {
      const receiverAddress = receiverContract.options.address;
      const IdentityContract = await deployContract(creator, 'ERC1271Wallet', signingAcount.address);
      const identityAddress = IdentityContract.options.address;
      await transfer(contract, identityAddress, initialSand.toString(10), {from: sandOwner, gas});
      await executeMetaTx(signingAcount,
        contract,
        chainId,
        {from:executor, gas, gasPrice:1},
        {from: identityAddress, nonce:1, gasPrice:1, txGas: 2000000, gasLimit:2000000+112000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, signedOnBehalf: true, use777},
        receiverContract,
        150,
        'receiveMeta', identityAddress, 150, 'test', 111); //address does not matter here
      
      const identityBalance = await getERC20Balance(contract, identityAddress);
      const receiverBalance = await getERC20Balance(contract, receiverAddress);
      
      const tokenSpentForGas = new BN(37658);
      const expectedSandLeftForIdentity = initialSand.sub(new BN('150')).sub(tokenSpentForGas)
      assert.ok(identityBalance, expectedSandLeftForIdentity, 1000);
      assert.equal(receiverBalance.toString(10), '150');        
    });

    t.test('executeMetaTx transfer and call via identity contract fail inner call if trying to transfer more than signed', async () => {
      const receiverAddress = receiverContract.options.address;
      const IdentityContract = await deployContract(creator, 'ERC1271Wallet', signingAcount.address);
      const identityAddress = IdentityContract.options.address;
      await transfer(contract, identityAddress, initialSand.toString(10), {from: sandOwner, gas});
      await executeMetaTx(signingAcount,
        contract,
        chainId,
        {from:executor, gas, gasPrice:1},
        {from: identityAddress, nonce:1, gasPrice:1, txGas: 2000000, gasLimit:2000000+112000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, signedOnBehalf: true, use777},
        receiverContract,
        150,
        'receiveMeta', identityAddress, 150 + 1, 'test', 111); //address does not matter here
      
      const receiverBalance = await getERC20Balance(contract, receiverAddress);
      assert.equal(receiverBalance.toString(10), '0');        
    });

    t.test('executeMetaTx transfer and call via identity contract fails if not approved', async () => {
      const receiverAddress = receiverContract.options.address;
      const IdentityContract = await deployContract(creator, 'ERC1271Wallet', otherSigner.address);
      const identityAddress = IdentityContract.options.address;
      await transfer(contract, identityAddress, initialSand.toString(10), {from: sandOwner, gas});
      await expectThrow(executeMetaTx(signingAcount,
        contract,
        chainId,
        {from:executor, gas, gasPrice:1},
        {from: identityAddress, nonce:1, gasPrice:1, txGas:2000000, gasLimit:2000000+112000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, signedOnBehalf: true, use777},
        receiverContract,
        150,
        'receiveMeta', signingAcount.address, 150, 'test', 111)); //address does not matter here
    });

    t.test('executeMetaTx transfer and call GasDrain', async () => {
      const txGas = 5000000;
      const gasProvided = txGas + 900000;
      const GasDrain = await deployContract(creator, 'GasDrain');
      const receiverAddress = GasDrain.options.address;
      const receipt = await executeMetaTx(signingAcount,
        contract,
        chainId,
        {from:executor, gas: gasProvided, gasPrice:1},
        {nonce:1, gasPrice:1, txGas, gasLimit:txGas+112000, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, use777},
        GasDrain,
        150,
        'receiveSpecificERC20', signingAcount.address, 150, txGas);
      
      // console.log(JSON.stringify(receipt, null, '  '));
    });

    t.test('executing with not enough gas should result in the relayer\'s tx failing', async() => {
      const GasDrain = await deployContract(creator, 'GasDrain');
      const txGas = 5000000;
      const gasProvided = txGas+112000;
      const gasLimit = txGas+112000;

      await expectThrow(executeMetaTx(signingAcount,
        contract,
        chainId,
        {from:executor, gas: gasProvided, gasPrice:1},
        {nonce:1, gasPrice:1, txGas, gasLimit, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, use777},
        GasDrain,
        150,
        'receiveSpecificERC20', signingAcount.address, 150, txGas));
    });

    t.test('executing with just NOT enough gas should result in the relayer\'s tx failing', async() => {
      const GasDrain = await deployContract(creator, 'GasDrain');
      const txGas = 5000000;
      const gasProvided = Math.floor((txGas * 64) / 63) + 112000 + 58150 -50; // 58151 works sporadically // hence the -50
      const gasLimit = txGas+112000;
      // console.log('gasProvided', gasProvided);

      await expectThrow(executeMetaTx(signingAcount,
          contract,
          chainId,
          {from:executor, gas: gasProvided, gasPrice:1},
          {nonce:1, gasPrice:1, txGas, gasLimit, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, use777},
          GasDrain,
          150,
          'receiveSpecificERC20', signingAcount.address, 150, txGas));
    });


    // t.only('executing with just enough gas should result in the meta tx success', async() => {
    //   const GasDrain = await deployContract(creator, 'GasDrain');
    //   const txGas = 5000000;
    //   const gasProvided = Math.floor((txGas * 64) / 63) + 112000 + 58151 + 50; // 58150 fails sporadically // hence the +50
    //   const gasLimit = txGas+112000;
    //   // console.log('gasProvided', gasProvided);

    //   await transfer(contract, executor, 1, {from: sandOwner, gas}); // TO ENSURE NO 20000 storage cost

    //   const receipt = await executeMetaTx(signingAcount,
    //     contract,
    //     chainId,
    //     {from:executor, gas: gasProvided, gasPrice:1},
    //     {nonce:1, gasPrice:1, txGas, gasLimit, tokenGasPrice:1, relayer: zeroAddress, tokenDeposit: executor, use777},
    //     GasDrain,
    //     150,
    //     'receiveSpecificERC20', signingAcount.address, 150, txGas);

    //   const events = await getEventsFromReceipt(contract, MetaTxEvent, receipt);
    //   assert.equal(events.length, 1);
    //   const metaTxEvent = events[0].returnValues;
    //   assert(metaTxEvent[2]);

    //   console.log(receipt.gasUsed);
    //   console.log(JSON.stringify(receipt,null, '  '));
    // });

  });
}

module.exports = {
    runMetaTxExtensionTests
}