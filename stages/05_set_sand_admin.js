const Web3 = require('web3');
const rocketh = require('rocketh');
const {
  tx,
  getDeployedContract,
} = require('rocketh-web3')(rocketh, Web3); 

const gas = 6500000;

module.exports = async ({namedAccounts}) => {
  const {
    deployer,
    sandOwner,
  } = namedAccounts; 

  let actualSandOwner = sandOwner;
  const multiSig = getDeployedContract('MultiSig1'); // TODO use dynamic namedAccount
  if(multiSig) {
    actualSandOwner = multiSig.options.address;
  }

  const sandContract = getDeployedContract('Sand');
  await tx({from: deployer, gas}, sandContract, "changeAdmin", actualSandOwner);
}
