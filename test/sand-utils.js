const BN = require('bn.js');
const Abi = require('web3-eth-abi');
const sigUtil = require('eth-sig-util');

// ERC20 ////////////////////////////////////

const TransferEvent = Abi.encodeEventSignature('Transfer(address,address,uint256)');
const ApproveEvent = Abi.encodeEventSignature('Approval(address,address,uint256)');

function tx(contract, functionName, options, ...args) {
  return contract.methods[functionName](...args).send(options);
}

function encodeCall(contract, functionName, ...args) {
  return contract.methods[functionName](...args).encodeABI();
}

function transfer(contract, to, amount, options) {
  return contract.methods.transfer(to, amount).send(options);
}

function transferFrom(contract, from, to, amount, options) {
  return contract.methods.transferFrom(from, to, amount).send(options);
}

function burn(contract, amount, options) {
  return contract.methods.burn(amount).send(options);
}

function approve(contract, spender, value, options) {
  return contract.methods.approve(spender, value).send(options);
}

async function getBalance(contract, account) {
  const balanceString = await contract.methods.balanceOf(account).call({from: account});
  return new BN(balanceString);
}

async function getAllowance(contract, owner, spender) {
  const allowanceString = await contract.methods.allowance(owner, spender).call({from: owner});
  return new BN(allowanceString);
}

// ERC777 ///////////////////////////

const AuthorizedOperatorEvent = Abi.encodeEventSignature('AuthorizedOperator(address,address)');
const RevokedOperatorEvent = Abi.encodeEventSignature('RevokedOperator(address,address)');
const BurnedEvent = Abi.encodeEventSignature('Burned(address,address,uint256,bytes,bytes)');
const MintedEvent = Abi.encodeEventSignature('Minted(address,address,uint256,bytes)');
const SentEvent = Abi.encodeEventSignature('Sent(address,address,address,uint256,bytes,bytes)');

function authorizeOperator(contract, operator, options) {
  return contract.methods.authorizeOperator(operator).send(options);
}

function revokeOperator(contract, operator, options) {
  return contract.methods.revokeOperator(operator).send(options);
}

function isOperatorFor(contract, operator, tokenHolder) {
  return contract.methods.isOperatorFor(operator, tokenHolder).call({from: operator});
}

function send(contract, to, amount, data, options) {
  return contract.methods.send(to, amount, data).send(options);
}

function operatorSend(contract, from, to, amount, data, operatorData, options) {
  return contract.methods.operatorSend(from, to, amount, data, operatorData).send(options);
}

function signEIP712MetaTx(signingAcount, contractAddress, chainId, {from, to, amount, data, nonce, gasPrice, gasLimit, tokenGasPrice, relayer}, use777) {
  const privateKeyAsBuffer = Buffer.from(signingAcount.privateKey.substr(2), 'hex');
  const data712 = {
    types: {
      EIP712Domain: [
        {
          name: 'name',
          type: 'string'
        },
        {
          name: 'version',
          type: 'string'
        },
        {
          name: 'chainId',
          type: 'uint256'
        },
        {
          name: 'verifyingContract',
          type: 'address'
        }
      ],
      ERC20MetaTransaction: [
        {
          name: 'from',
          type: 'address'
        },
        {
          name: 'to',
          type: 'address'
        },
        {
          name: 'amount',
          type: 'uint256'
        },
        {
          name: 'data',
          type: 'bytes'
        },
        {
          name: 'nonce',
          type: 'uint256'
        },
        {
          name: 'gasPrice',
          type: 'uint256'
        },
        {
          name: 'gasLimit',
          type: 'uint256'
        },
        {
          name: 'tokenGasPrice',
          type: 'uint256'
        },
        {
          name: 'relayer',
          type: 'address'
        }
      ],
      ERC777MetaTransaction: [
        {
          name: 'from',
          type: 'address'
        },
        {
          name: 'to',
          type: 'address'
        },
        {
          name: 'amount',
          type: 'uint256'
        },
        {
          name: 'data',
          type: 'bytes'
        },
        {
          name: 'nonce',
          type: 'uint256'
        },
        {
          name: 'gasPrice',
          type: 'uint256'
        },
        {
          name: 'gasLimit',
          type: 'uint256'
        },
        {
          name: 'tokenGasPrice',
          type: 'uint256'
        },
        {
          name: 'relayer',
          type: 'address'
        }
      ]
    },
    primaryType: use777 ? 'ERC777MetaTransaction' : 'ERC20MetaTransaction',
    domain: {
      name: 'The Sandbox 3D',
      version: '1',
      chainId: chainId,
      verifyingContract: contractAddress
    },
    message: {
      from: from || signingAcount.address,
      to,
      amount,
      data,
      nonce,
      gasPrice,
      gasLimit,
      tokenGasPrice,
      relayer
    }
  };
  return sigUtil.signTypedData(privateKeyAsBuffer, {data: data712});
}

function signEIP712Approval(signingAcount, contractAddress, chainId, {messageId, target, amount, from}) {
  const privateKeyAsBuffer = Buffer.from(signingAcount.privateKey.substr(2), 'hex');
  const data = {
    types: {
      EIP712Domain: [
        {
          name: 'name',
          type: 'string'
        },
        {
          name: 'version',
          type: 'string'
        },
        {
          name: 'chainId',
          type: 'uint256'
        },
        {
          name: 'verifyingContract',
          type: 'address'
        }
      ],
      Approve: [
        {
          name: 'from',
          type: 'address'
        },
        {
          name: 'messageId',
          type: 'uint256'
        },
        {
          name: 'target',
          type: 'address'
        },
        {
          name: 'amount',
          type: 'uint256'
        }
      ]
    },
    primaryType: 'Approve',
    domain: {
      name: 'The Sandbox 3D',
      version: '1',
      chainId: chainId,
      verifyingContract: contractAddress
    },
    message: {
      from: from || signingAcount.address,
      messageId,
      target,
      amount
    }
  };
  return sigUtil.signTypedData(privateKeyAsBuffer, {data});
}


function executePreApprovalMetaTx(signingAccount, tokenContract, chainId, options, {from, nonce, gasPrice, gasLimit, tokenGasPrice, relayer, tokenDeposit, signedOnBehalf, use777}, receiver, amount, methodName, ...args) {
  let callData = '0x';
  let receiverAddress = receiver;
  if(typeof receiver != 'string') {
    callData = receiver.methods[methodName](...args).encodeABI();
    receiverAddress = receiver.options.address;
  }
  const signature = signEIP712MetaTx(signingAccount, tokenContract.options.address, chainId, {from, to: receiverAddress, amount, data: callData, nonce, gasPrice, gasLimit, tokenGasPrice, relayer}, use777);
  return tx(tokenContract, use777 ? "executeERC777MetaTx" : "executeERC20MetaTx", options, from || signingAccount.address, receiverAddress, amount, callData, [nonce,gasPrice,gasLimit,tokenGasPrice], relayer, signature, tokenDeposit, signedOnBehalf? true : false);
}

async function executePreApprovalMetaTxViaBasicSignature(web3, signer, tokenContract, options, {from, nonce, gasPrice, gasLimit, tokenGasPrice, relayer, tokenDeposit, signedOnBehalf, use777}, receiver, amount, methodName, ...args) {
  let callData = '0x';
  let receiverAddress = receiver;
  if(typeof receiver != 'string') {
    callData = receiver.methods[methodName](...args).encodeABI();
    receiverAddress = receiver.options.address;
  }
  const erc20MetaTxTypeHash = web3.utils.soliditySha3({type:'string', value:'ERC20MetaTransaction(address from,address to,uint256 amount,bytes data,uint256 nonce,uint256 gasPrice,uint256 gasLimit,uint256 tokenGasPrice,address relayer)'});
  const erc777MetaTxTypeHash = web3.utils.soliditySha3({type:'string', value:'ERC777MetaTransaction(address from,address to,uint256 amount,bytes data,uint256 nonce,uint256 gasPrice,uint256 gasLimit,uint256 tokenGasPrice,address relayer)'});
  const hash = web3.utils.soliditySha3(
    {type: 'address', value: tokenContract.options.address},
    {type: 'bytes32', value: use777 ? erc777MetaTxTypeHash : erc20MetaTxTypeHash},
    {type: 'address', value: from || signer},
    {type: 'address', value: receiverAddress},
    {type: 'uint256', value: amount},
                                                // \/ this is required since web util solodySha3 throw on empty bytes (this is the keccak of empty bytes))
    {type: 'bytes32', value: callData == '0x' ? '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470' : web3.utils.soliditySha3({type:'bytes', value: callData})},
    {type: 'uint256', value: nonce},
    {type: 'uint256', value: gasPrice},
    {type: 'uint256', value: gasLimit},
    {type: 'uint256', value: tokenGasPrice},
    {type: 'address', value: relayer},
  );
  const signature = await web3.eth.sign(hash, signer);
  return tx(tokenContract, use777 ? "executeERC777MetaTxViaBasicSignature" : "executeERC20MetaTxViaBasicSignature", options, from || signer, receiverAddress, amount, callData, [nonce,gasPrice,gasLimit,tokenGasPrice], relayer, signature, tokenDeposit, signedOnBehalf? true : false);
}

module.exports = {
  TransferEvent,
  ApproveEvent,
  transfer,
  transferFrom,
  approve,
  getBalance,
  getAllowance,
  AuthorizedOperatorEvent,
  RevokedOperatorEvent,
  BurnedEvent,
  MintedEvent,
  SentEvent,
  authorizeOperator,
  revokeOperator,
  isOperatorFor,
  send,
  operatorSend,
  burn,
  tx,
  encodeCall,
  // executePreTransferMetaTx,
  executePreApprovalMetaTx,
  executePreApprovalMetaTxViaBasicSignature,
  signEIP712MetaTx,
  signEIP712Approval
};
